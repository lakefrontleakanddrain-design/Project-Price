const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const supabaseRequest = async (path, { method = 'GET', body, headers = {} } = {}) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

const hasMissingColumnError = (err, columnName) => {
  const text = String(err?.message || err || '');
  return (text.includes('42703') || text.includes('PGRST204')) && text.includes(columnName);
};

const normalizePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
};

const findAuthUserByEmail = async (email) => {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return null;

  const list = await supabaseRequest('/auth/v1/admin/users?page=1&per_page=1000');
  const users = Array.isArray(list?.users) ? list.users : [];
  return users.find((u) => String(u?.email || '').trim().toLowerCase() === target) || null;
};

const loadProjectsMap = async (projectIds) => {
  const ids = Array.from(new Set((projectIds || []).filter(Boolean)));
  if (ids.length === 0) return {};

  const q = new URLSearchParams({
    id: `in.(${ids.join(',')})`,
    select: 'id,name,project_type,zip_code,description,estimated_cost_range,created_at,photo_url,rendered_photo_url',
  });
  const rows = await supabaseRequest(`/rest/v1/projects?${q.toString()}`);
  const list = Array.isArray(rows) ? rows : [];
  return Object.fromEntries(list.map((p) => [p.id, p]));
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method not allowed.' });

    const email = String(event.queryStringParameters?.email || '').trim().toLowerCase();
    const phone = normalizePhone(event.queryStringParameters?.phone || '');

    if (!email || !phone) {
      return jsonResponse(400, { error: 'email and phone are required.' });
    }

    let leads = [];

    try {
      const leadQ = new URLSearchParams({
        homeowner_email: `eq.${email}`,
        homeowner_phone: `eq.${phone}`,
        select: 'id,status,specialty,zip_code,project_id,created_at,homeowner_id',
        order: 'created_at.desc',
        limit: '100',
      });
      const leadRows = await supabaseRequest(`/rest/v1/lead_requests?${leadQ.toString()}`);
      leads = Array.isArray(leadRows) ? leadRows : [];
    } catch (err) {
      if (!hasMissingColumnError(err, 'homeowner_email') && !hasMissingColumnError(err, 'homeowner_phone')) throw err;

      const authUser = await findAuthUserByEmail(email);
      if (!authUser?.id) return jsonResponse(200, { estimates: [] });

      const usersQ = new URLSearchParams({
        id: `eq.${authUser.id}`,
        phone: `eq.${phone}`,
        select: 'id',
        limit: '1',
      });
      const userRows = await supabaseRequest(`/rest/v1/users?${usersQ.toString()}`);
      const matchedUser = Array.isArray(userRows) ? userRows[0] : null;
      if (!matchedUser?.id) return jsonResponse(200, { estimates: [] });

      const leadQ = new URLSearchParams({
        homeowner_id: `eq.${matchedUser.id}`,
        select: 'id,status,specialty,zip_code,project_id,created_at,homeowner_id',
        order: 'created_at.desc',
        limit: '100',
      });
      const leadRows = await supabaseRequest(`/rest/v1/lead_requests?${leadQ.toString()}`);
      leads = Array.isArray(leadRows) ? leadRows : [];
    }

    const projectsById = await loadProjectsMap(leads.map((l) => l.project_id));

    // Load homeowner personal info
    let homeownerInfo = { fullName: '', email, phone, streetAddress: '', zipCode: '' };
    if (leads.length > 0 && leads[0].homeowner_id) {
      const usersQ = new URLSearchParams({
        id: `eq.${leads[0].homeowner_id}`,
        select: 'full_name,zip_code,street_address',
        limit: '1',
      });
      try {
        const userRows = await supabaseRequest(`/rest/v1/users?${usersQ.toString()}`);
        const user = Array.isArray(userRows) ? userRows[0] : null;
        if (user) {
          homeownerInfo = {
            fullName: user.full_name || '',
            email,
            phone,
            streetAddress: user.street_address || '',
            zipCode: user.zip_code || '',
          };
        }
      } catch (err) {
        // If street_address column doesn't exist yet, fall back without it
        if (hasMissingColumnError(err, 'street_address')) {
          const usersQ2 = new URLSearchParams({
            id: `eq.${leads[0].homeowner_id}`,
            select: 'full_name,zip_code',
            limit: '1',
          });
          const userRows = await supabaseRequest(`/rest/v1/users?${usersQ2.toString()}`);
          const user = Array.isArray(userRows) ? userRows[0] : null;
          if (user) {
            homeownerInfo = {
              fullName: user.full_name || '',
              email,
              phone,
              streetAddress: '',
              zipCode: user.zip_code || '',
            };
          }
        } else {
          throw err;
        }
      }
    }

    const estimates = leads.map((lead) => {
      const project = projectsById[lead.project_id] || null;
      return {
        leadRequestId: lead.id,
        ref: String(lead.id || '').slice(0, 8),
        status: lead.status,
        specialty: lead.specialty,
        zipCode: lead.zip_code,
        createdAt: lead.created_at,
        project: project ? {
          id: project.id,
          name: project.name,
          projectType: project.project_type,
          zipCode: project.zip_code,
          description: project.description,
          estimatedCostRange: project.estimated_cost_range,
          createdAt: project.created_at,
          photoUrl: project.photo_url || null,
          renderedPhotoUrl: project.rendered_photo_url || null,
        } : null,
      };
    });

    return jsonResponse(200, { homeownerInfo, estimates });
  } catch (error) {
    return jsonResponse(500, { error: error instanceof Error ? error.message : 'Unexpected error.' });
  }
};
