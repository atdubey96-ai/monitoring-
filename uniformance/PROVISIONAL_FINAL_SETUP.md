# Provisional + final setup (recommended design)

**Idea.** Uniformance delivers history late (up to ~30 min for some tags), and the newest values are
erratic until it does. So every 2-minute cycle the macro does two passes:

| Pass | Reads data that is | Settle gate | Goes to Supabase as |
|---|---|---|---|
| FINAL | ~30 min old (has had time to arrive) | yes | `is_final = true`, **overwrites** the live row of the same timestamp |
| LIVE | newest (~2 min old) | no | `is_final = false` (provisional), also fills `plant_data` tags |

The dashboard always shows the live edge, shaded amber "LIVE - settling", and it is replaced by final
values ~30 min later. A provisional push can never overwrite a final row (database guard), and
lone spikes in provisional rows are repaired by the median trigger; final rows are never touched.

## ORDER (important)
1. Supabase SQL (3 files)  ->  2. Excel  ->  3. Dashboard.
Do the Excel part only AFTER the SQL, otherwise the H2 push is rejected (`ERR 400`, unknown column `is_final`).

## 1. Supabase (SQL editor, in this order, test on a copy first)
1. `supabase_migration.sql`
2. `supabase_spike_filter.sql`
3. `supabase_provisional_final.sql`   (safe to re-run)

## 2. Excel
1. `StopAutoSync`. Back up the file.
2. `Sheet1`: **M1** `=NOW()` (macro overwrites it), **N1** `30` (macro overwrites it),
   **D1** `=ROUND(FLOOR($M$1-$N$1/1440,2/1440)*86400,0)/86400`, **E1** `=D1-2/1440`.
   `Sheet1!D3` uses `"2m"`, `UNIFORMANCE!D4` uses `"2m"` (already done).
3. VBA editor (Alt+F11):
   * Remove the old `SettledPush` module and import the new `SettledPush.bas`.
   * Import `H2Push.bas`. Open it and paste the `SUPABASE_URL` and `SUPABASE_KEY` lines from Module1 over the two
     `PASTE` lines (copy them in Excel; do not retype the key).
   * Module1: replace the whole `Sub PushNow() ... End Sub` with the text in `Module1_PushNow.txt`.
     In `Sub ManualSync` change `PushH2Balance.PushH2Balance` to `H2Push.Push True`.
   * Debug > Compile VBAProject, save as .xlsm.
4. `StartAutoSync`. K1 should read like
   `FINAL ok [settled in 3 reads] | LIVE ok | tags OK=14 ERR=0 | Next: hh:mm:ss`.
   `FINAL HOLD [H32 4396.7->4966.1]` means data for that bucket was still changing: normal now and then.
   `LIVE ERR 400` = SQL not run yet. `SETUP` = keys not pasted into H2Push.
5. The old `PushH2Balance` module is no longer called; keep it until everything works, then delete it.

## 3. Dashboard (Vercel project)
Apply `dashboard-patch/` (see its README): API returns `is_final`, never alters final rows, falls back
automatically if the column does not exist yet, and charts show the amber live band.

## Tuning (top of `SettledPush.bas`)
* `FINAL_LAG_MIN = 30`: lower it in 5-min steps while K1 stays clean (`FINAL ok`) for an hour; stop when
  `FINAL HOLD` appears often and add 5 min.
* `LIVE_LAG_MIN = 2`: how fresh the live edge is.
* A cycle takes up to ~80 s (final pass settling) plus the live pass; the interval stays 2 min.
* If a FINAL pass is held, that bucket stays provisional (median-repaired) until it is overwritten
  by a later final push or stays as the best available value.
