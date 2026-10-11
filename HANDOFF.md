# HANDOFF: H2 dashboard spike fix (read this first in a new session)

Branch `claude/hydrogen-dashboard-data-spikes-umj6t3`, draft PR #1 in this repo. User: refinery H2 balance dashboard
(Vercel project `h2-balance-dashboard`, Supabase project ref `mozuuowwdfyqqvpiyetk`). Excel workbook lives on the
user's OFFICE PC and cannot be edited from here.

## Done
* Excel on office PC #1 (installed + running): two-pass cycle (FINAL = 30-min-old settled data, LIVE), `SettledPush`, `H2Push` (switch `SQL_READY=False`).
* Office PC #2 still runs the OLD workbook (5-min pushes, off-grid timestamps). Left as is on purpose; the database classifies its rows as provisional.
* Supabase (project `mozuuowwdfyqqvpiyetk`) APPLIED 10-Oct-2026 via the Supabase connector: backup table, is_final, raw log, triggers, clean view, duplicate absorber, legacy classifier.
  NOT done by choice: dedupe of 109 old duplicate timestamps / unique index (user declined the DELETE).
  Gotcha: the connector hangs ~60 s on statements containing DELETE/DROP (waits for user approval). Use CREATE OR REPLACE ... instead.
* Dashboard API patch DEPLOYED to production 11-Oct-2026 via the Vercel connector (api only; index.html unchanged = no amber band yet). Rollback target: dpl_Cagj4KPrE12LQnQXqfrVXcFXmMan (30-Aug build). Includes `dropSupersededRows` (hides PC #2 old-style rows where PC #1 settled rows exist).
* 11-Oct: y-axis add-on deployed (dashboard-enhance.js + sw.js v5; dpl_CgGmZmR5n6LQVaShh8PMcEtVgnU7; previous dpl_EQLNATcqg7FoUNYE46vygzykyKBi).
* Evidence (DB, last 12 h): PC1 settled HGU-4 sd 632 (63.7k-66.8k) vs PC2 old macro sd 7,412 (47k-82k).

## PREFERRED ROUTE (no tokens, no network settings): claude.ai connectors
* Supabase connector (OAuth) -> run the SQL with its SQL/migration tools, project ref `mozuuowwdfyqqvpiyetk` only. Never use create/pause/cost tools.
* Vercel connector is read-only (projects, deployments, logs): use it to verify. Deploys happen via the Vercel Git integration after the repo is connected once (Vercel > Project > Settings > Git).
* If connector tools are not in the tool list, ask the user to enable them for this chat (or start a new session).
* Fallback only: `automation/apply_supabase.py` with a token in the environment.

## TODO (in this order)
1. (DONE, see above)  `python3 automation/apply_supabase.py` (env: `SUPABASE_ACCESS_TOKEN`; allow api.supabase.com). Runs backup, 3 SQL files, verification.
   Report the verification output. If a file fails, read the error, fix the SQL (re-run is safe), retry.
2. Dashboard repo: user creates empty private `atdubey96-ai/h2-balance-dashboard` and installs the Claude GitHub App.
   Then `add_repo` it, clone, push the original history (project zip has 7 commits; original project is NOT in this
   repo: ask the user to upload the zip again or push it themselves), then `git am dashboard-patch/h2-dashboard-changes.patch`
   on a branch and open a PR. Original project files tracked in git: api/*, index.html, vercel.json, package.json, sw.js, manifest.json, chart.umd.min.js, icon.svg.
3. Vercel (env `VERCEL_TOKEN`, allow api.vercel.com): projectId `prj_XffjjNpHi8Q99wsrcqI7avWfFPu6`, orgId `team_nwSiHvBVmDK0SDpsRSO5ncSN`.
   Connect the Git repo / deploy production; verify the dashboard loads and `/api/dashboard-data` returns `is_final`.
4. Tell the user to re-import the latest `uniformance/H2Push.bas` (plain insert, no on_conflict) and set `SQL_READY = True` on office PC #1. After that K1 shows `LIVE ok`
   and the dashboard shows the amber "LIVE - settling" band.
5. Later tuning: `FINAL_LAG_MIN` (30) in `SettledPush.bas`; thresholds in `public.h2_spike_params()`.

Rules: never ask the user to paste secrets into chat; do not commit keys; do not push to main without the user's say-so.
Key facts: see uniformance/PROVISIONAL_FINAL_SETUP.md and dashboard-patch/README.md.

## Hidden dashboard features (reversible)
Trip Simulator, Flaring ESG & Cost and Shift Report are **hidden, not deleted** (user request 11 Oct). The code stays in index.html; `dashboard-enhance.js` (block "Hidden features", `HIDDEN_TABS`) hides the sidebar buttons, removes them from kiosk rotation and redirects their `#hash` to Overview.
- To restore: remove the key(s) (`simulator`, `economics`, `reports`) from `HIDDEN_TABS`, bump `?v=` in sw.js and CACHE_NAME, redeploy. Preview without redeploying: add `?showall=1` to the URL.
- When the user asks for these features back, restore them.
