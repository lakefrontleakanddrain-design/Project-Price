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

const kmToMiles = (km) => {
  const value = Number(km);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value / 1.60934);
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
  if (!email || !password) return jsonResponse(400, { error: 'Email and password are required.' });

  try {
    const authData = await signInContractor(email, password);
    const userId = authData?.user?.id;
    if (!userId) return jsonResponse(401, { error: 'Invalid email or password.' });

    let pros;
    try {
      const pq = new URLSearchParams({
        user_id: `eq.${userId}`,
        select: 'id,user_id,company_name,contact_phone,specialties,service_zip_codes,service_radius_km,is_verified,is_paused_by_contractor,is_denied,denied_reason',
        limit: '1',
      });
      pros = await supabaseRequest(`/rest/v1/professionals?${pq.toString()}`);
    } catch (err) {
      if (!hasMissingColumnError(err, 'is_paused_by_contractor') && !hasMissingColumnError(err, 'is_denied')) throw err;
      const fallbackQ = new URLSearchParams({
        user_id: `eq.${userId}`,
        select: 'id,user_id,company_name,contact_phone,specialties,service_zip_codes,service_radius_km,is_verified',
        limit: '1',
      });
      pros = await supabaseRequest(`/rest/v1/professionals?${fallbackQ.toString()}`);
    }
    const professional = pros?.[0];

    if (!professional) return jsonResponse(403, { error: 'This account is not a contractor account.' });
    if (!professional.is_verified) {
      return jsonResponse(403, { error: 'Your contractor account is pending approval. Please try again after verification.' });
    }

    let leadRows;
    try {
      const lq = new URLSearchParams({
        claimed_professional_id: `eq.${professional.id}`,
        select: 'id,status,specialty,zip_code,project_id,homeowner_id,homeowner_email,homeowner_phone,created_at',
        order: 'created_at.desc',
        limit: '100',
      });
      leadRows = (await supabaseRequest(`/rest/v1/lead_requests?${lq.toString()}`)) || [];
    } catch (err) {
      if (!hasMissingColumnError(err, 'homeowner_email') && !hasMissingColumnError(err, 'homeowner_phone')) throw err;
      const lq = new URLSearchParams({
        claimed_professional_id: `eq.${professional.id}`,
        select: 'id,status,specialty,zip_code,project_id,homeowner_id,created_at',
        order: 'created_at.desc',
        limit: '100',
      });
      leadRows = (await supabaseRequest(`/rest/v1/lead_requests?${lq.toString()}`)) || [];
    }

    const leadIds = Array.from(new Set(leadRows.map((l) => l.id).filter(Boolean)));

    let claimedAtByLeadId = {};
    if (leadIds.length > 0) {
      const inList = leadIds.join(',');
      const oq = new URLSearchParams({
        lead_request_id: `in.(${inList})`,
        professional_id: `eq.${professional.id}`,
        response: 'eq.yes',
        select: 'lead_request_id,responded_at',
        order: 'responded_at.desc',
      });
      const offerRows = (await supabaseRequest(`/rest/v1/lead_offers?${oq.toString()}`)) || [];
      for (const offer of offerRows) {
        if (offer.lead_request_id && !claimedAtByLeadId[offer.lead_request_id]) {
          claimedAtByLeadId[offer.lead_request_id] = offer.responded_at || null;
        }
      }
    }

    let workflowByLeadId = {};
    try {
      if (leadIds.length > 0) {
        const inList = leadIds.join(',');
        let workflowRows;
        try {
          const wq = new URLSearchParams({
            lead_request_id: `in.(${inList})`,
            professional_id: `eq.${professional.id}`,
            select: 'lead_request_id,stage,notes,updated_at',
          });
          workflowRows = (await supabaseRequest(`/rest/v1/lead_progress?${wq.toString()}`)) || [];
        } catch (err) {
          if (!hasMissingColumnError(err, 'stage')) throw err;
          const wq = new URLSearchParams({
            lead_request_id: `in.(${inList})`,
            professional_id: `eq.${professional.id}`,
            select: 'lead_request_id,status,notes,updated_at',
          });
          workflowRows = (await supabaseRequest(`/rest/v1/lead_progress?${wq.toString()}`)) || [];
        }
        const normalizedWorkflowRows = workflowRows.map((w) => ({
          ...w,
          status: w.stage || w.status || null,
        }));
        workflowByLeadId = Object.fromEntries(normalizedWorkflowRows.map((w) => [w.lead_request_id, w]));
      }
    } catch (err) {
      if (!hasMissingRelationError(err, 'lead_progress')) throw err;
    }

    const projectIds = Array.from(new Set(leadRows.map((l) => l.project_id).filter(Boolean)));
    const homeownerIds = Array.from(new Set(leadRows.map((l) => l.homeowner_id).filter(Boolean)));

    let complianceDocs = [];
    try {
      const cq = new URLSearchParams({
        professional_id: `eq.${professional.id}`,
        select: 'id,service_name,insurance_doc_path,insurance_expires_on,license_doc_path,license_expires_on,last_notified_on,updated_at',
        order: 'service_name.asc',
      });
      complianceDocs = (await supabaseRequest(`/rest/v1/contractor_compliance_docs?${cq.toString()}`)) || [];
    } catch (err) {
      if (!hasMissingRelationError(err, 'contractor_compliance_docs')) throw err;
    }

    let projectsById = {};
    if (projectIds.length > 0) {
      const inList = projectIds.join(',');
      const q = new URLSearchParams({
        id: `in.(${inList})`,
        select: 'id,name,project_type,zip_code,description,estimated_cost_range',
      });
      const projects = (await supabaseRequest(`/rest/v1/projects?${q.toString()}`)) || [];
      projectsById = Object.fromEntries(projects.map((p) => [p.id, p]));
    }

    let homeownersById = {};
    if (homeownerIds.length > 0) {
      const inList = homeownerIds.join(',');
      const q = new URLSearchParams({
        id: `in.(${inList})`,
        select: 'id,full_name,phone,zip_code',
      });
      const homeowners = (await supabaseRequest(`/rest/v1/users?${q.toString()}`)) || [];
      homeownersById = Object.fromEntries(homeowners.map((h) => [h.id, h]));
    }

    let homeownerEmailById = {};
    if (homeownerIds.length > 0) {
      const emails = await Promise.all(homeownerIds.map(async (id) => [id, await getAuthUserEmail(id)]));
      homeownerEmailById = Object.fromEntries(emails);
    }

    const leads = leadRows.map((lead) => ({
      id: lead.id,
      status: lead.status,
      workflowStatus: workflowByLeadId[lead.id]?.status || 'claimed',
      workflowNotes: workflowByLeadId[lead.id]?.notes || null,
      workflowUpdatedAt: workflowByLeadId[lead.id]?.updated_at || null,
      specialty: lead.specialty,
      zipCode: lead.zip_code,
      createdAt: lead.created_at,
      claimedAt: claimedAtByLeadId[lead.id] || null,
      project: projectsById[lead.project_id]
        ? {
            id: projectsById[lead.project_id].id,
            name: projectsById[lead.project_id].name,
            type: projectsById[lead.project_id].project_type,
            zipCode: projectsById[lead.project_id].zip_code,
            description: projectsById[lead.project_id].description,
            estimatedCostRange: projectsById[lead.project_id].estimated_cost_range,
          }
        : null,
      homeowner: homeownersById[lead.homeowner_id]
        ? {
            id: homeownersById[lead.homeowner_id].id,
            fullName: homeownersById[lead.homeowner_id].full_name,
            email: lead.homeowner_email || homeownerEmailById[lead.homeowner_id] || null,
            phone: lead.homeowner_phone || homeownersById[lead.homeowner_id].phone,
            zipCode: homeownersById[lead.homeowner_id].zip_code,
          }
        : null,
    })).sort((a, b) => {
      const aTime = new Date(a.claimedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.claimedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });

    return jsonResponse(200, {
      contractor: {
        id: professional.id,
        companyName: professional.company_name,
        contactPhone: professional.contact_phone,
        email: authData?.user?.email || email,
        specialties: professional.specialties || [],
        serviceZipCodes: professional.service_zip_codes || [],
        serviceZipCode: professional.service_zip_codes?.[0] || null,
        serviceRadiusKm: professional.service_radius_km || 40,
        serviceRadiusMiles: kmToMiles(professional.service_radius_km || 40),
        isPausedByContractor: !!professional.is_paused_by_contractor,
        isDenied: !!professional.is_denied,
        deniedReason: professional.denied_reason || null,
        complianceDocs,
      },
      leads,
    });
  } catch (err) {
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Unexpected error.' });
  }
};
