const { getConfig, sendJson, sendMethodNotAllowed, fetchSupabase } = require('./_lib/config');
const { requireAuth } = require('./_lib/session');
const { despike } = require('./_lib/despike');

module.exports = async (req, res) => {
  if(req.method !== 'GET'){
    return sendMethodNotAllowed(res, 'GET');
  }

  try {
    const config = getConfig();
    const session = requireAuth(req, res, config.sessionSecret);
    if(!session){
      return;
    }

    const url = new URL(req.url, 'http://localhost');
    const minutes = Math.max(0, Math.min(7 * 24 * 60, Number(url.searchParams.get('minutes') || 0)));
    const params = new URLSearchParams({
      select:config.selectColumns.join(','),
      order:`${config.supabaseTimeColumn}.desc`,
      limit:String(config.supabaseMaxRows)
    });

    if(minutes > 0){
      const since = new Date(Date.now() - minutes * 60000).toISOString();
      params.set(config.supabaseTimeColumn, `gte.${since}`);
    }

    const upstream = await fetchSupabase(config, `?${params.toString()}`);
    if(!upstream.ok){
      const text = await upstream.text();
      return sendJson(res, upstream.status, { error:'Upstream data request failed', detail:text.slice(0, 300) });
    }

    const rows = despike(await upstream.json(), undefined, config.supabaseTimeColumn, config.supabasePushedAtColumn);
    return sendJson(res, 200, { rows });
  } catch(err){
    console.error('dashboard-data error', err);
    return sendJson(res, 500, { error:'Unable to fetch dashboard data' });
  }
};
