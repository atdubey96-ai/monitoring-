// Serves the dashboard page (stored as app.html) with the add-on script injected on the server,
// so features such as the hidden sidebar items do not depend on the browser's service worker.
const fs = require('fs');
const path = require('path');

const TAG = '<script src="/dashboard-enhance.js?v=3"></script>';
let cached = null;

function load() {
  if (cached) return cached;
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
  cached = at === -1 ? html : html.slice(0, at) + TAG + '\n' + html.slice(at);
  return cached;
}

module.exports = (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.status(200).send(load());
  } catch (e) {
    res.status(500).send('Dashboard page unavailable');
  }
};
