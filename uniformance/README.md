# Uniformance → Supabase: push only SETTLED data

## Why spikes reach the dashboard
In `Uniformance_Push_DATA.xlsm`:

* `Sheet1!D1 = NOW()-2 min`, `E1 = D1-3 min` → window ends only 2 min ago.
* `PHDGetData(..., "Average", "10m" / "30m", ...)` → the average bucket is **bigger than the
  3-min window** and runs into time the DCS→PHD pipeline has not delivered yet.
* `NOW()` moves the window on every recalc, so each manual refresh asks for a slightly different
  window until PHD has caught up – that is why refreshing 2–3 times "fixes" it.
* The macro pushes the **first** read, spike included.

## The fix (4 parts)
1. **Ask PHD a clean, complete, repeatable question** (Excel formula edits, step A).
2. **Settle gate** – the macro re-reads until two consecutive reads agree (automates your
   "refresh 2–3 times"). Not settled → skip the cycle, dashboard keeps the last good point.
3. **Step confirmation** – a >25 % jump in total generation/consumption must show in two
   consecutive settled cycles before it is pushed.
4. **Idempotent upsert** per `snapshot_time` in Supabase, so a re-push overwrites, never duplicates.

## Install (≈10 min). Stop auto-sync first (run `StopAutoSync`) and keep a backup copy of the .xlsm

### A. Formulas (workbook)
| Cell | Old | New |
|---|---|---|
| `Sheet1!M1` (new) | empty | `=NOW()` (the macro overwrites it with a frozen clock each cycle) |
| `Sheet1!D1` | `=NOW()-2/24/60` | `=ROUND(FLOOR($M$1-5/1440,2/1440)*86400,0)/86400` |
| `Sheet1!E1` | `=D1-3/24/60` | `=D1-2/1440` |

* `5/1440` = **lag (5 min)** so PHD has the data; `2/1440` = bucket = push interval (2 min), snapped to
  even 2-min boundaries so the request is identical on every retry. `M1` holds the cycle's start time, so the window cannot move while the macro is re-reading.
* In `Sheet1!D3` change `"30m"` → `"2m"`, and in `UNIFORMANCE!D4` change `"10m"` → `"2m"`
  (edit inside the formula; don't touch other arguments).
* Check `UNIFORMANCE` still returns exactly **one** data row at row 8 (as today).

### B. VBA (Alt+F11)
1. File → Import File → `SettledPush.bas`.
2. In **Module1**, in `PushNow`, replace
   ```vba
       ThisWorkbook.Sheets(SHEET_NAME).Calculate
       Dim ok As Integer, fail As Integer
   ```
   with
   ```vba
       Dim why As String
       If Not SettledPush.WaitForSettledData(why) Then
           LogStatus "HOLD - " & why
           GoTo ScheduleNext
       End If
       Dim ok As Integer, fail As Integer
   ```
   and change the log line to `LogStatus "OK=" & ok & " ERR=" & fail & " | " & why & " | Next: " & ...`.
3. In module **PushH2Balance**, change two things (keep your key/URL as they are):
   ```vba
   sUrl = SUPABASE_URL & "/rest/v1/" & TABLE_NAME & "?on_conflict=snapshot_time"
   ...
   http.setRequestHeader "Prefer", "resolution=merge-duplicates,return=minimal"   ' add before http.send
   ```
4. Set `SYNC_INTERVAL_MIN` in Module1 to `2` (your file currently says 5).

### C. Supabase
Run `supabase_migration.sql` in the SQL editor (it deletes duplicate `snapshot_time` rows – look at
the SELECT at the top first). 

## Option 2: fix it in Supabase only (no Excel change)
Use this if you cannot touch the workbook. Run `supabase_spike_filter.sql` in the Supabase SQL
editor (test on a copy of the table first). It adds:

* **`h2_material_balance_raw`**: every row exactly as Excel pushed it (never altered, not readable via the API).
* **Repair trigger**: when a new row arrives, a *lone* spike in the previous row (more than 25 % away
  from both neighbours while the neighbours agree within 5 %) is replaced by the median. A genuine step
  change is left alone. The newest row is never touched, so the latest point can still show a spike for
  one push cycle until the next row arrives.
* **`h2_material_balance_clean` view**: median-of-3 over the table, for a dashboard that reads the view.

Thresholds live in `public.h2_spike_params()`. Tested against a local Postgres (PGlite): lone spike
repaired, real step kept, upsert overwrite works, raw log keeps the original value. Not tested on Supabase
itself, and it only hides isolated spikes, not a sustained wrong plateau. It works with or without the
Excel changes above; combine both for best results.

## Tuning (top of `SettledPush.bas`)
| Symptom | Change |
|---|---|
| Still occasional spike | raise lag `5/1440` → `8/1440`; or `REL_TOL` 0.005 → 0.002 |
| Too many `HOLD – not settled` in K1 | raise the lag, or `MAX_READS` / `READ_GAP_SEC` |
| Dashboard too delayed | lower lag one minute at a time |
| Genuine big process changes get held a cycle too often | raise `JUMP_FRAC` (0.25 → 0.4) |

Latency of the trend ≈ lag + bucket (~7 min with defaults). That is the price of exact values;
the gate makes sure it is never worse than that.

## Not tested
This was written without access to Excel/PHD, so it has **not** been run. Test with the workbook
open for 15–20 min and watch `Sheet1!K1`: you should see `OK … settled in 2 reads` mostly.
Back up the `.xlsm` first.

---
# Checklists

## Do at the office PC (no GitHub needed)
1. Back up `Uniformance_Push_DATA.xlsm`; run `StopAutoSync`.
2. **Supabase SQL editor** (on a *copy* of the table first if you can):
   1. `supabase_migration.sql` (unique `snapshot_time`)
   2. `supabase_spike_filter.sql` (raw log + repair trigger + clean view)
3. **Excel** step A (formulas) and step B (VBA) above. Set `SYNC_INTERVAL_MIN = 2`.
4. Run `StartAutoSync`; for 15-20 min watch `Sheet1!K1` (`OK ... settled in 2 reads`).
   Occasional `HOLD` lines are normal; if it holds every cycle, raise the lag (`5/1440` to `8/1440`).
5. Open the dashboard and check the trend has no isolated spikes.

## Do later from the personal Mac
1. Create an empty private GitHub repo `h2-balance-dashboard`, push the project, install the Claude
   GitHub App on it (write access), connect it in Vercel (Project > Settings > Git).
2. Apply `dashboard-patch/` (server-side de-spike in `/api/dashboard-data`) or let Claude open a PR.
3. Optional: point `SUPABASE_TABLE` in Vercel at `h2_material_balance_clean`.

Order matters a little: the SQL (step 2) before the Excel upsert edit (`on_conflict=snapshot_time`),
because that upsert needs the unique index.
