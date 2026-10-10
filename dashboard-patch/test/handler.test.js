const assert = require('assert');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_API_KEY = 'x'; process.env.H2_AUTH_USER = 'u';
process.env.H2_AUTH_PASSWORD = 'p'; process.env.H2_SESSION_SECRET = 's';
const session = require('../api/_lib/session');
session.requireAuth = () => ({ user: 'u' });             // skip login for the test
const t = m => `2026-10-10T10:${String(m).padStart(2, '0')}:00Z`;
const row = (m, g) => ({ snapshot_time: t(m), pushed_at: t(m), total_generation: g, total_consumption: 90000, difference: g - 90000 });
global.fetch = async () => ({ ok: true, json: async () => [row(6, 100500), row(4, 400000), row(2, 101000), row(0, 100000)] });
const handler = require('../api/dashboard-data');
let body; const res = { setHeader() {}, end(b) { body = JSON.parse(b); } };
handler({ method: 'GET', url: '/api/dashboard-data?minutes=60' }, res).then(() => {
  assert.deepStrictEqual(body.rows.map(r => r.total_generation), [100500, 101000, 101000, 100000]);
  console.log('handler: spike removed from API response, newest-first order kept');
});

// fallback when the is_final column does not exist yet
const calls = [];
global.fetch = async (url) => {
  calls.push(String(url));
  if(String(url).includes('is_final')) return { ok:false, status:400, clone(){ return this; }, text: async () => '{"message":"column h2_material_balance.is_final does not exist"}' };
  return { ok:true, json: async () => [row(4, 100500), row(2, 101000), row(0, 100000)] };
};
setTimeout(() => {
  let body2; const res2 = { setHeader() {}, end(b) { body2 = JSON.parse(b); } };
  handler({ method: 'GET', url: '/api/dashboard-data' }, res2).then(() => {
    assert.strictEqual(calls.length, 2);
    assert.ok(!calls[1].includes('is_final'));
    assert.strictEqual(body2.rows.length, 3);
    console.log('handler: falls back when is_final column is missing');
  });
}, 50);
