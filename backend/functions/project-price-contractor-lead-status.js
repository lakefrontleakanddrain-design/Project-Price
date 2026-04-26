const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const env = () => ({
  supabaseUrl: process.env.SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

const supabaseRequest = async (path, { method = 'GET', body, headers = {} } = {}) => {
  const { supabaseUrl, serviceKey } = env();
  if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase env vars.');

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

const signInContractor = async (email, password) => {
  const { supabaseUrl, serviceKey } = env();
  if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase env vars.');

  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const text = await res.text();
  if (!res.ok) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const hasMissingRelationError = (err, relationName) => {
  const text = String(err?.message || err || '');
  return (
    (text.includes('42P01') && text.includes(relationName))
    || (text.includes('PGRST205') && text.includes(relationName))
  );
};

const hasMissingColumnError = (err, columnName) => {
  const text = String(err?.message || err || '');
  return (text.includes('42703') || text.includes('PGRST204')) && text.includes(columnName);
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON.' });
  }

  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const leadRequestId = String(payload.leadRequestId || '').trim();
  const status = String(payload.status || '').trim().toLowerCase();
  const notes = String(payload.notes || '').trim() || null;

  const allowed = new Set(['claimed', 'contacted', 'quoted', 'won', 'lost']);

  if (!email || !password || !leadRequestId || !allowed.has(status)) {
    return jsonResponse(400, { error: 'email, password, leadRequestId, and valid status are required.' });
  }

  try {
    const authData = await signInContractor(email, password);
    const userId = authData?.user?.id;
    if (!userId) return jsonResponse(401, { error: 'Invalid email or password.' });

    const pq = new URLSearchParams({
      user_id: `eq.${userId}`,
      select: 'id,is_verified',
      limit: '1',
    });
    const pros = await supabaseRequest(`/rest/v1/professionals?${pq.toString()}`);
    const professional = pros?.[0];

    if (!professional) return jsonResponse(403, { error: 'This account is not a contractor account.' });
    if (!professional.is_verified) return jsonResponse(403, { error: 'Account is not approved.' });

    const lq = new URLSearchParams({
      id: `eq.${leadRequestId}`,
      claimed_professional_id: `eq.${professional.id}`,
      select: 'id',
      limit: '1',
    });
    const leadRows = await supabaseRequest(`/rest/v1/lead_requests?${lq.toString()}`);
    const lead = leadRows?.[0];
    if (!lead) return jsonResponse(403, { error: 'Lead is not assigned to this contractor.' });

    const nowIso = new Date().toISOString();

    try {
      try {
        await supabaseRequest('/rest/v1/lead_progress', {
          method: 'POST',
          body: {
            lead_request_id: leadRequestId,
            professional_id: professional.id,
            stage: status,
            notes,
            updated_at: nowIso,
          },
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        });
      } catch (err) {
        if (!hasMissingColumnError(err, 'stage')) throw err;
        await supabaseRequest('/rest/v1/lead_progress', {
          method: 'POST',
          body: {
            lead_request_id: leadRequestId,
            professional_id: professional.id,
            status,
            notes,
            updated_at: nowIso,
          },
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        });
      }
    } catch (err) {
      if (hasMissingRelationError(err, 'lead_progress')) {
        return jsonResponse(400, { error: 'lead_progress table not found. Run migration 20260424_admin_denied_and_lead_progress.sql.' });
      }
      throw err;
    }

    return jsonResponse(200, { message: `Lead status updated to ${status}.` });
  } catch (err) {
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Unexpected error.' });
  }
};
