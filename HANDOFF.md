# HANDOFF: H2 dashboard spike fix (read this first in a new session)

Branch `claude/hydrogen-dashboard-data-spikes-umj6t3`, draft PR #1 in this repo. User: refinery H2 balance dashboard
(Vercel project `h2-balance-dashboard`, Supabase project ref `mozuuowwdfyqqvpiyetk`). Excel workbook lives on the
user's OFFICE PC and cannot be edited from here.

## Done
* Excel (installed + running on office PC): two-pass cycle (FINAL pass 30-min-old settled data / LIVE pass), `SettledPush`, `H2Push` (switch `SQL_READY=False`).
  K1 healthy: `FINAL ok [settled in 2 reads] | LIVE skipped | tags OK=14 ERR=0`.
* SQL files and the dashboard patch are written and tested locally (PGlite / headless Chromium).
* Watchdog scripts need no change.

## TODO (in this order) once the environment has network + secrets
1. `python3 automation/apply_supabase.py` (env: `SUPABASE_ACCESS_TOKEN`; allow api.supabase.com). Runs backup, 3 SQL files, verification.
   Report the verification output. If a file fails, read the error, fix the SQL (re-run is safe), retry.
2. Dashboard repo: user creates empty private `atdubey96-ai/h2-balance-dashboard` and installs the Claude GitHub App.
   Then `add_repo` it, clone, push the original history (project zip has 7 commits; original project is NOT in this
   repo: ask the user to upload the zip again or push it themselves), then `git am dashboard-patch/h2-dashboard-changes.patch`
   on a branch and open a PR. Original project files tracked in git: api/*, index.html, vercel.json, package.json, sw.js, manifest.json, chart.umd.min.js, icon.svg.
3. Vercel (env `VERCEL_TOKEN`, allow api.vercel.com): projectId `prj_XffjjNpHi8Q99wsrcqI7avWfFPu6`, orgId `team_nwSiHvBVmDK0SDpsRSO5ncSN`.
   Connect the Git repo / deploy production; verify the dashboard loads and `/api/dashboard-data` returns `is_final`.
4. Tell the user to flip `Private Const SQL_READY As Boolean = True` in module `H2Push` (office PC, one edit). After that K1 shows `LIVE ok`
   and the dashboard shows the amber "LIVE - settling" band.
5. Later tuning: `FINAL_LAG_MIN` (30) in `SettledPush.bas`; thresholds in `public.h2_spike_params()`.

Rules: never ask the user to paste secrets into chat; do not commit keys; do not push to main without the user's say-so.
Key facts: see uniformance/PROVISIONAL_FINAL_SETUP.md and dashboard-patch/README.md.
