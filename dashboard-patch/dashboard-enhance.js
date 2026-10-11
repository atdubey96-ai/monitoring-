/* H2 dashboard add-on (loaded after the main page script).
   Smarter y-axis auto-scale for the trend charts:
   - fits the axis to the main body of the data (10-90 % band +/- 40 %), so old spikes no longer squash today's values;
   - never hides anything silently: a small "N pts off-scale" note is drawn when points fall outside the axis;
   - picks the grid step to suit the range (the page's fixed 2000 step is kept only when it gives 5-14 gridlines).
   Disable with ?noenhance=1 in the URL. */
(function(){
  'use strict';
  if(window.__h2Enhance || /[?&]noenhance=1/.test(location.search)) return;
  window.__h2Enhance = true;
  var original = window.computeDynamicAxisBounds;
  if(typeof original !== 'function') return;

  function quantile(sorted, p){
    var pos = (sorted.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  function niceStep(range){
    var rough = Math.max(Math.abs(range), 1e-9) / 8;
    var mag = Math.pow(10, Math.floor(Math.log10(rough)));
    var n = rough / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }

  window.computeDynamicAxisBounds = function(values, cfg){
    cfg = cfg || {};
    var v = (values || []).filter(function(x){ return typeof x === 'number' && isFinite(x); });
    if(v.length < 40) return original(values, cfg);
    var sorted = v.slice().sort(function(a, b){ return a - b; });
    var dataMin = sorted[0], dataMax = sorted[sorted.length - 1];
    var q10 = quantile(sorted, 0.10), q90 = quantile(sorted, 0.90);
    var core = Math.max(q90 - q10, 1e-9);
    var lo = Math.max(dataMin, q10 - 0.4 * core);
    var hi = Math.min(dataMax, q90 + 0.4 * core);
    if(cfg.includeZero){ lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    var range = Math.max(hi - lo, 1e-9);
    var step = niceStep(range);
    if(cfg.step && range / cfg.step >= 5 && range / cfg.step <= 14) step = cfg.step;

    var min = lo, max = hi;
    if(min === max){ min -= step * 2; max += step * 2; } else { min -= step * 0.5; max += step * 0.5; }
    var chartMin = Math.floor(min / step) * step, chartMax = Math.ceil(max / step) * step;
    if(cfg.minLimit !== null && cfg.minLimit !== undefined) chartMin = Math.max(cfg.minLimit, chartMin);
    if(cfg.maxLimit !== null && cfg.maxLimit !== undefined) chartMax = Math.min(cfg.maxLimit, chartMax);
    if(chartMin === chartMax) chartMax = chartMin + step;
    return { min: chartMin, max: chartMax, step: step };
  };

  // note for points that fall outside the fitted axis
  if(window.Chart && Chart.register){
    Chart.register({
      id: 'h2OffScale',
      afterDatasetsDraw: function(chart){
        try {
          if(!chart._dynamicAxes || !chart._dynamicAxes.y || !chart.scales || !chart.scales.y || !chart.chartArea) return;
          var s = chart.scales.y, off = 0;
          chart.data.datasets.forEach(function(ds, i){
            if(chart.getDatasetMeta(i).hidden || ds.hidden) return;
            (ds.data || []).forEach(function(p){
              var y = (p && typeof p === 'object') ? p.y : p;
              if(typeof y === 'number' && isFinite(y) && (y > s.max || y < s.min)) off++;
            });
          });
          if(!off) return;
          var ctx = chart.ctx, a = chart.chartArea;
          ctx.save();
          ctx.font = '600 10px DM Sans, sans-serif';
          ctx.fillStyle = 'rgba(224,120,0,0.9)';
          ctx.textAlign = 'right';
          ctx.fillText(off + ' pts off-scale', a.right - 8, a.top + 14);
          ctx.restore();
        } catch(e){}
      }
    });
  }
  try { if(typeof window.updateAllCharts === 'function') window.updateAllCharts(); } catch(e){}
})();
