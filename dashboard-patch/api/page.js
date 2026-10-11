// Serves the dashboard page. Visitors without a valid session only ever receive a small login page: the dashboard
// code (app.html) is sent to signed-in users only. Known AI / scraper crawlers are refused. A light-theme override and
// a few copy deterrents are added for signed-in users.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getConfig } = require('./_lib/config');
const { SESSION_COOKIE_NAME, parseCookies, verifySessionToken } = require('./_lib/session');

const BOT_PATTERN = /(gptbot|chatgpt|oai-searchbot|claudebot|claude-web|anthropic|ccbot|perplexity|bytespider|google-extended|amazonbot|applebot-extended|cohere|diffbot|imagesift|omgili|facebookbot|meta-external|youbot|petalbot|semrush|ahrefs|mj12bot|dotbot|scrapy|python-requests|curl\/|wget\/|httpclient|go-http-client|headlesschrome|phantomjs|puppeteer|playwright)/i;
// Fetch with timeout + retry (GET only). Some office networks silently drop reused connections, so a request can hang
// forever; aborting after a few seconds and trying again opens a fresh connection.
const RETRY_TAG = `<script>(function(){
  if(!window.fetch || !window.AbortController) return;
  var orig = window.fetch.bind(window);
  window.fetch = function(input, init){
    init = init || {};
    var method = String(init.method || (input && input.method) || 'GET').toUpperCase();
    if(method !== 'GET' || init.signal || (input && input.signal)) return orig(input, init);
    return new Promise(function(resolve, reject){
      var ctls = [], done = false, launched = 0, fails = 0, timers = [];
      function finish(){ done = true; timers.forEach(clearTimeout); }
      function launch(){
        if(done || launched >= 4) return;
        launched++;
        var ctl = new AbortController(); ctls.push(ctl);
        var opts = {}; for(var k in init){ opts[k] = init[k]; } opts.signal = ctl.signal;
        orig(input, opts).then(function(r){
          if(done) return;
          finish(); ctls.forEach(function(c){ if(c !== ctl) c.abort(); }); resolve(r);
        }, function(e){
          if(done) return;
          fails++;
          if(fails >= launched){ if(launched >= 4){ finish(); reject(e); } else { launch(); } }
        });
      }
      launch();
      timers.push(setTimeout(launch, 3500), setTimeout(launch, 7000), setTimeout(launch, 11000));
      timers.push(setTimeout(function(){ if(!done){ finish(); ctls.forEach(function(c){ c.abort(); }); reject(new Error('timeout')); } }, 30000));
    });
  };
})();</script>`;
const PROTECT_TAG = `<script>(function(){
  var stop = function(e){ e.preventDefault(); return false; };
  document.addEventListener('contextmenu', stop);
  document.addEventListener('dragstart', stop);
  document.addEventListener('keydown', function(e){
    var k = (e.key || '').toLowerCase();
    if(e.key === 'F12' || (e.ctrlKey && e.shiftKey && 'ijc'.indexOf(k) !== -1) || (e.metaKey && e.altKey && 'ijc'.indexOf(k) !== -1)
       || ((e.ctrlKey || e.metaKey) && (k === 'u' || k === 's'))) return stop(e);
  });
})();</script>`;

// views that are hidden (see dashboard-enhance.js): a saved last-visited tab or a #link to one must fall back to Overview
const HIDDEN_TABS_JS = "['simulator','economics','reports']";

let appHtml = null;
let appEtag = null;
function readBundled(name) {
  const candidates = [path.join(process.cwd(), name), path.join(__dirname, '..', name)];
  for (const p of candidates) {
    try { return fs.readFileSync(p, 'utf8'); } catch (e) { /* try next */ }
  }
  throw new Error(name + ' not found');
}
function loadApp() {
  if (appHtml) return appHtml;
  let html = readBundled('app.html');
  // light theme only: the page's own start-up script reads the saved theme, so make that always 'light'
  html = html.replace("var saved = localStorage.getItem('h2-theme');",
    "var saved = 'light'; try { localStorage.setItem('h2-theme', 'light'); } catch (e) {}\n" +
    "    try { var lt = localStorage.getItem('h2-last-tab'); if (" + HIDDEN_TABS_JS + ".indexOf(lt) !== -1) localStorage.setItem('h2-last-tab', 'overview'); } catch (e) {}");
  // a link or bookmark to a hidden view (#simulator ...) must not crash start-up either
  html = html.replace("if(tabButtons.some(button => button.dataset.tabTrigger === fromHash)) return fromHash;",
    "if(" + HIDDEN_TABS_JS + ".indexOf(fromHash) === -1 && tabButtons.some(button => button.dataset.tabTrigger === fromHash)) return fromHash;");
  // everything the page needs travels in ONE response (chart library + add-on inline), so a stalled extra request
  // can no longer leave the page blank
  try {
    const chartLib = readBundled('chart.umd.min.js');
    html = html.replace('<script src="chart.umd.min.js"></script>', () => '<script>' + chartLib + '</script>');
  } catch (e) { console.error('chart library not bundled, using the separate file', e.message); }
  html = html.replace('<head>', () => '<head>' + RETRY_TAG);
  // the web-font stylesheet must never block the first paint (it comes from another server and can stall)
  html = html.replace(/(<link href="https:\/\/fonts\.googleapis\.com[^>]*?) rel="stylesheet">/, (m, a) => a + ' rel="stylesheet" media="print" onload="this.media=\'all\'">');
  let enhanceTag;
  try { enhanceTag = '<script>' + readBundled('dashboard-enhance.js') + '</script>'; }
  catch (e) { console.error('add-on not bundled, using the separate script', e.message); enhanceTag = '<script src="/api/enhance?v=6"></script>'; }
  const at = html.lastIndexOf('</body>');
  const tail = PROTECT_TAG + enhanceTag + '\n';
  appHtml = at === -1 ? html + tail : html.slice(0, at) + tail + html.slice(at);
  appEtag = '"' + crypto.createHash('sha1').update(appHtml).digest('hex').slice(0, 20) + '"';
  return appHtml;
}

const LOGIN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
<title>H2 Balance - Sign in</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#eef2f8;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#14233a}
  form{width:min(360px,calc(100vw - 32px));background:#fff;border-radius:20px;padding:28px 24px;box-shadow:0 10px 40px rgba(30,80,140,.12)}
  h1{margin:0 0 4px;font-size:20px} p{margin:0 0 18px;color:#6b7f99;font-size:13px}
  label{display:block;font-size:12px;font-weight:600;margin:12px 0 6px;color:#44566f}
  input{width:100%;height:42px;border:1px solid #cdd8e6;border-radius:12px;padding:0 12px;font-size:15px;background:#f8fafd}
  input:focus{outline:2px solid #1a6fe8;outline-offset:1px}
  button{width:100%;height:44px;margin-top:18px;border:0;border-radius:12px;background:#1a6fe8;color:#fff;font-size:15px;font-weight:700;cursor:pointer}
  button:disabled{opacity:.6;cursor:default}
  #err{min-height:18px;margin-top:12px;color:#c62839;font-size:13px}
</style></head>
<body>
<form id="f" method="POST" action="/api/login" autocomplete="on">
  <h1>H&#8322; Balance</h1><p>Indian Oil Corporation Ltd. &middot; secure sign-in</p>
  <label for="u">User ID</label><input id="u" name="username" autocomplete="username" required autofocus>
  <label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required>
  <button id="b" type="submit">Sign in</button><div id="err" role="alert">__ERR__</div>
</form>
<script>
document.addEventListener('contextmenu', function(e){ e.preventDefault(); });
// clear any old offline copy / service worker from earlier versions
try { if(navigator.serviceWorker){ navigator.serviceWorker.getRegistrations().then(function(rs){ rs.forEach(function(r){ r.unregister(); }); }); }
      if(window.caches){ caches.keys().then(function(ks){ ks.forEach(function(k){ caches.delete(k); }); }); } } catch(e){}
document.getElementById('f').addEventListener('submit', function(){
  var b = document.getElementById('b'), err = document.getElementById('err');
  b.textContent = 'Signing in...'; setTimeout(function(){ b.disabled = true; }, 0);
  // slow or dropped network: after 12 s let the user try again instead of waiting forever
  setTimeout(function(){ try { window.stop(); } catch(e){} b.disabled = false; b.textContent = 'Sign in';
    err.textContent = 'The network is slow. Please press Sign in again.'; }, 12000);
});
// back/forward navigation can restore this page in a frozen state: reset it
window.addEventListener('pageshow', function(e){ if(e.persisted){ var b = document.getElementById('b'); b.disabled = false; b.textContent = 'Sign in'; } });
</script></body></html>`;

function send(res, status, body, type, extra) {
  res.statusCode = status;
  if (extra) Object.keys(extra).forEach(k => res.setHeader(k, extra[k]));
  res.setHeader('Content-Type', type || 'text/html; charset=utf-8');
  if (!res.getHeader || !res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.end(body);
}

module.exports = (req, res) => {
  try {
    const ua = String(req.headers['user-agent'] || '');
    if (!ua || BOT_PATTERN.test(ua)) return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
    const config = getConfig();
    const token = parseCookies(req)[SESSION_COOKIE_NAME];
    if (!verifySessionToken(token, config.sessionSecret)) {
      const code = new URL(req.url || '/', 'http://x').searchParams.get('e');
      const msg = { '403': 'Invalid user ID or password.', '429': 'Too many attempts. Please wait a few minutes.', '500': 'Server error. Please try again.' }[code] || '';
      console.info('page login', ua.slice(0, 70));
      return send(res, 200, LOGIN_HTML.replace('__ERR__', msg));
    }
    console.info('page app', ua.slice(0, 70));
    const html = loadApp();
    res.setHeader('ETag', appEtag);
    if (req.headers['if-none-match'] === appEtag) {
      res.statusCode = 304;
      res.setHeader('Cache-Control', 'private, no-cache');
      return res.end();
    }
    res.setHeader('Cache-Control', 'private, no-cache');
    return send(res, 200, html, undefined, { 'Cache-Control': 'private, no-cache' });
  } catch (e) {
    console.error('page error', e);
    return send(res, 500, 'Dashboard page unavailable', 'text/plain; charset=utf-8');
  }
};
