# Dashboard fix (h2-balance-dashboard on Vercel)

Copy these into your dashboard project folder (same paths), then redeploy (`npx vercel --prod`):

* `api/_lib/despike.js`  (new)
* `api/dashboard-data.js` (replaces the existing file; only 2 lines differ: the `require` and the `despike(...)` call)
* `test/` (optional): run `node test/despike.test.js` and `node test/handler.test.js`

What it does: every chart loads through `/api/dashboard-data`. The API now keeps one row per
`snapshot_time` and replaces lone spikes (far from BOTH neighbours while those neighbours agree
with each other) by the median. Real step changes, the newest row and the oldest row are never changed.

Optional Vercel environment variables (defaults in brackets):
`H2_DESPIKE` (on; set `off` to disable), `H2_SPIKE_RATIO` (0.25), `H2_SPIKE_AGREE_RATIO` (0.05), `H2_SPIKE_ABS_FLOOR` (1).
