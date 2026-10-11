// Removes isolated spikes from dashboard rows without needing any Excel/DB change.
// A value is a "lone spike" when it is far from BOTH neighbours while those two
// neighbours agree with each other. A real step change (neighbours disagree) is kept.
// The newest and oldest rows, and rows marked is_final = true, are never altered. Rows with the same snapshot time are
// collapsed to the most recently pushed one.

const NUMERIC_COLUMNS = [
  'total_generation','total_consumption','difference',
  'gen_hgu3','gen_psa2','gen_msq','gen_hgu1','gen_hgu4','gen_hgu2_syn_gas',
  'con_hgu3','con_vgo','con_dhdt1','con_dhds','con_dhdt2','con_isom','con_sru',
  'con_hgu4','con_lab','con_ghc','con_hgu1','con_nba',
  'header_pressure_dhdt1','ghc_fg_opening','ghc_flare_opening'
];

function toNumber(value){
  if(value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function median3(a, b, c){
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
}

function readOptions(env = process.env){
  const num = (key, fallback) => {
    const n = Number(env[key]);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    enabled: String(env.H2_DESPIKE || 'on').toLowerCase() !== 'off',
    spikeRatio: num('H2_SPIKE_RATIO', 0.25),
    agreeRatio: num('H2_SPIKE_AGREE_RATIO', 0.05),
    absFloor: num('H2_SPIKE_ABS_FLOOR', 1),
    supersede: String(env.H2_SUPERSEDE || 'on').toLowerCase() !== 'off',
    gridSeconds: num('H2_GRID_SECONDS', 120),
    supersedeToleranceMs: num('H2_SUPERSEDE_TOLERANCE_SEC', 240) * 1000,
    cutover: String(env.H2_CUTOVER || 'on').toLowerCase() !== 'off',
    liveWindow: Math.max(1, Math.round(num('H2_LIVE_MEDIAN_ROWS', 5))),
    showLive: String(env.H2_SHOW_LIVE || 'off').toLowerCase() === 'on'
  };
}

// Settled rows (the FINAL pass of the Excel macro) sit exactly on a fixed time grid (every 2 minutes, :00 seconds).
// Rows from an old-style pusher (5-minute cadence, odd seconds, unsettled values) are redundant wherever settled
// rows exist on BOTH sides within the tolerance. Drop those; keep them where settled data has a gap or does not exist
// (history before the new setup, a PC that is offline). Only active when rows carry the is_final field.
function dropSupersededRows(rows, options, timeColumn){
  if(!options.supersede || !rows.some(r => r && r.is_final !== undefined)) return rows;
  const grid = options.gridSeconds;
  const stamp = row => Date.parse(row[timeColumn]);
  const onGrid = t => Number.isFinite(t) && t % 1000 === 0 && (t / 1000) % grid === 0;

  const settled = [];
  for(const row of rows){
    const t = stamp(row);
    if(onGrid(t) && row.is_final !== false) settled.push(t);
  }
  if(settled.length < 2) return rows;
  settled.sort((a, b) => a - b);

  const nearest = t => {                       // closest settled stamps before / after t
    let lo = 0, hi = settled.length;
    while(lo < hi){ const mid = (lo + hi) >> 1; if(settled[mid] < t) lo = mid + 1; else hi = mid; }
    return { before: lo > 0 ? settled[lo - 1] : null, after: lo < settled.length ? settled[lo] : null };
  };
  const tol = options.supersedeToleranceMs;
  return rows.filter(row => {
    const t = stamp(row);
    if(!Number.isFinite(t) || onGrid(t)) return true;
    const { before, after } = nearest(t);
    const covered = before !== null && after !== null && (t - before) <= tol && (after - t) <= tol;
    return !covered;
  });
}


// Once the settled (on-grid) pusher is running, rows from an old-style pusher that are NEWER than its first row are
// dropped, even where settled data has a gap: a straight bridge over a gap is cleaner than a cloud of unsettled spikes.
function dropLegacyAfterCutover(rows, options, timeColumn){
  if(!options.cutover || !rows.some(r => r && r.is_final !== undefined)) return rows;
  const grid = options.gridSeconds;
  const stamp = row => Date.parse(row[timeColumn]);
  const onGrid = t => Number.isFinite(t) && t % 1000 === 0 && (t / 1000) % grid === 0;
  let first = Infinity;
  for(const row of rows){
    const t = stamp(row);
    if(onGrid(t) && t < first) first = t;
  }
  if(first === Infinity) return rows;
  return rows.filter(row => {
    const t = stamp(row);
    return !Number.isFinite(t) || onGrid(t) || t < first;
  });
}

// Live (provisional) rows are still unsettled. Show each as the median of itself and the rows just before it
// (rejects up to half of the window being erratic) instead of the raw value. Settled rows are never altered.
function smoothLiveRows(asc, options, timeColumn){
  if(options.liveWindow < 3) return asc;
  const grid = options.gridSeconds;
  const onGrid = row => { const t = Date.parse(row[timeColumn]); return Number.isFinite(t) && t % 1000 === 0 && (t / 1000) % grid === 0; };
  let first = -1;
  for(let i = 0; i < asc.length; i++){ if(onGrid(asc[i])){ first = i; break; } }
  if(first < 0) return asc;
  const original = asc.map(row => ({ ...row }));
  for(let i = first; i < asc.length; i++){
    if(asc[i].is_final !== false) continue;
    const from = Math.max(first, i - options.liveWindow + 1);
    if(i - from + 1 < 3) continue;
    for(const col of NUMERIC_COLUMNS){
      const vals = [];
      for(let k = from; k <= i; k++){ const n = toNumber(original[k][col]); if(n !== null) vals.push(n); }
      if(vals.length < 3 || toNumber(original[i][col]) === null) continue;
      vals.sort((a, b) => a - b);
      const mid = vals.length >> 1;
      asc[i][col] = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
    }
    const gen = toNumber(asc[i].total_generation), con = toNumber(asc[i].total_consumption);
    if(gen !== null && con !== null) asc[i].difference = gen - con;
  }
  return asc;
}

// The newest PHD values are not settled yet, so live (provisional) rows are erratic. Each is overwritten by its settled
// row later - unless the settle delay was shortened meanwhile, which leaves provisional rows that never get replaced.
// Keep all provisional on-grid rows off the trend once settled rows exist; the line is the settled rows only.
// (Switch on with H2_SHOW_LIVE=on or the ?live=1 opt-in of /api/dashboard-data.)
function hideUnsettledTail(rows, options, timeColumn){
  if(options.showLive) return rows;
  const grid = options.gridSeconds;
  const stamp = row => Date.parse(row[timeColumn]);
  const onGrid = t => Number.isFinite(t) && t % 1000 === 0 && (t / 1000) % grid === 0;
  if(!rows.some(row => onGrid(stamp(row)) && row.is_final === true)) return rows;
  return rows.filter(row => !(onGrid(stamp(row)) && row.is_final === false));
}

// rowsDesc: newest-first (same order Supabase returns). Returns newest-first.
function despike(rowsDesc, options = readOptions(), timeColumn = 'snapshot_time', pushedAtColumn = 'pushed_at'){
  if(!options.enabled || !Array.isArray(rowsDesc) || rowsDesc.length === 0) return rowsDesc;
  rowsDesc = dropSupersededRows(rowsDesc, options, timeColumn);
  rowsDesc = dropLegacyAfterCutover(rowsDesc, options, timeColumn);
  rowsDesc = hideUnsettledTail(rowsDesc, options, timeColumn);

  // 1. one row per snapshot time (keep the most recently pushed)
  const byTime = new Map();
  for(const row of rowsDesc){
    const key = row[timeColumn];
    const existing = byTime.get(key);
    if(!existing || String(row[pushedAtColumn] || '') > String(existing[pushedAtColumn] || '')){
      byTime.set(key, row);
    }
  }
  const asc = [...byTime.values()].reverse().map(row => ({ ...row }));
  if(asc.length < 3) return asc.reverse();

  // 2. repair lone spikes, judged against the ORIGINAL neighbours
  const original = asc.map(row => ({ ...row }));
  for(let i = 1; i < asc.length - 1; i++){
    if(asc[i].is_final === true) continue;      // settled rows are trusted as they are
    let repairedTotals = false;
    for(const col of NUMERIC_COLUMNS){
      const a = toNumber(original[i - 1][col]);
      const d = toNumber(original[i][col]);
      const b = toNumber(original[i + 1][col]);
      if(a === null || d === null || b === null) continue;
      const scale = Math.max(Math.abs(a), Math.abs(b), options.absFloor);
      if(Math.abs(a - b) <= options.agreeRatio * scale
        && Math.abs(d - a) > options.spikeRatio * scale
        && Math.abs(d - b) > options.spikeRatio * scale){
        asc[i][col] = median3(a, d, b);
        if(col === 'total_generation' || col === 'total_consumption') repairedTotals = true;
      }
    }
    if(repairedTotals){
      const gen = toNumber(asc[i].total_generation);
      const con = toNumber(asc[i].total_consumption);
      if(gen !== null && con !== null) asc[i].difference = gen - con;
    }
  }
  return smoothLiveRows(asc, options, timeColumn).reverse();
}

module.exports = { despike, readOptions, dropSupersededRows, NUMERIC_COLUMNS };
