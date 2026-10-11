Attribute VB_Name = "H2Push"
'=============================================================
' MODULE: H2Push   (replaces PushH2Balance; keep the old one until this works)
' PURPOSE: Push the H2 balance block (Sheet1!H20:H47) to Supabase table
'          h2_material_balance as ONE row per snapshot_time:
'              isFinal = False -> provisional live row
'              isFinal = True  -> settled row, overwrites the provisional one
'          Returns the HTTP status (201/200 = ok, 0 = skipped, <0 = VBA/network error).
'
' SETUP (30 seconds): copy the SUPABASE_URL and SUPABASE_KEY lines from Module1
'          and paste them over the two lines marked PASTE below.
'=============================================================
Option Explicit

Private Const SUPABASE_URL As String = "PASTE_URL_FROM_MODULE1"            ' <-- PASTE
Private Const SUPABASE_KEY As String = "PASTE_KEY_FROM_MODULE1"            ' <-- PASTE
Private Const TABLE_NAME   As String = "h2_material_balance"
Private Const PROXY_SERVER As String = "refproxy:8080"

' SWITCH: leave False until the Supabase SQL (spike filter, provisional/final, upsert guard) has been
' Supabase SQL already applied (10-Oct-2026): True = provisional + final mode.
Private Const SQL_READY As Boolean = True

Public LastError As String

Public Function Push(ByVal isFinal As Boolean) As Long
    Dim ws As Worksheet, http As Object
    Dim sTimestamp As String, sBody As String
    LastError = ""

    On Error GoTo ErrHandler
    If Left(SUPABASE_URL, 5) = "PASTE" Or Left(SUPABASE_KEY, 5) = "PASTE" Then
        LastError = "H2Push: paste SUPABASE_URL / SUPABASE_KEY from Module1"
        Push = -2
        Exit Function
    End If

    If Not SQL_READY And Not isFinal Then
        Push = 0                                  ' live row not sent until Supabase is prepared
        Exit Function
    End If

    Set ws = ThisWorkbook.Sheets("Sheet1")
    Dim rawDate As Date
    rawDate = CDate(ws.Range("H20").Value)
    sTimestamp = Format(rawDate, "yyyy-mm-dd") & "T" & Format(rawDate, "hh:mm:ss") & "+05:30"

    ' Built in several statements: VBA allows at most 24 line continuations ( _ ) per statement.
    sBody = "{" & _
        """snapshot_time"":""" & sTimestamp & """," & _
        IIf(SQL_READY, """is_final"":" & IIf(isFinal, "true", "false") & ",", "") & _
        """total_generation"":" & N(ws.Range("H21").Value) & "," & _
        """total_consumption"":" & N(ws.Range("H22").Value) & "," & _
        """difference"":" & N(ws.Range("H23").Value) & ","
    sBody = sBody & _
        """gen_hgu3"":" & N(ws.Range("H25").Value) & "," & _
        """gen_psa2"":" & N(ws.Range("H26").Value) & "," & _
        """gen_msq"":" & N(ws.Range("H27").Value) & "," & _
        """gen_hgu1"":" & N(ws.Range("H28").Value) & "," & _
        """gen_hgu4"":" & N(ws.Range("H29").Value) & "," & _
        """gen_hgu2_syn_gas"":" & N(ws.Range("H30").Value) & ","
    sBody = sBody & _
        """con_hgu3"":" & N(ws.Range("H32").Value) & "," & _
        """con_vgo"":" & N(ws.Range("H33").Value) & "," & _
        """con_dhdt1"":" & N(ws.Range("H34").Value) & "," & _
        """con_dhds"":" & N(ws.Range("H35").Value) & "," & _
        """con_dhdt2"":" & N(ws.Range("H36").Value) & "," & _
        """con_isom"":" & N(ws.Range("H37").Value) & ","
    sBody = sBody & _
        """con_sru"":" & N(ws.Range("H38").Value) & "," & _
        """con_hgu4"":" & N(ws.Range("H39").Value) & "," & _
        """con_lab"":" & N(ws.Range("H40").Value) & "," & _
        """con_ghc"":" & N(ws.Range("H41").Value) & "," & _
        """con_hgu1"":" & N(ws.Range("H42").Value) & "," & _
        """con_nba"":" & N(ws.Range("H43").Value) & ","
    sBody = sBody & _
        """header_pressure_dhdt1"":" & N(ws.Range("H45").Value) & "," & _
        """ghc_fg_opening"":" & N(ws.Range("H46").Value) & "," & _
        """ghc_flare_opening"":" & N(ws.Range("H47").Value) & "}"

    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.setProxy 2, PROXY_SERVER
    http.Open "POST", SUPABASE_URL & "/rest/v1/" & TABLE_NAME, False   ' plain insert: a database trigger turns duplicates into updates
    http.setRequestHeader "Content-Type", "application/json"
    http.setRequestHeader "apikey", SUPABASE_KEY
    http.setRequestHeader "Authorization", "Bearer " & SUPABASE_KEY
    http.setRequestHeader "Prefer", "return=minimal"
    http.send sBody

    Push = http.Status
    If http.Status <> 200 And http.Status <> 201 And http.Status <> 204 Then
        LastError = "HTTP " & http.Status & ": " & Left(http.responseText, 200)
    End If
    Set http = Nothing
    Exit Function

ErrHandler:
    LastError = "VBA: " & Err.Description
    Push = -1
    Set http = Nothing
End Function

' Short text for the K1 status line
Public Function Result(ByVal status As Long) As String
    Select Case status
        Case 0:             Result = "skipped"
        Case 200, 201, 204: Result = "ok"
        Case -2:            Result = "SETUP"
        Case Else:          Result = "ERR " & status
    End Select
End Function

Private Function N(v As Variant) As String
    If IsError(v) Then
        N = "null"
    ElseIf IsNull(v) Or IsEmpty(v) Then
        N = "null"
    ElseIf Not IsNumeric(v) Then
        N = "null"
    Else
        N = Replace(CStr(CDbl(v)), ",", ".")
    End If
End Function
