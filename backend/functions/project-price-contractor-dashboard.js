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
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

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

const getAuthUserEmail = async (userId) => {
  const { supabaseUrl, serviceKey } = env();
  if (!supabaseUrl || !serviceKey || !userId) return null;

  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    return data?.email || data?.user?.email || null;
  } catch {
    return null;
  }
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method not allowed.' });

    const leadRequestId = event.queryStringParameters?.leadRequestId;
    const professionalId = event.queryStringParameters?.professionalId;

    if (!leadRequestId || !professionalId) {
      return jsonResponse(400, { error: 'leadRequestId and professionalId are required.' });
    }

    let lead;
    try {
      const lq = new URLSearchParams({
        id: `eq.${leadRequestId}`,
        claimed_professional_id: `eq.${professionalId}`,
        select: 'id,status,specialty,zip_code,project_id,homeowner_id,homeowner_email,homeowner_phone,created_at',
        limit: '1',
      });
      const leadRows = await supabaseRequest(`/rest/v1/lead_requests?${lq.toString()}`);
      lead = leadRows?.[0];
    } catch (err) {
      const text = String(err?.message || err || '');
      if (!text.includes('homeowner_email') && !text.includes('homeowner_phone')) throw err;
      const lq = new URLSearchParams({
        id: `eq.${leadRequestId}`,
        claimed_professional_id: `eq.${professionalId}`,
        select: 'id,status,specialty,zip_code,project_id,homeowner_id,created_at',
        limit: '1',
      });
      const leadRows = await supabaseRequest(`/rest/v1/lead_requests?${lq.toString()}`);
      lead = leadRows?.[0];
    }

    if (!lead) {
      return jsonResponse(404, { error: 'Claimed lead not found for this contractor.' });
    }

    const oq = new URLSearchParams({
      lead_request_id: `eq.${leadRequestId}`,
      professional_id: `eq.${professionalId}`,
      response: 'eq.yes',
      select: 'responded_at',
      order: 'responded_at.desc',
      limit: '1',
    });
    const offerRows = await supabaseRequest(`/rest/v1/lead_offers?${oq.toString()}`);
    const claimedAt = offerRows?.[0]?.responded_at || null;

    const pq = new URLSearchParams({
      id: `eq.${lead.project_id}`,
      select: 'id,name,project_type,zip_code,description,estimated_cost_range,photo_url',
      limit: '1',
    });
    const projectRows = await supabaseRequest(`/rest/v1/projects?${pq.toString()}`);
    const project = projectRows?.[0] || null;

    const hq = new URLSearchParams({
      id: `eq.${lead.homeowner_id}`,
      select: 'id,full_name,phone,zip_code',
      limit: '1',
    });
    const homeownerRows = await supabaseRequest(`/rest/v1/users?${hq.toString()}`);
    const homeowner = homeownerRows?.[0] || null;
    const homeownerEmail = lead?.homeowner_email || (homeowner?.id ? await getAuthUserEmail(homeowner.id) : null);

    return jsonResponse(200, {
      lead: {
        id: lead.id,
        status: lead.status,
        specialty: lead.specialty,
        zipCode: lead.zip_code,
        createdAt: lead.created_at,
        claimedAt,
      },
      project: {
        id: project?.id || null,
        name: project?.name || null,
        projectType: project?.project_type || null,
        zipCode: project?.zip_code || null,
        description: project?.description || null,
        estimatedCostRange: project?.estimated_cost_range || null,
        photoUrl: project?.photo_url || null,
      },
      homeowner: {
        id: homeowner?.id || null,
        fullName: homeowner?.full_name || null,
        email: homeownerEmail || null,
        phone: lead?.homeowner_phone || homeowner?.phone || null,
        zipCode: homeowner?.zip_code || null,
      },
    });
  } catch (error) {
    return jsonResponse(500, { error: error instanceof Error ? error.message : 'Unexpected error.' });
  }
};
