const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
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

const hasMissingRelationError = (err, relationName) => {
  const text = String(err?.message || err || '');
  return (
    (text.includes('42P01') && text.includes(relationName))
    || (text.includes('PGRST205') && text.includes(relationName))
  );
};

const sanitize = (value, max = 500) => {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : null;
};

const getRequestIp = (event) => String(
  event?.headers?.['x-nf-client-connection-ip']
  || event?.headers?.['client-ip']
  || event?.headers?.['x-forwarded-for']
  || ''
).split(',')[0].trim() || null;

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return jsonResponse(204, {});
    if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON.' });
    }

    const pagePath = sanitize(payload.pagePath || payload.path, 300);
    const pageUrl = sanitize(payload.pageUrl || payload.url, 1200);
    const referrerUrl = sanitize(payload.referrerUrl || payload.referrer, 1200);
    const referrerHost = sanitize(payload.referrerHost, 255);
    const sessionId = sanitize(payload.sessionId, 120);

    if (!pagePath && !pageUrl) {
      return jsonResponse(400, { error: 'pagePath or pageUrl is required.' });
    }

    const row = {
      session_id: sessionId,
      page_path: pagePath,
      page_url: pageUrl,
      referrer_url: referrerUrl,
      referrer_host: referrerHost,
      source: sanitize(payload.utmSource || payload.source, 120),
      medium: sanitize(payload.utmMedium || payload.medium, 120),
      campaign: sanitize(payload.utmCampaign || payload.campaign, 180),
      term: sanitize(payload.utmTerm || payload.term, 180),
      content: sanitize(payload.utmContent || payload.content, 180),
      landing_path: sanitize(payload.landingPath, 300),
      client_ip: getRequestIp(event),
      user_agent: sanitize(event?.headers?.['user-agent'] || event?.headers?.['User-Agent'], 600),
    };

    try {
      await supabaseRequest('/rest/v1/web_page_events', {
        method: 'POST',
        body: row,
        headers: { Prefer: 'return=minimal' },
      });
    } catch (err) {
      if (!hasMissingRelationError(err, 'web_page_events')) throw err;
      return jsonResponse(202, { ok: true, skipped: 'web_page_events table not found yet' });
    }

    return jsonResponse(200, { ok: true });
  } catch (err) {
    return jsonResponse(500, { error: err.message || 'Unexpected error.' });
  }
};
