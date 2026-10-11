// Self-test page for the browser: open /api/diag in the window that has the problem. It times each part of the
// dashboard (page, script, data) and shows what the browser remembers (service worker, saved tab, cookies).
// It contains no secrets and changes nothing.
const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>H2 Balance - self test</title>
<style>
 body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:24px;max-width:820px;color:#14233a}
 h1{font-size:20px} table{border-collapse:collapse;width:100%;margin:12px 0;font-size:14px}
 td,th{border:1px solid #d5deea;padding:6px 8px;text-align:left} th{background:#f0f4fa}
 .ok{color:#0a7d3c;font-weight:700}.bad{color:#c62839;font-weight:700}.wait{color:#8a6d00}
 button{padding:10px 16px;border:0;border-radius:10px;background:#1a6fe8;color:#fff;font-weight:700;cursor:pointer}
 pre{background:#f6f8fb;padding:10px;border-radius:8px;white-space:pre-wrap;font-size:13px}
</style></head><body>
<h1>H&#8322; Balance - browser self test</h1>
<p>Please wait about 40 seconds, then press <b>Copy result</b> and paste it in your message (or take a screenshot).</p>
<table id="t"><tr><th>Test</th><th>Result</th><th>Time</th><th>Size</th></tr></table>
<h3>What this browser remembers</h3><pre id="mem">checking...</pre>
<button id="cp">Copy result</button> <span id="cpmsg"></span>
<script>
var rows = [], t = document.getElementById('t');
function add(name, res, ms, size, cls){
  rows.push(name + ' | ' + res + ' | ' + ms + ' ms | ' + size);
  var r = t.insertRow(-1); r.innerHTML = '<td></td><td class="' + cls + '"></td><td></td><td></td>';
  r.cells[0].textContent = name; r.cells[1].textContent = res; r.cells[2].textContent = ms + ' ms'; r.cells[3].textContent = size;
}
function test(name, url, opts){
  return new Promise(function(done){
    var t0 = performance.now(), ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function(){ if(ctl) ctl.abort(); }, 15000);
    fetch(url, Object.assign({ credentials:'same-origin', cache:'no-store', signal: ctl ? ctl.signal : undefined }, opts || {}))
      .then(function(r){ return r.arrayBuffer().then(function(b){ clearTimeout(timer);
        var txt = ''; try { txt = new TextDecoder().decode(b.slice(0, 4000)); } catch(e){}
        var note = r.status + (name.indexOf('page') === 0 ? (txt.indexOf('secure sign-in') !== -1 ? ' (login page)' : txt.indexOf('computeDynamic') !== -1 || txt.length > 3000 ? ' (dashboard)' : '') : '');
        add(name, note, Math.round(performance.now() - t0), b.byteLength + ' bytes', r.ok || r.status === 401 ? 'ok' : 'bad'); done(); }); })
      .catch(function(e){ clearTimeout(timer); add(name, 'FAILED / no answer (' + (e && e.name) + ')', Math.round(performance.now() - t0), '-', 'bad'); done(); });
  });
}
(async function(){
  await test('server ping', '/api/ping');
  await test('static file: chart library', '/chart.umd.min.js');
  await test('static file: manifest', '/manifest.json');
  await test('session check', '/api/auth-status');
  await test('data (1 hour)', '/api/dashboard-data?minutes=60');
  await test('page: dashboard / login', '/');
  await test('add-on script', '/api/enhance');
  var mem = [];
  try {
    var es = performance.getEntriesByType('resource').filter(function(e){ return e.initiatorType === 'fetch'; });
    es.forEach(function(e){ mem.push('net: ' + e.name.replace(location.origin, '') + ' protocol=' + (e.nextHopProtocol || '?') +
      ' wait=' + Math.round(e.responseStart - e.requestStart) + 'ms download=' + Math.round(e.responseEnd - e.responseStart) + 'ms'); });
  } catch(e){}
  mem.push('browser: ' + navigator.userAgent);
  mem.push('online: ' + navigator.onLine);
  try { mem.push('page controlled by service worker: ' + !!(navigator.serviceWorker && navigator.serviceWorker.controller)); } catch(e){}
  try { var rs = await navigator.serviceWorker.getRegistrations(); mem.push('service workers registered: ' + rs.length + ' ' + rs.map(function(r){ return (r.active && r.active.scriptURL) || ''; }).join(', ')); } catch(e){ mem.push('service workers: n/a'); }
  try { mem.push('cache storage: ' + (await caches.keys()).join(', ')); } catch(e){}
  try { var ks = []; for(var i = 0; i < localStorage.length; i++) ks.push(localStorage.key(i)); mem.push('saved items: ' + ks.join(', ')); mem.push('saved last tab: ' + localStorage.getItem('h2-last-tab')); } catch(e){ mem.push('saved items: blocked'); }
  mem.push('window: ' + window.innerWidth + 'x' + window.innerHeight + ', time ' + new Date().toISOString());
  document.getElementById('mem').textContent = mem.join('\\n');
  window.__result = rows.join('\\n') + '\\n' + mem.join('\\n');
})();
document.getElementById('cp').onclick = function(){
  var txt = window.__result || rows.join('\\n');
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function(){ document.getElementById('cpmsg').textContent = 'copied'; }, function(){ document.getElementById('cpmsg').textContent = 'copy not allowed - please take a screenshot'; });
};
</script></body></html>`;

module.exports = (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.end(PAGE);
};
