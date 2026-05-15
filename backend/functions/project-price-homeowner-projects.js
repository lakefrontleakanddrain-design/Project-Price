const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
  },
  body: JSON.stringify(body),
});

const env = () => ({
  supabaseUrl: process.env.SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

const supabaseRequest = async (path, { method = 'GET', body, headers = {} } = {}) => {
  const { supabaseUrl, serviceKey } = env();
  if (!supabaseUrl || !serviceKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');

  const res = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase error ${res.status}: ${text}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return jsonResponse(204, {});
    if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method not allowed.' });

    const homeownerId = event.queryStringParameters?.homeownerId || event.queryStringParameters?.owner_id;
    if (!homeownerId) return jsonResponse(400, { error: 'homeownerId required.' });

    const q = new URLSearchParams({
      select: 'id,name,description,currency,created_at,updated_at,photo_url',
      owner_id: `eq.${homeownerId}`,
      order: 'created_at.desc',
      limit: '500',
    });

    const projects = await supabaseRequest(`/rest/v1/projects?${q.toString()}`);
    return jsonResponse(200, { projects: projects || [] });
  } catch (err) {
    return jsonResponse(500, { error: err.message || 'Unexpected error.' });
  }
};
