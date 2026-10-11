/* H2 dashboard add-on (loaded after the main page script).
   Smarter y-axis auto-scale for the trend charts:
   - covers every point (nothing is cut off); ?fit=1 fits the bulk of the data instead, with an "N pts off-scale" note;
   - picks a fine grid step (about 10-18 labelled y values; the page's fixed step is kept only when it gives 10-20);
   - draws faint minor gridlines on both axes (y: 5 per step, x: 4 between time labels).
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
    var rough = Math.max(Math.abs(range), 1e-9) / 18;      // about 10-18 labelled gridlines
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
    // default: the axis covers every point (nothing is ever cut off). ?fit=1 fits the bulk of the data instead
    // (3rd-97th percentile + 30 % padding) and counts the points beyond it in the "N pts off-scale" note.
    var full = !/[?&]fit=1/.test(location.search);        // default: show every point, nothing clipped
    var q03 = quantile(sorted, 0.03), q97 = quantile(sorted, 0.97);
    var core = Math.max(q97 - q03, 1e-9);
    var lo = full ? dataMin : Math.max(dataMin, q03 - 0.3 * core);
    var hi = full ? dataMax : Math.min(dataMax, q97 + 0.3 * core);
    if(cfg.includeZero){ lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    var range = Math.max(hi - lo, 1e-9);
    var step = niceStep(range);
    if(cfg.step && range / cfg.step >= 10 && range / cfg.step <= 20) step = cfg.step;

    var min = lo, max = hi;
    if(min === max){ min -= step * 2; max += step * 2; } else { min -= step * 0.5; max += step * 0.5; }
    var chartMin = Math.floor(min / step) * step, chartMax = Math.ceil(max / step) * step;
    if(cfg.minLimit !== null && cfg.minLimit !== undefined) chartMin = Math.max(cfg.minLimit, chartMin);
    if(cfg.maxLimit !== null && cfg.maxLimit !== undefined) chartMax = Math.min(cfg.maxLimit, chartMax);
    if(chartMin === chartMax) chartMax = chartMin + step;
    return { min: chartMin, max: chartMax, step: step };
  };


  // faint minor gridlines between the labelled ones, on both axes
  if(window.Chart && Chart.register){
    Chart.register({
      id: 'h2MinorGrid',
      beforeDatasetsDraw: function(chart){
        try {
          var a = chart.chartArea, xs = chart.scales && chart.scales.x, ys = chart.scales && chart.scales.y;
          if(!a || !xs || !ys || !chart.config || chart.config.type !== 'line') return;
          var ctx = chart.ctx;
          ctx.save();
          ctx.beginPath(); ctx.rect(a.left, a.top, a.right - a.left, a.bottom - a.top); ctx.clip();
          ctx.strokeStyle = 'rgba(120,145,175,0.12)'; ctx.lineWidth = 1;
          ctx.beginPath();
          var vals = (ys.ticks || []).map(function(t){ return t.value; }).filter(function(v){ return isFinite(v); }).sort(function(p, q){ return p - q; });
          if(vals.length >= 2){
            var step = vals[1] - vals[0];
            var mant = step / Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
            var n = Math.abs(mant - 2) < 0.01 ? 4 : 5;
            for(var i = -1; i < vals.length; i++){
              for(var k = 1; k < n; k++){
                var v = (i < 0 ? vals[0] - step : vals[i]) + step * k / n;
                if(v <= ys.min || v >= ys.max) continue;
                var py = Math.round(ys.getPixelForValue(v)) + 0.5;
                ctx.moveTo(a.left, py); ctx.lineTo(a.right, py);
              }
            }
          }
          var px = [];
          (xs.ticks || []).forEach(function(t){
            if(t.label === null || t.label === undefined || t.label === '') return;
            var p = xs.getPixelForValue(t.value);
            if(isFinite(p) && (!px.length || Math.abs(p - px[px.length - 1]) > 1)) px.push(p);
          });
          for(var j = 0; j + 1 < px.length; j++){
            var parts = (a.right - a.left) < 520 ? 2 : 5;      // fewer vertical minor lines on a phone
            for(var m = 1; m < parts; m++){
              var x = Math.round(px[j] + (px[j + 1] - px[j]) * m / parts) + 0.5;
              ctx.moveTo(x, a.top); ctx.lineTo(x, a.bottom);
            }
          }
          ctx.stroke();
          ctx.restore();
        } catch(e){}
      }
    });
  }

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

  // phones: do not print a time label right next to a date label (they overlapped, e.g. "11 Oct01:23")
  try {
    if(window.Chart && Chart.instances){
      Object.keys(Chart.instances).forEach(function(id){
        var chart = Chart.instances[id], xs = chart.options && chart.options.scales && chart.options.scales.x;
        if(!xs || !xs.ticks || typeof xs.ticks.callback !== 'function' || xs.ticks.__h2Wrapped) return;
        var orig = xs.ticks.callback, cacheKey = null, dateAt = null;
        xs.ticks.callback = function(val, index, ticks){
          var r = orig.call(this, val, index, ticks);
          try {
            var w = this.chart && this.chart.chartArea ? this.chart.chartArea.width : 0;
            if(!w || w >= 520 || r === null || r === undefined || Array.isArray(r) || !ticks || ticks.length < 3) return r;
            var key = ticks.length + ':' + w;
            if(key !== cacheKey){
              cacheKey = key; dateAt = [];
              for(var i = 0; i < ticks.length; i++){ if(Array.isArray(orig.call(this, ticks[i].value, i, ticks))) dateAt.push(i); }
            }
            var k = Math.ceil(46 / (w / (ticks.length - 1)));
            for(var n = 0; n < dateAt.length; n++){ if(Math.abs(dateAt[n] - index) <= k) return null; }
          } catch(e){}
          return r;
        };
        xs.ticks.__h2Wrapped = true;
      });
    }
  } catch(e){}
  try { if(typeof window.updateAllCharts === 'function') window.updateAllCharts(); } catch(e){}
})();

/* Hidden features (reversible - nothing is deleted from the page).
   To bring a feature back: remove its key from HIDDEN_TABS below (or add ?showall=1 to the URL to see all of them). */
(function(){
  'use strict';
  var HIDDEN_TABS = ['simulator', 'economics', 'reports']; /* Trip Simulator, Flaring ESG & Cost, Shift Report */
  if(/[?&]showall=1/.test(location.search)) return;
  try {
    var HIDDEN_SELECTORS = ['#alarmRibbon', '#themeToggleBtn', '.theme-toggle-mobile']; /* alarm banner under the header; dark-mode switch (light theme only, see api/page.js) */
    var css = HIDDEN_TABS.map(function(k){ return '.sidebar-link[data-tab-trigger="' + k + '"]'; }).concat(HIDDEN_SELECTORS).join(',') + '{display:none !important}';
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    if(typeof KIOSK_TABS !== 'undefined' && KIOSK_TABS.length){
      for(var i = KIOSK_TABS.length - 1; i >= 0; i--) if(HIDDEN_TABS.indexOf(KIOSK_TABS[i]) !== -1) KIOSK_TABS.splice(i, 1);
    }
    function guard(){
      var key = (location.hash || '').replace('#', '');
      if(HIDDEN_TABS.indexOf(key) !== -1 && typeof activateTab === 'function') activateTab('overview');
    }
    window.addEventListener('hashchange', guard);
    guard();
  } catch(e){}
})();

/* Mobile fix: the phone bottom navigation inherited the desktop height (100vh - 40px), so it covered the whole screen as a
   frosted sheet. Let it be only as tall as its buttons. */
(function(){
  'use strict';
  if(/[?&]noenhance=1/.test(location.search)) return;
  try {
    var st = document.createElement('style');
    st.textContent = '@media (max-width:780px){.sidebar{height:auto !important;max-height:none !important;}' +
      '.sidebar-link-label .label-full{display:none !important;}.sidebar-link-label .label-short{display:inline !important;}}';
    document.head.appendChild(st);
  } catch(e){}
})();

/* Phone: "Install App" button in the quick-actions panel (the desktop header button is hidden on phones).
   Chrome/Android: opens the install prompt the page already captured. iPhone/others: shows how to add it to the home screen. */
(function(){
  'use strict';
  if(/[?&]noenhance=1/.test(location.search)) return;
  try {
    var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    var row = document.querySelector('.mobile-actions-panel .mobile-action-row');
    if(standalone || !row || document.getElementById('mobileInstallBtn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'mobileInstallBtn';
    btn.className = 'mobile-action-btn';
    btn.style.cssText = 'display:none;width:100%;height:42px;border-radius:14px;align-items:center;justify-content:center;gap:8px;' +
      'font-weight:700;color:var(--blue);background:var(--blue-lt);border:1px solid rgba(26,111,232,0.24);';
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>Install App</span>';
    row.appendChild(btn);
    var narrow = window.matchMedia('(max-width:780px)');
    function show(){ btn.style.display = narrow.matches ? 'flex' : 'none'; }
    show();
    if(narrow.addEventListener) narrow.addEventListener('change', show);
    btn.addEventListener('click', function(){
      var p = (typeof deferredPrompt !== 'undefined') ? deferredPrompt : null;
      if(p && p.prompt){
        p.prompt();
        if(p.userChoice) p.userChoice.then(function(c){ if(c && c.outcome === 'accepted') btn.style.display = 'none'; });
        try { deferredPrompt = null; } catch(e){}
        return;
      }
      var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      alert(ios ? 'To install: tap the Share button in Safari, then "Add to Home Screen".'
                : 'To install: open the browser menu (three dots) and choose "Install app" or "Add to Home screen".');
    });
    window.addEventListener('appinstalled', function(){ btn.style.display = 'none'; });
  } catch(e){}
})();

/* Trend selector: click a unit in a chart header to see that trend alone (the axis re-fits to it); click it again,
   or click "All", to see everything. Works on the Generation / Consumption charts and the other multi-line charts. */
(function(){
  'use strict';
  if(/[?&]noenhance=1/.test(location.search)) return;
  try {
    var orig = window.renderDatasetHeaderReadout;
    if(typeof orig !== 'function') return;
    var st = document.createElement('style');
    st.textContent = '.split-trend-pill[data-h2sel]{cursor:pointer;user-select:none;transition:opacity .15s,box-shadow .15s}' +
      '.split-trend-pill.h2-off{opacity:.45}.split-trend-pill.h2-off .split-trend-pill-swatch{background:transparent}' +
      '.split-trend-pill.h2-solo{box-shadow:0 0 0 2px var(--accent)}' +
      '.split-trend-pill.h2-all{--accent:var(--blue);min-width:0}.split-trend-pill.h2-all .split-trend-pill-label{color:var(--blue)}' +
      '.split-trend-pill[data-h2sel]:hover{box-shadow:0 0 0 2px rgba(26,111,232,.35)}';
    document.head.appendChild(st);

    function locate(chart){
      if(typeof UNIT_TREND_SECTIONS === 'undefined') return null;
      for(var sk in UNIT_TREND_SECTIONS){
        var sec = UNIT_TREND_SECTIONS[sk];
        for(var band in sec.charts){ if(sec.charts[band] === chart) return { key: sk, sec: sec, band: band }; }
      }
      return null;
    }
    function bandUnits(loc){ return splitUnitsByThreshold(loc.sec.units)[loc.band] || []; }

    function decorate(wrap, chart){
      var loc = locate(chart), items;       // items: { label, visible, node, onSolo(), onAll() }
      var datasets = chart.data.datasets || [];
      var labels;
      if(loc){
        var units = bandUnits(loc);
        if(units.length < 2) return;
        items = units.map(function(u){ return { id: u.key, label: u.label, visible: !!loc.sec.visibility[u.key] }; });
      } else {
        if(datasets.length < 2) return;
        items = datasets.map(function(ds, i){ return { id: String(i), label: ds.label, visible: !ds.hidden }; });
      }
      var pills = [].slice.call(wrap.querySelectorAll('.split-trend-pill:not(.h2-all):not(.h2-off)'));
      var frag = document.createDocumentFragment();
      var anyOff = items.some(function(it){ return !it.visible; });
      if(anyOff || items.length){
        var all = document.createElement('div');
        all.className = 'split-trend-pill h2-all'; all.setAttribute('data-h2sel', '__all__');
        all.innerHTML = '<span class="split-trend-pill-label">All</span>';
        frag.appendChild(all);
      }
      var visibleCount = items.filter(function(it){ return it.visible; }).length;
      items.forEach(function(it){
        var node = null;
        for(var i = 0; i < pills.length; i++){
          var l = pills[i].querySelector('.split-trend-pill-label');
          if(l && l.textContent === it.label){ node = pills[i]; break; }
        }
        if(!node){
          var ds = null; datasets.forEach(function(d){ if(d.label === it.label) ds = d; });
          var color = ds && typeof ds.borderColor === 'string' ? ds.borderColor : '#8aa0b8';
          node = document.createElement('div');
          node.className = 'split-trend-pill h2-off';
          node.style.setProperty('--accent', color);
          node.innerHTML = '<span class="split-trend-pill-swatch"></span><span class="split-trend-pill-label"></span>';
          node.querySelector('.split-trend-pill-label').textContent = it.label;
        }
        node.setAttribute('data-h2sel', it.id);
        if(it.visible && visibleCount === 1 && items.length > 1) node.classList.add('h2-solo'); else node.classList.remove('h2-solo');
        frag.appendChild(node);
      });
      wrap.innerHTML = '';
      wrap.appendChild(frag);
      if(!wrap.__h2Bound){
        wrap.__h2Bound = true;
        wrap.addEventListener('click', function(e){
          var pill = e.target.closest && e.target.closest('[data-h2sel]');
          if(!pill) return;
          var id = pill.getAttribute('data-h2sel'), loc2 = locate(chart);
          if(loc2){
            var us = bandUnits(loc2), vis = us.filter(function(u){ return loc2.sec.visibility[u.key]; });
            var restore = id === '__all__' || (vis.length === 1 && vis[0].key === id);
            us.forEach(function(u){ loc2.sec.visibility[u.key] = restore ? true : (u.key === id); });
            syncUnitTrendSection(loc2.key);
          } else {
            var ds2 = chart.data.datasets, shown = ds2.filter(function(d){ return !d.hidden; });
            var restore2 = id === '__all__' || (shown.length === 1 && ds2.indexOf(shown[0]) === Number(id));
            ds2.forEach(function(d, i){ d.hidden = restore2 ? false : (i !== Number(id)); });
            if(typeof applyDynamicAxisRange === 'function') applyDynamicAxisRange(chart);
            chart.update('none');
            window.renderDatasetHeaderReadout(wrap, chart, chart._headerReadoutIndex);
          }
        });
      }
    }

    // a unit switched off must also lose its floating name tag on the chart
    if(window.Chart && Chart.register){
      Chart.register({
        id: 'h2SyncHidden',
        afterUpdate: function(chart){
          try { (chart.data.datasets || []).forEach(function(ds, i){ var m = chart.getDatasetMeta(i); if(ds.hidden) m.hidden = true; else if(m.hidden === true && ds.hidden === false) m.hidden = null; }); } catch(e){}
        }
      });
    }
    window.renderDatasetHeaderReadout = function(wrap, chart, hoverIndex){
      orig(wrap, chart, hoverIndex);
      try { decorate(wrap, chart); } catch(e){}
    };
    if(typeof syncUnitTrendSection === 'function'){ syncUnitTrendSection('gen'); syncUnitTrendSection('con'); }
  } catch(e){}
})();
