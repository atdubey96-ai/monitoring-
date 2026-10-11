const DASHBOARD_SELECT_COLUMNS = [
  'snapshot_time',
  'pushed_at',
  'is_final',
  'total_generation',
  'total_consumption',
  'difference',
  'gen_hgu3',
  'gen_psa2',
  'gen_msq',
  'gen_hgu1',
  'gen_hgu4',
  'gen_hgu2_syn_gas',
  'con_hgu3',
  'con_vgo',
  'con_dhdt1',
  'con_dhds',
  'con_dhdt2',
  'con_isom',
  'con_sru',
  'con_hgu4',
  'con_lab',
  'con_ghc',
  'con_hgu1',
  'con_nba',
  'header_pressure_dhdt1',
  'ghc_fg_opening',
  'ghc_flare_opening'
];

function normalizeSupabaseUrl(value){
  return String(value || '')
    .trim()
    .replace(/\/rest\/v1\/?$/,'')
    .replace(/\/+$/,'');
}

function getConfig(){
  const url = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const apiKey = String(process.env.SUPABASE_API_KEY || process.env.SUPABASE_ANON_KEY || '');
  const table = String(process.env.SUPABASE_TABLE || 'h2_material_balance');
  const timeColumn = String(process.env.SUPABASE_TIME_COLUMN || 'snapshot_time');
  const pushedAtColumn = String(process.env.SUPABASE_PUSHED_AT_COLUMN || 'pushed_at');
  const maxRows = Math.max(1, Math.min(5000, Number(process.env.SUPABASE_MAX_ROWS || 1440)));
  const overrideBucket = String(process.env.SUPABASE_OVERRIDE_BUCKET || 'h2-dashboard-state').trim() || 'h2-dashboard-state';
  const overrideObjectKey = String(process.env.SUPABASE_OVERRIDE_OBJECT_KEY || 'operator-stream-overrides.json').trim().replace(/^\/+/, '') || 'operator-stream-overrides.json';
  const authUser = String(process.env.H2_AUTH_USER || '');
  const authPassword = String(process.env.H2_AUTH_PASSWORD || '');
  const sessionSecret = String(process.env.H2_SESSION_SECRET || '');

  if(!url || !apiKey || !authUser || !authPassword || !sessionSecret){
    const error = new Error('Missing required secure dashboard environment variables.');
    error.code = 'CONFIG_MISSING';
    throw error;
  }

  return {
    supabaseUrl:url,
    supabaseApiKey:apiKey,
    supabaseTable:table,
    supabaseTimeColumn:timeColumn,
    supabasePushedAtColumn:pushedAtColumn,
    supabaseMaxRows:maxRows,
    overrideBucket,
    overrideObjectKey,
    authUser,
    authPassword,
    sessionSecret,
    selectColumns:DASHBOARD_SELECT_COLUMNS
  };
}

function sendJson(res, statusCode, payload, extraHeaders={}){
  res.statusCode = statusCode;
  Object.entries({
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store, max-age=0',
    ...extraHeaders
  }).forEach(([key, value])=>res.setHeader(key, value));
  res.end(JSON.stringify(payload));
}

function sendMethodNotAllowed(res, allowed){
  sendJson(res, 405, { error:'Method not allowed' }, { Allow:allowed });
}

async function fetchSupabase(config, query){
  return fetch(`${config.supabaseUrl}/rest/v1/${config.supabaseTable}${query}`, {
    headers:{
      apikey:config.supabaseApiKey,
      Authorization:`Bearer ${config.supabaseApiKey}`,
      Accept:'application/json'
    }
  });
}

async function fetchSupabaseStorage(config, path, options={}){
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return fetch(`${config.supabaseUrl}/storage/v1${normalizedPath}`, {
    method:options.method || 'GET',
    headers:{
      apikey:config.supabaseApiKey,
      Authorization:`Bearer ${config.supabaseApiKey}`,
      ...(options.headers || {})
    },
    body:options.body
  });
}

module.exports = {
  getConfig,
  sendJson,
  sendMethodNotAllowed,
  fetchSupabase,
  fetchSupabaseStorage
};
