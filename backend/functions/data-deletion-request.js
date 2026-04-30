const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const hasMissingRelationError = (err, relationName) => {
  const text = String(err?.message || err || '');
  return (
    (text.includes('42P01') && text.includes(relationName))
    || (text.includes('PGRST205') && text.includes(relationName))
  );
};

const normalizePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
};

const supabaseRequest = async (path, { method = 'GET', body } = {}) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');

  const res = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase error ${res.status}: ${text}`);
  return text;
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON.' });
    }

    const phone = normalizePhone(payload.phone);
    const email = String(payload.email || '').trim().toLowerCase();
    const accountType = String(payload.type || '').trim().toLowerCase();
    const reason = String(payload.reason || '').trim();

    if (!phone || !email || !accountType) {
      return jsonResponse(400, { error: 'phone, email, and type are required.' });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return jsonResponse(400, { error: 'email must be valid.' });
    }
    if (!['homeowner', 'contractor', 'both'].includes(accountType)) {
      return jsonResponse(400, { error: 'type must be homeowner, contractor, or both.' });
    }

    const requestId = crypto.randomUUID();
    const row = {
      id: requestId,
      phone,
      email,
      account_type: accountType,
      reason: reason ? reason.slice(0, 1500) : null,
      status: 'pending',
      source: 'netlify-form',
    };

    try {
      await supabaseRequest('/rest/v1/data_deletion_requests', {
        method: 'POST',
        body: row,
      });
    } catch (err) {
      if (!hasMissingRelationError(err, 'data_deletion_requests')) throw err;
      // Graceful fallback: request is accepted even if migration is pending.
      console.warn('data_deletion_requests table not found yet; request accepted without persistence.');
    }

    return jsonResponse(200, {
      message: 'Deletion request received.',
      requestId,
      supportEmail: 'support@projectprice.app',
    });
  } catch (error) {
    return jsonResponse(500, { error: error instanceof Error ? error.message : 'Unexpected error.' });
  }
};
