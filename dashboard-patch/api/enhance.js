// Serves the dashboard add-on script to signed-in users only (it is not a public static file).
const fs = require('fs');
const path = require('path');
const { getConfig } = require('./_lib/config');
const { SESSION_COOKIE_NAME, parseCookies, verifySessionToken } = require('./_lib/session');

let cached = null;
module.exports = (req, res) => {
  try {
    const config = getConfig();
    if (!verifySessionToken(parseCookies(req)[SESSION_COOKIE_NAME], config.sessionSecret)) {
      res.statusCode = 404; res.setHeader('Cache-Control', 'no-store'); return res.end('Not found');
    }
    if (!cached) {
      const candidates = [path.join(process.cwd(), 'dashboard-enhance.js'), path.join(__dirname, '..', 'dashboard-enhance.js')];
      for (const p of candidates) { try { cached = fs.readFileSync(p, 'utf8'); break; } catch (e) { /* next */ } }
    }
    if (cached === null) throw new Error('dashboard-enhance.js not found');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(cached);
  } catch (e) {
    console.error('enhance error', e);
    res.statusCode = 500; res.end('');
  }
};
