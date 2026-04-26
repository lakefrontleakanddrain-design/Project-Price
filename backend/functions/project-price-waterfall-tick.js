const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const env = () => ({
  supabaseUrl: process.env.SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  appBaseUrl: process.env.APP_BASE_URL || '',
  waterfallCronKey: process.env.WATERFALL_CRON_KEY || '',
});

exports.config = {
  schedule: '*/2 * * * *',
};

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
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const callWaterfall = async (leadRequestId) => {
  const { appBaseUrl, waterfallCronKey } = env();
  if (!appBaseUrl) throw new Error('Missing APP_BASE_URL.');

  const endpoint = `${appBaseUrl.replace(/\/$/, '')}/.netlify/functions/project-price-waterfall`;
  const headers = { 'Content-Type': 'application/json' };
  if (waterfallCronKey) headers['x-waterfall-cron-key'] = waterfallCronKey;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ leadRequestId }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Waterfall call failed ${res.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const hasActiveOffer = (offers, nowMs) => offers.some((o) => {
  if (o.response) return false;
  if (!o.offered_at || !o.expires_at) return false;
  return new Date(o.expires_at).getTime() > nowMs;
});

const hasExpiredPendingOffer = (offers, nowMs) => offers.some((o) => {
  if (o.response) return false;
  if (!o.offered_at || !o.expires_at) return false;
  return new Date(o.expires_at).getTime() <= nowMs;
});

exports.handler = async (event) => {
  try {
    const { waterfallCronKey } = env();

    // Allow manual secured trigger in addition to schedule invocations.
    if (event?.httpMethod === 'POST' && waterfallCronKey) {
      const provided = event.headers?.['x-waterfall-cron-key'] || event.headers?.['X-Waterfall-Cron-Key'] || '';
      if (provided !== waterfallCronKey) return jsonResponse(401, { error: 'Unauthorized.' });
    }

    const pendingLeads = await supabaseRequest('/rest/v1/lead_requests?select=id,status&status=eq.pending&order=created_at.asc&limit=500');
    const leads = Array.isArray(pendingLeads) ? pendingLeads : [];
    const nowMs = Date.now();

    let inspected = 0;
    let advanced = 0;
    let skippedActive = 0;
    let errors = 0;

    for (const lead of leads) {
      inspected += 1;

      try {
        const q = new URLSearchParams({
          lead_request_id: `eq.${lead.id}`,
          select: 'id,offered_at,expires_at,response',
          order: 'position.asc',
        });
        const offers = await supabaseRequest(`/rest/v1/lead_offers?${q.toString()}`);
        const rows = Array.isArray(offers) ? offers : [];

        if (rows.length === 0) {
          await callWaterfall(lead.id);
          advanced += 1;
          continue;
        }

        if (hasActiveOffer(rows, nowMs)) {
          skippedActive += 1;
          continue;
        }

        const unresolved = rows.filter((o) => !o.response);
        const shouldAdvance = unresolved.length === 0 || hasExpiredPendingOffer(rows, nowMs);

        if (shouldAdvance) {
          await callWaterfall(lead.id);
          advanced += 1;
        }
      } catch {
        errors += 1;
      }
    }

    return jsonResponse(200, {
      message: 'Waterfall tick completed.',
      inspected,
      advanced,
      skippedActive,
      errors,
    });
  } catch (error) {
    return jsonResponse(500, { error: error instanceof Error ? error.message : 'Unexpected error.' });
  }
};
