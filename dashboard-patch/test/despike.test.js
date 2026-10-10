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
console.log('despike: all tests passed');
