// Serves the dashboard page. Visitors without a valid session only ever receive a small login page: the dashboard
// code (app.html) is sent to signed-in users only. Known AI / scraper crawlers are refused. A light-theme override and
// a few copy deterrents are added for signed-in users.
const fs = require('fs');
const path = require('path');
const { getConfig } = require('./_lib/config');
const { SESSION_COOKIE_NAME, parseCookies, verifySessionToken } = require('./_lib/session');

const BOT_PATTERN = /(gptbot|chatgpt|oai-searchbot|claudebot|claude-web|anthropic|ccbot|perplexity|bytespider|google-extended|amazonbot|applebot-extended|cohere|diffbot|imagesift|omgili|facebookbot|meta-external|youbot|petalbot|semrush|ahrefs|mj12bot|dotbot|scrapy|python-requests|curl\/|wget\/|httpclient|go-http-client|headlesschrome|phantomjs|puppeteer|playwright)/i;
const ENHANCE_TAG = '<script src="/api/enhance?v=5"></script>';
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

let appHtml = null;
function loadApp() {
  if (appHtml) return appHtml;
  const candidates = [path.join(process.cwd(), 'app.html'), path.join(__dirname, '..', 'app.html')];
  let html = null;
  for (const p of candidates) {
    try { html = fs.readFileSync(p, 'utf8'); break; } catch (e) { /* try next */ }
  }
  if (html === null) throw new Error('app.html not found');
  // light theme only: the page's own start-up script reads the saved theme, so make that always 'light'
  html = html.replace("var saved = localStorage.getItem('h2-theme');",
    "var saved = 'light'; try { localStorage.setItem('h2-theme', 'light'); } catch (e) {}");
  const at = html.lastIndexOf('</body>');
  appHtml = at === -1 ? html : html.slice(0, at) + PROTECT_TAG + ENHANCE_TAG + '\n' + html.slice(at);
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
  var b = document.getElementById('b'); b.textContent = 'Signing in...'; setTimeout(function(){ b.disabled = true; }, 0);
});
// back/forward navigation can restore this page in a frozen state: reset it
window.addEventListener('pageshow', function(e){ if(e.persisted){ var b = document.getElementById('b'); b.disabled = false; b.textContent = 'Sign in'; } });
</script></body></html>`;

function send(res, status, body, type, extra) {
  res.statusCode = status;
  if (extra) Object.keys(extra).forEach(k => res.setHeader(k, extra[k]));
  res.setHeader('Content-Type', type || 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
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
    return send(res, 200, loadApp());
  } catch (e) {
    console.error('page error', e);
    return send(res, 500, 'Dashboard page unavailable', 'text/plain; charset=utf-8');
  }
};
