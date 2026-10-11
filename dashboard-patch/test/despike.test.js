const assert = require('assert');
const { despike, readOptions } = require('../api/_lib/despike');
const opts = readOptions({});
const mk = (m, gen, con, p = 0.5, pushed = '2026-10-10T00:00:00Z') => ({
  snapshot_time: `2026-10-10T10:${String(m).padStart(2, '0')}:00Z`, pushed_at: pushed,
  total_generation: gen, total_consumption: con, difference: gen - con, header_pressure_dhdt1: p });
const desc = asc => [...asc].reverse();       // Supabase returns newest-first
const gens = rows => rows.map(r => r.total_generation).reverse();

// lone spike in the middle is repaired, difference recomputed
let out = despike(desc([mk(0,100000,90000), mk(2,101000,90500), mk(4,400000,91000), mk(6,100500,90800)]), opts);
assert.deepStrictEqual(gens(out), [100000,101000,101000,100500]);
assert.strictEqual(out.find(r => r.snapshot_time.includes(':04:')).difference, 101000 - 91000);

// genuine step change is kept
out = despike(desc([mk(0,100000,90000), mk(2,100500,90000), mk(4,160000,90000), mk(6,160500,90000), mk(8,161000,90000)]), opts);
assert.deepStrictEqual(gens(out), [100000,100500,160000,160500,161000]);

// newest row and oldest row are never altered
out = despike(desc([mk(0,900000,90000), mk(2,100000,90000), mk(4,100500,90000), mk(6,900000,90000)]), opts);
assert.deepStrictEqual(gens(out), [900000,100000,100500,900000]);

// single dip repaired
out = despike(desc([mk(0,161000,90000), mk(2,50000,90000), mk(4,161500,90000)]), opts);
assert.deepStrictEqual(gens(out), [161000,161000,161500]);

// small noise untouched
out = despike(desc([mk(0,100000,90000), mk(2,101500,90000), mk(4,100200,90000)]), opts);
assert.deepStrictEqual(gens(out), [100000,101500,100200]);

// tiny values (pressure ~0.5) are not treated as spikes by sub-1 noise
out = despike(desc([mk(0,1,1,0.50), mk(2,1,1,0.6), mk(4,1,1,0.52)]), opts);
assert.deepStrictEqual(out.map(r => r.header_pressure_dhdt1).reverse(), [0.5, 0.6, 0.52]);

// duplicate snapshot_time -> keep most recently pushed
out = despike(desc([mk(0,100000,90000), mk(2,900000,90000,0.5,'2026-10-10T10:03:00Z'), mk(2,101000,90000,0.5,'2026-10-10T10:09:00Z'), mk(4,100500,90000)]), opts);
assert.deepStrictEqual(gens(out), [100000,101000,100500]);

// disabled via env, nulls, short input, input not mutated
const src = desc([mk(0,100000,90000), mk(2,400000,90000), mk(4,100500,90000)]);
assert.strictEqual(despike(src, readOptions({ H2_DESPIKE: 'off' })), src);
assert.deepStrictEqual(despike([], opts), []);
assert.strictEqual(despike(desc([mk(0,1,1), mk(2,2,2)]), opts).length, 2);
const withNull = desc([mk(0,100000,90000), { ...mk(2,400000,90000), total_generation: null }, mk(4,100500,90000)]);
assert.strictEqual(despike(withNull, opts)[1].total_generation, null);
despike(src, opts); assert.strictEqual(src[1].total_generation, 400000);
// rows marked is_final are never changed, provisional neighbours still are
const fin = desc([mk(0,100000,90000), { ...mk(2,400000,90000), is_final: true }, mk(4,100500,90000)]);
assert.strictEqual(despike(fin, opts)[1].total_generation, 400000);
const prov = desc([mk(0,100000,90000), { ...mk(2,400000,90000), is_final: false }, mk(4,100500,90000)]);
assert.strictEqual(despike(prov, opts)[1].total_generation, 100500);

// ---- superseded old-style rows ----
const { dropSupersededRows } = require('../api/_lib/despike');
const at = (min, sec, gen, fin) => ({ snapshot_time: `2026-10-10T10:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}Z`, pushed_at: '2026-10-10T12:00:00Z', is_final: fin, total_generation: gen, total_consumption: 90000, difference: gen - 90000 });
{
  // settled rows every 2 min from 10:00 to 10:10; old-style rows at odd seconds in between, and one before the first settled row
  const rows = [
    at(0,0,100000,true), at(2,0,100100,true), at(4,0,100200,true), at(6,0,100300,true), at(8,0,100400,true), at(10,0,100500,true),
    at(3,41,166000,false), at(8,41,60000,true),                // legacy rows inside the settled window (one flagged final by default)
    { ...at(59,41,77777,false), snapshot_time: '2026-10-10T09:59:41Z' },   // before the first settled row -> kept
    { ...at(15,41,88888,false), snapshot_time: '2026-10-10T10:15:41Z' }    // after the last settled row -> kept
  ];
  const kept = dropSupersededRows(rows, opts, 'snapshot_time').map(r => r.total_generation).sort((a, b) => a - b);
  assert.deepStrictEqual(kept, [77777, 88888, 100000, 100100, 100200, 100300, 100400, 100500]);

  // a gap in settled data keeps the old-style rows there (nothing within 4 min on both sides)
  const gap = [at(0,0,100000,true), at(2,0,100100,true), at(20,0,100900,true), at(22,0,101000,true), at(11,0,0,false)];
  gap[4] = { ...at(11,30,55555,false) };
  assert.ok(dropSupersededRows(gap, opts, 'snapshot_time').some(r => r.total_generation === 55555));

  // feature is off when rows do not carry is_final (old schema)
  const legacy = rows.map(({ is_final, ...rest }) => rest);
  assert.strictEqual(dropSupersededRows(legacy, opts, 'snapshot_time').length, legacy.length);
  // switch
  assert.strictEqual(dropSupersededRows(rows, readOptions({ H2_SUPERSEDE: 'off' }), 'snapshot_time').length, rows.length);

  // end to end through despike(): newest-first in, spiky old-style rows gone, settled values untouched
  const out = despike([...rows].sort((a, b) => b.snapshot_time.localeCompare(a.snapshot_time)), opts);
  assert.ok(!out.some(r => r.total_generation === 166000 || r.total_generation === 60000));
  assert.ok(out.some(r => r.total_generation === 100300));
}

{ // cutover: old-style rows after the first settled row are dropped even inside a gap; live rows are median-smoothed
  const iso = (h, m, sec) => new Date(Date.UTC(2026, 9, 11, h, m, sec)).toISOString();
  const row = (t, final, gen) => ({ snapshot_time: t, pushed_at: t, is_final: final, total_generation: gen, total_consumption: 90000, difference: gen - 90000 });
  const rows = [];
  rows.push(row(iso(6, 1, 13), false, 30000));                        // old-style row BEFORE the first settled row: kept
  for (let m = 0; m < 10; m += 2) rows.push(row(iso(7, m, 0), true, 100000));
  rows.push(row(iso(8, 0, 3), false, 40000), row(iso(8, 5, 12), false, 190000)); // old-style rows inside a gap: dropped
  [100000, 100000, 140000, 60000, 100200].forEach((g, i) => rows.push(row(iso(9, i * 2, 0), false, g))); // live rows
  const sorted = rows.sort((a, b) => b.snapshot_time.localeCompare(a.snapshot_time));
  const hidden = despike(sorted, readOptions({}));
  assert.ok(!hidden.some(r => r.snapshot_time.startsWith('2026-10-11T09')), 'unsettled tail hidden by default');
  const out = despike(sorted, readOptions({ H2_SHOW_LIVE: 'on' }));
  assert.ok(out.some(r => r.total_generation === 30000));
  assert.ok(!out.some(r => r.total_generation === 40000 || r.total_generation === 190000));
  const live = out.filter(r => r.snapshot_time.startsWith('2026-10-11T09')).map(r => r.total_generation).reverse();
  assert.ok(live.every(g => g >= 99000 && g <= 101000), 'live rows smoothed: ' + live);
  assert.ok(out.filter(r => r.is_final === true).every(r => r.total_generation === 100000));
  // switches
  const off = despike(rows.slice(), readOptions({ H2_CUTOVER: 'off', H2_LIVE_MEDIAN_ROWS: '1', H2_SHOW_LIVE: 'on' }));
  assert.ok(off.some(r => r.total_generation === 190000) && off.some(r => r.total_generation === 140000));
}
console.log('despike: all tests passed');
