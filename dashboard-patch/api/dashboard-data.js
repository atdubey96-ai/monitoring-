const { getConfig, sendJson, sendMethodNotAllowed, fetchSupabase } = require('./_lib/config');
const { requireAuth } = require('./_lib/session');
const { despike, readOptions } = require('./_lib/despike');

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

    let upstream = await fetchSupabase(config, `?${params.toString()}`);
    if(!upstream.ok && upstream.status === 400){
      // is_final column not created yet (provisional/final SQL not run): retry without it
      const detail = await upstream.clone().text();
      if(detail.includes('is_final')){
        params.set('select', config.selectColumns.filter(col => col !== 'is_final').join(','));
        upstream = await fetchSupabase(config, `?${params.toString()}`);
      }
    }
    if(!upstream.ok){
      const text = await upstream.text();
      return sendJson(res, upstream.status, { error:'Upstream data request failed', detail:text.slice(0, 300) });
    }

    const options = readOptions();
    if(url.searchParams.get('live') === '1') options.showLive = true;     // opt in to the unsettled live tail
    const rows = despike(await upstream.json(), options, config.supabaseTimeColumn, config.supabasePushedAtColumn);
    return sendJson(res, 200, { rows });
  } catch(err){
    console.error('dashboard-data error', err);
    return sendJson(res, 500, { error:'Unable to fetch dashboard data' });
  }
};
