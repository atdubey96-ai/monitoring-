# Dashboard fix (h2-balance-dashboard on Vercel)

Files (same paths as in your project):

* `api/_lib/despike.js` (new): one row per `snapshot_time`; lone spikes in provisional rows replaced by the
  median; rows with `is_final = true` and the newest/oldest rows are never changed.
* `api/_lib/config.js`: `is_final` added to the selected columns.
* `api/dashboard-data.js`: uses despike; if the `is_final` column does not exist yet it retries without it.
* `index.html.patch`: unified diff for `index.html` (adds `_isFinal` flags in `mapRows`, clears them on logout, and
  a small Chart.js plugin that shades the live/provisional tail with the label "LIVE · settling").
  Apply with `git apply index.html.patch` inside your project (or ask Claude to open a PR once the repo is on GitHub).
* `test/`: `node test/despike.test.js` and `node test/handler.test.js`.

Tested: unit tests, the real API handlers with a stubbed Supabase, and the real page in headless Chromium
(band renders, no errors; legacy data without `is_final` shows no band and loads normally).

Optional Vercel env vars: `H2_DESPIKE` (on / off), `H2_SPIKE_RATIO` (0.25), `H2_SPIKE_AGREE_RATIO` (0.05), `H2_SPIKE_ABS_FLOOR` (1).

## Update 11-Oct-2026: superseded old-style rows are skipped
A second office PC still runs the old macro and pushes unsettled values every 5 minutes (off the 2-minute grid).
`despike.js` now drops those rows wherever settled (on-grid, is_final) rows exist on both sides within 4 minutes, and keeps
them where settled data has a gap or does not exist yet (older history, a PC that is offline). Options:
`H2_SUPERSEDE` (on/off), `H2_GRID_SECONDS` (120), `H2_SUPERSEDE_TOLERANCE_SEC` (240).
Deployed to production through the Vercel connector (API files only; `index.html` unchanged, so the amber live band is not live yet).
