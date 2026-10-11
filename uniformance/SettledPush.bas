Attribute VB_Name = "SettledPush"
'=============================================================
' MODULE: SettledPush
' PURPOSE: Stop pushing "first-read" PHD/Uniformance values that
'          later turn out to be spikes. Before every push this
'          module re-reads PHD until two consecutive reads agree
'          (data has SETTLED), then screens large steps in the
'          totals. If data is not settled, the cycle is skipped
'          (HOLD) and the dashboard simply keeps the last good
'          point until the next cycle.
'
' USAGE (see README.md): called from Module1.PushNow:
'     If Not SettledPush.WaitForSettledData(why) Then ... skip
'=============================================================
Option Explicit

' ---------------- TUNING ----------------
Private Const SHEET_NAME   As String = "Sheet1"
Private Const MAX_READS    As Long = 6        ' max PHD reads per cycle
Private Const READ_GAP_SEC As Long = 8        ' pause between reads
Private Const REL_TOL      As Double = 0.01   ' two reads "agree" if within 1 %
Private Const ABS_TOL      As Double = 0.02   ' ...or within this (tiny values, e.g. bar)
Private Const JUMP_FRAC    As Double = 0.25   ' step in Total Gen/Con that needs confirming
Private Const CONFIRM_FRAC As Double = 0.05   ' two cycles within 5 % = a real shift
Private Const MAX_HOLDS    As Long = 3        ' after this many unsettled cycles push anyway
Private Const CLOCK_CELL   As String = "M1"     ' cycle clock: Sheet1!D1 reads this instead of NOW()
Private Const LAG_CELL     As String = "N1"     ' lag in minutes: Sheet1!D1 reads this too
Private Const LIVE_LAG_MIN  As Long = 2        ' provisional (live) pass reads data this many min old
Private Const FINAL_LAG_MIN As Long = 15       ' final pass reads data this many min old (>= Uniformance delay)
' ----------------------------------------

Private haveLast   As Boolean
Private lastGen    As Double
Private lastCon    As Double
Private pendingSet As Boolean
Private pendingGen As Double
Private pendingCon As Double
Private holdCount  As Long
Private snapAddr(1 To 80) As String

' Returns True when it is safe to push. msg explains what happened.
Public Function WaitForSettledData(ByRef msg As String) As Boolean
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets(SHEET_NAME)

    ' Freeze the clock for this cycle so the PHD time window cannot move between reads.
    ws.Range(CLOCK_CELL).Value = Now

    Dim prev As Variant, cur As Variant
    Dim prevTs As Double, curTs As Double
    Dim i As Long, k As Long, settled As Boolean
    Dim why As String

    For i = 1 To MAX_READS
        ForceRefresh
        cur = Snap(ws)
        curTs = StampOf(ws)
        If i > 1 Then
            If Not IsArray(cur) Or Not IsArray(prev) Then
                why = "error value in sheet"
            ElseIf curTs <> prevTs Then
                why = "time window moved"
            Else
                k = WorstIndex(prev, cur)
                If k = 0 Then
                    settled = True
                    Exit For
                End If
                why = snapAddr(k) & " " & Format(prev(k), "0.0") & "->" & Format(cur(k), "0.0")
            End If
        End If
        prev = cur
        prevTs = curTs
        If i < MAX_READS Then Application.Wait Now + TimeSerial(0, 0, READ_GAP_SEC)
    Next i

    If Not settled Then
        holdCount = holdCount + 1
        If holdCount <= MAX_HOLDS Then
            msg = "not settled after " & MAX_READS & " reads [" & why & "] (hold " & holdCount & "/" & MAX_HOLDS & ")"
            WaitForSettledData = False
            Exit Function
        End If
        msg = "FORCED push after " & MAX_HOLDS & " unsettled cycles [" & why & "]"
    Else
        msg = "settled in " & i & " reads"
    End If
    holdCount = 0

    If Not settled Then
        ' forced push: skip the step check so the dashboard never freezes
        CommitLast ws
        WaitForSettledData = True
        Exit Function
    End If

    If Not StepOK(ws, msg) Then
        WaitForSettledData = False
        Exit Function
    End If
    WaitForSettledData = True
End Function

' ---------------------------------------------------------------
'  Two-pass cycle (called from Module1.PushNow)
' ---------------------------------------------------------------
' FINAL pass: old data (FINAL_LAG_MIN) that has had time to arrive, with the settle gate.
Public Function PrepareFinal(ByRef msg As String) As Boolean
    ThisWorkbook.Sheets(SHEET_NAME).Range(LAG_CELL).Value = FINAL_LAG_MIN
    PrepareFinal = WaitForSettledData(msg)
End Function

' LIVE pass: newest data (LIVE_LAG_MIN), one refresh, no gate. Marked provisional in Supabase.
' Leaves the sheet showing live values.
Public Sub PrepareLive()
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets(SHEET_NAME)
    ' keep the cycle clock written by the final pass, so live buckets line up with final buckets
    If ws.Range(CLOCK_CELL).HasFormula Then ws.Range(CLOCK_CELL).Value = Now
    ws.Range(LAG_CELL).Value = LIVE_LAG_MIN
    ForceRefresh
    ' Short pause so PHD can finish filling the sheet before it is read (the BMS variant of Module1
    ' used the same 3 s wait after Application.Calculate).
    Application.Wait Now + TimeSerial(0, 0, 3)
End Sub

' Re-run every PHDGetData call. CalculateFull is needed because with
' an unchanged time window Excel would otherwise reuse the cached
' result and never see late-arriving data.
Private Sub ForceRefresh()
    On Error Resume Next
    Application.CalculateFull
    Application.CalculateUntilAsyncQueriesDone
    DoEvents
    On Error GoTo 0
End Sub

' Flat array of every value that gets pushed. Returns False if any cell is an error.
Private Function Snap(ws As Worksheet) As Variant
    Dim addrs As Variant, a As Variant, c As Range
    Dim v() As Double, n As Long
    ReDim v(1 To 80)
    addrs = Array("H4:H17", "H21:H23", "H25:H30", "H32:H43", "H45:H47")
    For Each a In addrs
        For Each c In ws.Range(a).Cells
            If IsError(c.Value) Then
                Snap = False
                Exit Function
            End If
            n = n + 1
            snapAddr(n) = c.Address(False, False)
            If IsNumeric(c.Value) And Not IsEmpty(c.Value) Then v(n) = CDbl(c.Value) Else v(n) = 0
        Next c
    Next a
    ReDim Preserve v(1 To n)
    Snap = v
End Function

Private Function StampOf(ws As Worksheet) As Double
    If IsDate(ws.Range("H3").Value) Then StampOf = CDbl(CDate(ws.Range("H3").Value))
End Function

' Index of the value that differs most between two reads (0 = all values agree).
Private Function WorstIndex(a As Variant, b As Variant) As Long
    Dim i As Long, d As Double, tol As Double, m As Double
    Dim ratio As Double, best As Double
    For i = LBound(a) To UBound(a)
        d = Abs(a(i) - b(i))
        m = Abs(a(i))
        If Abs(b(i)) > m Then m = Abs(b(i))
        tol = REL_TOL * m
        If tol < ABS_TOL Then tol = ABS_TOL
        If d > tol Then
            ratio = d / tol
            If ratio > best Then
                best = ratio
                WorstIndex = i
            End If
        End If
    Next i
End Function

' A big step in Total Generation / Consumption must appear in two
' consecutive settled cycles before it is pushed (kills one-off spikes
' that PHD itself has stored, while a real trip still shows within 1 cycle).
Private Function StepOK(ws As Worksheet, ByRef msg As String) As Boolean
    Dim g As Double, c As Double
    g = CDbl(ws.Range("H21").Value)
    c = CDbl(ws.Range("H22").Value)

    If Not haveLast Then
        CommitLast ws
        StepOK = True
        Exit Function
    End If
    If Near(g, lastGen, JUMP_FRAC) And Near(c, lastCon, JUMP_FRAC) Then
        CommitLast ws
        StepOK = True
        Exit Function
    End If
    If pendingSet And Near(g, pendingGen, CONFIRM_FRAC) And Near(c, pendingCon, CONFIRM_FRAC) Then
        CommitLast ws                       ' confirmed twice -> real shift
        msg = msg & "; big step confirmed"
        StepOK = True
        Exit Function
    End If
    pendingSet = True
    pendingGen = g
    pendingCon = c
    msg = "HOLD big step in totals - waiting for confirmation next cycle"
    StepOK = False
End Function

Private Sub CommitLast(ws As Worksheet)
    On Error Resume Next
    lastGen = CDbl(ws.Range("H21").Value)
    lastCon = CDbl(ws.Range("H22").Value)
    haveLast = True
    pendingSet = False
    On Error GoTo 0
End Sub

Private Function Near(x As Double, y As Double, frac As Double) As Boolean
    Dim m As Double
    m = Abs(x)
    If Abs(y) > m Then m = Abs(y)
    If m < 1 Then m = 1
    Near = (Abs(x - y) <= frac * m)
End Function
