const { getConfig, sendJson, sendMethodNotAllowed } = require('./_lib/config');
const { safeCompareText, setSessionCookie } = require('./_lib/session');

async function readBody(req){
  const chunks = [];
  for await (const chunk of req){
    chunks.push(chunk);
  }
  const text = chunks.length ? Buffer.concat(chunks).toString('utf8') : '';
  if(!text){
    return {};
  }
  const type = String(req.headers['content-type'] || '').toLowerCase();
  if(type.includes('application/x-www-form-urlencoded')){
    return Object.fromEntries(new URLSearchParams(text));
  }
  return JSON.parse(text);
}

// The sign-in page uses a plain HTML form (most compatible): answer with a redirect instead of JSON.
function isFormPost(req){
  return String(req.headers['content-type'] || '').toLowerCase().includes('application/x-www-form-urlencoded');
}
function redirect(res, location){
  res.statusCode = 303;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end();
}

// Brute-force protection (per server instance): 5 wrong attempts from one address lock it out for 15 minutes,
// and every wrong attempt is slowed down.
const attempts = new Map();
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
function clientKey(req){
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = async (req, res) => {
  if(req.method !== 'POST'){
    return sendMethodNotAllowed(res, 'POST');
  }

  try {
    const key = clientKey(req);
    const entry = attempts.get(key);
    if(entry && entry.until > Date.now()){
      return isFormPost(req) ? redirect(res, '/?e=429') : sendJson(res, 429, { error:'Too many attempts. Try again later.' });
    }
    const config = getConfig();
    const body = await readBody(req);
    const username = String(body?.username || '').trim();
    const password = String(body?.password || '');

    if(!safeCompareText(username, config.authUser) || !safeCompareText(password, config.authPassword)){
      let current = attempts.get(key) || { count:0, until:0 };
      if(current.until && current.until <= Date.now()) current = { count:0, until:0 };
      current.count += 1;
      if(current.count >= MAX_FAILS){ current.until = Date.now() + LOCK_MS; current.count = 0; }
      attempts.set(key, current);
      if(attempts.size > 5000) attempts.clear();
      console.warn('failed login from', key);
      await sleep(700);
      return isFormPost(req) ? redirect(res, '/?e=403') : sendJson(res, 403, { error:'Invalid credentials' });
    }

    attempts.delete(key);
    console.info('login ok', key);
    setSessionCookie(req, res, config.authUser, config.sessionSecret);
    return isFormPost(req) ? redirect(res, '/') : sendJson(res, 200, { authenticated:true, user:config.authUser });
  } catch(err){
    console.error('login error', err);
    return isFormPost(req) ? redirect(res, '/?e=500') : sendJson(res, 500, { error:'Unable to complete secure login' });
  }
};
