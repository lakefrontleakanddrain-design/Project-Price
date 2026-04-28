const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const { appendActivityLog, loadRecentActivityLogs } = require('./_activity-log');

const env = () => ({
  supabaseUrl: process.env.SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  adminKey: process.env.ADMIN_DASHBOARD_KEY || '',
  siteUrl: process.env.SITE_URL || process.env.URL || '',
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

const requireAdminKey = (event) => {
  const required = env().adminKey;
  if (!required) return null;

  const headerKey = event.headers?.['x-admin-key'] || event.headers?.['X-Admin-Key'] || '';
  if (headerKey !== required) return jsonResponse(401, { error: 'Unauthorized: invalid admin key.' });
  return null;
};

const getAdminActor = (event, payload = {}) => {
  const actorHeader = event.headers?.['x-admin-actor'] || event.headers?.['X-Admin-Actor'] || '';
  const actor = String(payload.adminActor || actorHeader || 'admin').trim();
  return actor ? actor.slice(0, 80) : 'admin';
};

const buildActivityEntry = (event, payload, action, result) => {
  const actor = getAdminActor(event, payload);
  const message = String(result?.message || '').slice(0, 500) || `Admin action: ${action}`;

  const base = {
    actor,
    action,
    message,
    metadata: {
      action,
      statusCode: 200,
    },
  };

  if (action === 'assign_lead' || action === 'remove_lead') {
    base.targetType = 'lead';
    base.targetId = payload.leadRequestId || null;
  } else if (action === 'approve_contractor' || action === 'pause_contractor' || action === 'deny_contractor' || action === 'update_contractor_profile' || action === 'reset_contractor_password' || action === 'generate_contractor_recovery' || action === 'delete_professional' || action === 'create_contractor') {
    base.targetType = 'professional';
    base.targetId = payload.professionalId || result?.professionalId || null;
  } else if (action === 'set_lead_homeowner_email' || action === 'set_lead_homeowner_phone') {
    base.targetType = 'lead';
    base.targetId = payload.leadRequestId || null;
  } else if (action === 'update_homeowner_profile' || action === 'reset_homeowner_password' || action === 'generate_homeowner_recovery' || action === 'delete_homeowner') {
    base.targetType = 'homeowner';
    base.targetId = payload.homeownerId || null;
  }

  return base;
};

const hasMissingColumnError = (err, columnName) => {
  const text = String(err?.message || err || '');
  return (text.includes('42703') || text.includes('PGRST204')) && text.includes(columnName);
};

const hasMissingRelationError = (err, relationName) => {
  const text = String(err?.message || err || '');
  return (
    (text.includes('42P01') && text.includes(relationName))
    || (text.includes('PGRST205') && text.includes(relationName))
  );
};

const getAuthUserContact = async (userId) => {
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
    const payload = JSON.parse(text);
    const user = payload?.user || payload;
    const meta = user?.user_metadata || {};
    return {
      email: user?.email || null,
      phone: user?.phone || null,
      fullName: meta?.full_name || meta?.name || null,
    };
  } catch {
    return null;
  }
};

const updateAuthUser = async (userId, payload) => {
  if (!userId) throw new Error('userId is required.');
  if (!payload || typeof payload !== 'object') throw new Error('payload is required.');

  return supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: payload,
  });
};

const normalizePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
};

const normalizeServiceZip = (raw) => {
  const first = String(raw || '')
    .split(/[\s,]+/)
    .map((z) => z.trim())
    .find((z) => /^\d{5}$/.test(z));
  return first || '';
};

const normalizeSpecialties = (raw) => {
  const list = Array.isArray(raw) ? raw : String(raw || '').split(/[,\n]/);
  return Array.from(new Set(list.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)));
};

const milesToKm = (miles) => Number(miles) * 1.60934;

const kmToMiles = (km) => {
  const value = Number(km);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value / 1.60934);
};

const DEFAULT_PUBLIC_BASE_URL = 'https://project-price-app.netlify.app';

const resolvePublicBaseUrl = () => {
  const raw = String(env().siteUrl || '').trim().replace(/\/$/, '');
  if (!raw) return DEFAULT_PUBLIC_BASE_URL;
  try {
    const parsed = new URL(raw);
    const host = String(parsed.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
      return DEFAULT_PUBLIC_BASE_URL;
    }
    return parsed.origin;
  } catch {
    return DEFAULT_PUBLIC_BASE_URL;
  }
};

const isDisallowedRedirectHost = (hostname) => {
  const host = String(hostname || '').toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')) return true;
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
};

const sanitizeRedirectUrl = (candidateUrl) => {
  const fallback = buildDefaultRecoveryRedirect();
  const raw = String(candidateUrl || '').trim();
  if (!raw) return fallback;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('redirectTo must be a valid absolute URL.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('redirectTo must use https.');
  }
  if (isDisallowedRedirectHost(parsed.hostname)) {
    throw new Error('redirectTo cannot use localhost, private network, or testing hosts.');
  }

  return parsed.toString();
};

const forceActionLinkRedirect = (actionLink, redirectTo) => {
  const safeRedirect = sanitizeRedirectUrl(redirectTo);
  const raw = String(actionLink || '').trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    parsed.searchParams.set('redirect_to', safeRedirect);
    return parsed.toString();
  } catch {
    return raw;
  }
};

const geocodeUsZipCode = async (zipCode) => {
  const zip = String(zipCode || '').trim();
  if (!zip) return null;

  try {
    const fallbackRes = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`);
    if (!fallbackRes.ok) return null;
    const payload = await fallbackRes.json();
    const place = payload?.places?.[0];
    const lat = Number(place?.latitude);
    const lng = Number(place?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { latitude: lat, longitude: lng };
  } catch {
    return null;
  }
};

const sendTwilioMessage = async (to, message) => {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_FROM_NUMBER;
  if (!twilioSid || !twilioToken || !twilioFrom) {
    return { sid: null, skipped: true, reason: 'Missing Twilio env vars.' };
  }

  const normalizedTo = normalizePhone(to);
  if (!normalizedTo) {
    return { sid: null, skipped: true, reason: 'Contractor phone is missing or invalid.' };
  }

  const form = new URLSearchParams({
    To: normalizedTo,
    From: twilioFrom,
    Body: message,
  });
  const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Twilio error ${res.status}: ${JSON.stringify(data)}`);
  }

  return { sid: data.sid, skipped: false, to: normalizedTo };
};

const loadContractors = async () => {
  try {
    return (await supabaseRequest('/rest/v1/professionals?select=id,user_id,company_name,contact_phone,specialties,service_zip_codes,service_radius_km,service_center_lat,service_center_lng,is_verified,is_denied,denied_reason,created_at&order=created_at.desc&limit=500')) || [];
  } catch (err) {
    if (!hasMissingColumnError(err, 'is_denied') && !hasMissingColumnError(err, 'denied_reason')) throw err;
    const base = (await supabaseRequest('/rest/v1/professionals?select=id,user_id,company_name,contact_phone,specialties,service_zip_codes,service_radius_km,service_center_lat,service_center_lng,is_verified,created_at&order=created_at.desc&limit=500')) || [];
    return base.map((c) => ({ ...c, is_denied: false, denied_reason: null }));
  }
};

const getContractorById = async (professionalId) => {
  if (!professionalId) throw new Error('professionalId is required.');

  const q = new URLSearchParams({
    id: `eq.${professionalId}`,
    select: 'id,user_id,company_name,contact_phone,specialties,service_zip_codes,service_radius_km,service_center_lat,service_center_lng,is_verified',
    limit: '1',
  });
  const rows = await supabaseRequest(`/rest/v1/professionals?${q.toString()}`);
  return rows?.[0] || null;
};

const loadHomeownerDirectoryRows = async () => {
  try {
    return (await supabaseRequest('/rest/v1/users?select=id,role,full_name,phone,zip_code,created_at&role=eq.homeowner&order=created_at.desc&limit=1000')) || [];
  } catch (err) {
    if (!hasMissingColumnError(err, 'role')) throw err;
    return (await supabaseRequest('/rest/v1/users?select=id,full_name,phone,zip_code,created_at&order=created_at.desc&limit=1000')) || [];
  }
};

const loadDirectoryProjects = async () => {
  try {
    const rows = (await supabaseRequest('/rest/v1/projects?select=id,name,project_type,zip_code,created_at,owner_id&order=created_at.desc&limit=1000')) || [];
    return rows.map((row) => ({ ...row, homeowner_id: row.owner_id || null }));
  } catch (err) {
    if (!hasMissingColumnError(err, 'owner_id')) throw err;
    const rows = (await supabaseRequest('/rest/v1/projects?select=id,name,project_type,zip_code,created_at,user_id&order=created_at.desc&limit=1000')) || [];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      project_type: row.project_type,
      zip_code: row.zip_code,
      created_at: row.created_at,
      homeowner_id: row.user_id || null,
    }));
  }
};

const contractorState = (contractor) => {
  if (contractor?.is_denied) return 'denied';
  if (contractor?.is_verified) return 'active';
  return 'paused';
};

const buildDefaultRecoveryRedirect = () => {
  return `${resolvePublicBaseUrl()}/update-password.html`;
};

const generateRecoveryLink = async (email, redirectTo) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) throw new Error('email is required.');
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('email must be a valid email address.');

  const payload = { type: 'recovery', email: normalizedEmail };
  const target = sanitizeRedirectUrl(redirectTo);
  if (target) payload.redirect_to = target;

  const response = await supabaseRequest('/auth/v1/admin/generate_link', {
    method: 'POST',
    body: payload,
  });

  const details = response?.properties || response || {};
  const rawActionLink = details.action_link || response?.action_link || null;
  const finalActionLink = forceActionLinkRedirect(rawActionLink, target);
  return {
    message: 'Recovery link generated.',
    email: normalizedEmail,
    actionLink: finalActionLink,
    emailOtp: details.email_otp || response?.email_otp || null,
    hashedToken: details.hashed_token || response?.hashed_token || null,
    redirectTo: target || null,
  };
};

const fetchOverview = async () => {
  const contractors = await loadContractors();
  const homeownerRows = await loadHomeownerDirectoryRows();
  const directoryProjects = await loadDirectoryProjects();
  const contractorUserIds = Array.from(new Set(contractors.map((c) => c.user_id).filter(Boolean)));
  let contractorAuthByUserId = {};
  if (contractorUserIds.length > 0) {
    const authEntries = await Promise.all(contractorUserIds.map(async (id) => [id, await getAuthUserContact(id)]));
    contractorAuthByUserId = Object.fromEntries(authEntries);
  }
  const enrichedContractors = contractors.map((contractor) => {
    const auth = contractorAuthByUserId[contractor.user_id] || {};
    return {
      ...contractor,
      email: auth.email || null,
      account_name: auth.fullName || null,
      account_phone: auth.phone || null,
    };
  });
  const contractorById = Object.fromEntries(enrichedContractors.map((c) => [c.id, c]));

  let leads;
  try {
    leads = (await supabaseRequest('/rest/v1/lead_requests?select=id,status,specialty,zip_code,homeowner_id,homeowner_email,homeowner_phone,project_id,claimed_professional_id,created_at&order=created_at.desc&limit=500')) || [];
  } catch (err) {
    if (!hasMissingColumnError(err, 'homeowner_email') && !hasMissingColumnError(err, 'homeowner_phone')) throw err;
    leads = (await supabaseRequest('/rest/v1/lead_requests?select=id,status,specialty,zip_code,homeowner_id,project_id,claimed_professional_id,created_at&order=created_at.desc&limit=500')) || [];
  }

  const leadIds = Array.from(new Set(leads.map((l) => l.id).filter(Boolean)));
  const projectIds = Array.from(new Set(leads.map((l) => l.project_id).filter(Boolean)));
  const homeownerIds = Array.from(new Set([
    ...homeownerRows.map((h) => h.id),
    ...directoryProjects.map((p) => p.homeowner_id),
    ...leads.map((l) => l.homeowner_id),
  ].filter(Boolean)));

  let offers = [];
  if (leadIds.length > 0) {
    const inList = leadIds.join(',');
    offers = (await supabaseRequest(`/rest/v1/lead_offers?lead_request_id=in.(${inList})&select=id,lead_request_id,professional_id,position,response,offered_at,expires_at,responded_at,twilio_message_sid&order=position.asc`)) || [];
  }

  let projects = [];
  if (projectIds.length > 0) {
    const inList = projectIds.join(',');
    projects = (await supabaseRequest(`/rest/v1/projects?id=in.(${inList})&select=id,name,project_type,zip_code,description,estimated_cost_range`)) || [];
  }

  const homeowners = homeownerRows;

  const offersByLeadId = offers.reduce((acc, o) => {
    if (!acc[o.lead_request_id]) acc[o.lead_request_id] = [];
    acc[o.lead_request_id].push(o);
    return acc;
  }, {});
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const homeownerPublicById = Object.fromEntries(homeowners.map((h) => [h.id, h]));
  let homeownerAuthById = {};
  if (homeownerIds.length > 0) {
    const authEntries = await Promise.all(homeownerIds.map(async (id) => [id, await getAuthUserContact(id)]));
    homeownerAuthById = Object.fromEntries(authEntries);
  }
  const homeownerById = Object.fromEntries(homeownerIds.map((id) => {
    const pub = homeownerPublicById[id] || {};
    const auth = homeownerAuthById[id] || {};
    return [id, {
      id,
      role: pub.role || 'homeowner',
      full_name: pub.full_name || auth.fullName || null,
      email: auth.email || null,
      phone: pub.phone || auth.phone || null,
      zip_code: pub.zip_code || null,
      created_at: pub.created_at || null,
    }];
  }));

  const projectsByHomeownerId = directoryProjects.reduce((acc, project) => {
    if (!project.homeowner_id) return acc;
    if (!acc[project.homeowner_id]) acc[project.homeowner_id] = [];
    acc[project.homeowner_id].push(project);
    return acc;
  }, {});

  const leadCountsByHomeownerId = leads.reduce((acc, lead) => {
    if (!lead.homeowner_id) return acc;
    acc[lead.homeowner_id] = (acc[lead.homeowner_id] || 0) + 1;
    return acc;
  }, {});

  const latestLeadAtByHomeownerId = leads.reduce((acc, lead) => {
    if (!lead.homeowner_id || !lead.created_at) return acc;
    const current = acc[lead.homeowner_id];
    if (!current || new Date(lead.created_at) > new Date(current)) acc[lead.homeowner_id] = lead.created_at;
    return acc;
  }, {});

  let progressByKey = {};
  try {
    if (leadIds.length > 0) {
      const inList = leadIds.join(',');
      let progressRows;
      try {
        progressRows = (await supabaseRequest(`/rest/v1/lead_progress?lead_request_id=in.(${inList})&select=lead_request_id,professional_id,stage,notes,updated_at`)) || [];
      } catch (err) {
        if (!hasMissingColumnError(err, 'stage')) throw err;
        progressRows = (await supabaseRequest(`/rest/v1/lead_progress?lead_request_id=in.(${inList})&select=lead_request_id,professional_id,status,notes,updated_at`)) || [];
      }
      const normalizedProgressRows = progressRows.map((p) => ({
        ...p,
        status: p.stage || p.status || null,
      }));
      progressByKey = Object.fromEntries(normalizedProgressRows.map((p) => [`${p.lead_request_id}:${p.professional_id}`, p]));
    }
  } catch (err) {
    if (!hasMissingRelationError(err, 'lead_progress')) throw err;
  }

  const enrichedLeads = leads.map((lead) => {
    const leadOffers = (offersByLeadId[lead.id] || []).map((offer) => ({
      ...offer,
      professional: contractorById[offer.professional_id] || null,
    }));

    const manualOffer = leadOffers.find((o) => o.response === 'yes' && String(o.twilio_message_sid || '').startsWith('ADMIN_ASSIGN|')) || null;
    let manualAssignment = null;
    if (manualOffer) {
      const parts = String(manualOffer.twilio_message_sid).split('|');
      manualAssignment = {
        by: parts[1] || 'admin',
        at: parts[2] || manualOffer.responded_at || manualOffer.offered_at || null,
      };
    }

    return {
      id: lead.id,
      status: lead.status,
      specialty: lead.specialty,
      zipCode: lead.zip_code,
      createdAt: lead.created_at,
      project: projectById[lead.project_id] || null,
      homeowner: lead.homeowner_id
        ? {
            ...(homeownerById[lead.homeowner_id] || {}),
            email: lead.homeowner_email || homeownerById[lead.homeowner_id]?.email || null,
            phone: lead.homeowner_phone || homeownerById[lead.homeowner_id]?.phone || null,
          }
        : null,
      claimedProfessional: lead.claimed_professional_id ? contractorById[lead.claimed_professional_id] || null : null,
      workflow: lead.claimed_professional_id ? (progressByKey[`${lead.id}:${lead.claimed_professional_id}`] || null) : null,
      manualAssignment,
      offers: leadOffers,
    };
  });

  const enrichedHomeowners = homeownerIds
    .map((homeownerId) => {
      const homeowner = homeownerById[homeownerId] || null;
      if (!homeowner) return null;
      const projectsForHomeowner = projectsByHomeownerId[homeownerId] || [];
      const latestProject = projectsForHomeowner[0] || null;
      return {
        ...homeowner,
        projectCount: projectsForHomeowner.length,
        leadCount: leadCountsByHomeownerId[homeownerId] || 0,
        latestProjectName: latestProject?.name || null,
        latestProjectType: latestProject?.project_type || null,
        latestProjectZip: latestProject?.zip_code || homeowner.zip_code || null,
        latestProjectAt: latestProject?.created_at || null,
        latestLeadAt: latestLeadAtByHomeownerId[homeownerId] || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aDate = a.latestProjectAt || a.latestLeadAt || a.created_at || '';
      const bDate = b.latestProjectAt || b.latestLeadAt || b.created_at || '';
      return String(bDate).localeCompare(String(aDate));
    });

  const activityLogs = await loadRecentActivityLogs(supabaseRequest, 60);

  return {
    contractors: enrichedContractors,
    homeowners: enrichedHomeowners,
    leads: enrichedLeads,
    activityLogs,
    counts: {
      totalContractors: enrichedContractors.length,
      activeContractors: enrichedContractors.filter((c) => contractorState(c) === 'active').length,
      pausedContractors: enrichedContractors.filter((c) => contractorState(c) === 'paused').length,
      deniedContractors: enrichedContractors.filter((c) => contractorState(c) === 'denied').length,
      totalHomeowners: enrichedHomeowners.length,
      homeownersWithProjects: enrichedHomeowners.filter((h) => h.projectCount > 0).length,
      totalLeads: enrichedLeads.length,
      claimedLeads: enrichedLeads.filter((l) => l.status === 'claimed').length,
      pendingLeads: enrichedLeads.filter((l) => l.status === 'pending').length,
      expiredLeads: enrichedLeads.filter((l) => l.status === 'expired').length,
    },
  };
};

const updateHomeownerProfile = async (homeownerId, payload) => {
  if (!homeownerId) throw new Error('homeownerId is required.');

  const updates = {};
  let normalizedPhone = null;
  let normalizedEmail = null;
  if (typeof payload.fullName === 'string' && payload.fullName.trim()) {
    updates.full_name = payload.fullName.trim().slice(0, 120);
  }
  if (typeof payload.phone === 'string' && payload.phone.trim()) {
    normalizedPhone = normalizePhone(payload.phone);
    if (!normalizedPhone) throw new Error('phone must be a valid phone number.');
    updates.phone = normalizedPhone;
  }
  if (typeof payload.zipCode === 'string' && payload.zipCode.trim()) {
    updates.zip_code = payload.zipCode.trim().slice(0, 20);
  }

  if (Object.keys(updates).length > 0) {
    try {
      console.log('Attempting upsert for homeowner with updates:', updates);
      const upsertResult = await supabaseRequest('/rest/v1/users', {
        method: 'POST',
        body: { id: homeownerId, ...updates, role: 'homeowner' },
        headers: { 
          Prefer: 'resolution=merge-duplicates',
          'Content-Type': 'application/json',
        },
      });
      console.log('Profile upserted, result:', upsertResult);
    } catch (err) {
      console.error('Profile upsert error:', {
        message: err.message,
        status: err.status,
        error: err,
      });
      throw err;
    }
  }

  if (typeof payload.email === 'string' && payload.email.trim()) {
    normalizedEmail = payload.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('email must be a valid email address.');
    await updateAuthUser(homeownerId, { email: normalizedEmail, email_confirm: true });
  }

  if (payload.leadRequestId && (normalizedEmail || normalizedPhone)) {
    const leadUpdates = {};
    if (normalizedEmail) leadUpdates.homeowner_email = normalizedEmail;
    if (normalizedPhone) leadUpdates.homeowner_phone = normalizedPhone;

    const leadQ = new URLSearchParams({ id: `eq.${payload.leadRequestId}` });
    try {
      await supabaseRequest(`/rest/v1/lead_requests?${leadQ.toString()}`, {
        method: 'PATCH',
        body: leadUpdates,
        headers: { Prefer: 'return=minimal' },
      });
    } catch (err) {
      if (!(normalizedPhone && hasMissingColumnError(err, 'homeowner_phone'))) throw err;

      if (normalizedEmail) {
        await supabaseRequest(`/rest/v1/lead_requests?${leadQ.toString()}`, {
          method: 'PATCH',
          body: { homeowner_email: normalizedEmail },
          headers: { Prefer: 'return=minimal' },
        });
      }
    }
  }

  return { message: 'Homeowner profile updated.' };
};

const updateContractorProfile = async (professionalId, payload) => {
  if (!professionalId) throw new Error('professionalId is required.');

  const contractor = await getContractorById(professionalId);
  if (!contractor) throw new Error('Contractor not found.');

  const updates = {};
  if (typeof payload.companyName === 'string' && payload.companyName.trim()) {
    updates.company_name = payload.companyName.trim().slice(0, 160);
  }
  if (typeof payload.contactPhone === 'string' && payload.contactPhone.trim()) {
    const normalized = normalizePhone(payload.contactPhone);
    if (!normalized) throw new Error('contactPhone must be a valid phone number.');
    updates.contact_phone = normalized;
  }
  if (payload.specialties !== undefined) {
    const normalizedSpecialties = normalizeSpecialties(payload.specialties);
    if (normalizedSpecialties.length > 0) updates.specialties = normalizedSpecialties;
  }

  const centerZip = normalizeServiceZip(payload.serviceZipCode || payload.serviceZipCodes || '');
  if (centerZip) {
    updates.service_zip_codes = [centerZip];
    const centerPoint = await geocodeUsZipCode(centerZip);
    if (centerPoint) {
      updates.service_center_lat = centerPoint.latitude;
      updates.service_center_lng = centerPoint.longitude;
    }
  }

  if (payload.serviceRadiusMiles !== undefined && payload.serviceRadiusMiles !== null && payload.serviceRadiusMiles !== '') {
    const radiusMiles = Number(payload.serviceRadiusMiles);
    if (!Number.isFinite(radiusMiles) || radiusMiles <= 0) throw new Error('serviceRadiusMiles must be a positive number.');
    updates.service_radius_km = milesToKm(radiusMiles);
  } else if (payload.serviceRadiusKm !== undefined && payload.serviceRadiusKm !== null && payload.serviceRadiusKm !== '') {
    const radius = Number(payload.serviceRadiusKm);
    if (!Number.isFinite(radius) || radius <= 0) throw new Error('serviceRadiusKm must be a positive number.');
    updates.service_radius_km = radius;
  }

  if (Object.keys(updates).length > 0) {
    const q = new URLSearchParams({ id: `eq.${professionalId}` });
    await supabaseRequest(`/rest/v1/professionals?${q.toString()}`, {
      method: 'PATCH',
      body: updates,
      headers: { Prefer: 'return=minimal' },
    });
  }

  if (typeof payload.email === 'string' && payload.email.trim()) {
    const email = payload.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('email must be a valid email address.');
    await updateAuthUser(contractor.user_id, { email, email_confirm: true });
  }

  return { message: 'Contractor profile updated.' };
};

const createContractor = async (payload) => {
  const fullName = String(payload.fullName || '').trim();
  const companyName = String(payload.companyName || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const phone = normalizePhone(payload.phone);
  const specialties = normalizeSpecialties(payload.specialties);
  const centerZip = normalizeServiceZip(payload.serviceZipCode || payload.serviceZipCodes || '');
  const requestedPassword = String(payload.password || '').trim();
  const approved = payload.approved !== false;
  const radiusMiles = Number(payload.serviceRadiusMiles || 30);
  const welcomeTemplate = String(payload.welcomeTemplate || 'founding').trim().toLowerCase();

  if (!fullName || !companyName || !email || !phone) {
    throw new Error('fullName, companyName, email, and phone are required.');
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('email must be a valid email address.');
  if (specialties.length === 0) throw new Error('At least one specialty is required.');
  if (!centerZip) throw new Error('A valid 5-digit service center zip code is required.');
  if (!Number.isFinite(radiusMiles) || radiusMiles <= 0) throw new Error('serviceRadiusMiles must be a positive number.');
  const radius = milesToKm(radiusMiles);

  let password = requestedPassword;
  if (password && password.length < 8) throw new Error('password must be at least 8 characters when provided.');
  if (!password) password = `Temp${Math.random().toString(36).slice(-10)}!`;

  const centerPoint = await geocodeUsZipCode(centerZip);

  const authData = await supabaseRequest('/auth/v1/admin/users', {
    method: 'POST',
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: 'professional' },
    },
  });

  const userId = authData?.id || authData?.user?.id;
  if (!userId) throw new Error('Failed to create auth user.');

  await supabaseRequest('/rest/v1/profiles', {
    method: 'POST',
    body: { id: userId, display_name: fullName },
    headers: { Prefer: 'return=minimal' },
  });

  await supabaseRequest('/rest/v1/users', {
    method: 'POST',
    body: {
      id: userId,
      role: 'professional',
      full_name: fullName,
      phone,
    },
    headers: { Prefer: 'return=minimal' },
  });

  const professionalInsert = {
    user_id: userId,
    company_name: companyName,
    contact_phone: phone,
    specialties,
    service_zip_codes: [centerZip],
    service_radius_km: radius,
    is_verified: approved,
  };

  if (centerPoint) {
    professionalInsert.service_center_lat = centerPoint.latitude;
    professionalInsert.service_center_lng = centerPoint.longitude;
  }

  const proRows = await supabaseRequest('/rest/v1/professionals', {
    method: 'POST',
    body: professionalInsert,
    headers: { Prefer: 'return=representation' },
  });

  const professionalId = proRows?.[0]?.id || null;
  let onboardingLink = null;
  try {
    const recovery = await generateRecoveryLink(email, buildDefaultRecoveryRedirect());
    onboardingLink = recovery?.actionLink || null;
  } catch {
    onboardingLink = null;
  }

  if (!onboardingLink) {
    onboardingLink = `${resolvePublicBaseUrl()}/contractor-portal.html`;
  }

  const welcomeMessage = welcomeTemplate === 'standard'
    ? `Welcome to Project Price! Your contractor account is ready. Complete your profile here to start receiving exclusive leads: ${onboardingLink}`
    : `Welcome to Project Price! You've been added as a Founding Pro for your market launch. Complete your profile here to start receiving exclusive leads: ${onboardingLink}`;
  let smsResult = null;
  let smsWarning = null;
  try {
    smsResult = await sendTwilioMessage(phone, welcomeMessage);
  } catch (err) {
    smsResult = { sid: null, skipped: true, reason: 'Twilio send failed.' };
    smsWarning = err instanceof Error ? err.message : 'Twilio send failed.';
  }

  const smsSuffix = smsWarning
    ? ` Welcome SMS failed: ${smsWarning}`
    : (smsResult?.skipped ? ` Welcome SMS not sent: ${smsResult.reason}` : ' Welcome SMS sent.');

  return {
    message: `Contractor ${companyName} created${approved ? ' and approved' : ' in pending state'}.${smsSuffix}`,
    professionalId,
    userId,
    temporaryPasswordGenerated: !requestedPassword,
    serviceRadiusMiles: kmToMiles(radius),
    welcomeLink: onboardingLink,
    welcomeSms: smsResult,
  };
};

const resetAccountPassword = async (userId, newPassword) => {
  const password = String(newPassword || '');
  if (!userId) throw new Error('userId is required.');
  if (password.length < 8) throw new Error('newPassword must be at least 8 characters.');

  await updateAuthUser(userId, { password });
  return { message: 'Password reset saved.' };
};

const generateHomeownerRecovery = async (homeownerId, redirectTo) => {
  if (!homeownerId) throw new Error('homeownerId is required.');
  const auth = await getAuthUserContact(homeownerId);
  if (!auth?.email) throw new Error('Homeowner account does not have an email address.');
  return generateRecoveryLink(auth.email, redirectTo);
};

const generateContractorRecovery = async (professionalId, redirectTo) => {
  const contractor = await getContractorById(professionalId);
  if (!contractor?.user_id) throw new Error('Contractor account is missing a user id.');
  const auth = await getAuthUserContact(contractor.user_id);
  if (!auth?.email) throw new Error('Contractor account does not have an email address.');
  return generateRecoveryLink(auth.email, redirectTo);
};

const deleteHomeowner = async (homeownerId) => {
  if (!homeownerId) throw new Error('homeownerId is required.');

  const q = new URLSearchParams({ id: `eq.${homeownerId}` });
  await supabaseRequest(`/rest/v1/users?${q.toString()}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });

  try {
    await supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(homeownerId)}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.error('Auth user delete failed:', err);
  }

  return { message: `Homeowner ${homeownerId.slice(0, 8)} deleted.` };
};

const deleteProfessional = async (professionalId) => {
  if (!professionalId) throw new Error('professionalId is required.');

  const contractor = await getContractorById(professionalId);
  if (!contractor) throw new Error('Contractor not found.');

  // Detach any claimed leads so the professional row can be deleted safely.
  const claimedLeadQ = new URLSearchParams({ claimed_professional_id: `eq.${professionalId}` });
  await supabaseRequest(`/rest/v1/lead_requests?${claimedLeadQ.toString()}`, {
    method: 'PATCH',
    body: { claimed_professional_id: null },
    headers: { Prefer: 'return=minimal' },
  });

  const q = new URLSearchParams({ id: `eq.${professionalId}` });
  await supabaseRequest(`/rest/v1/professionals?${q.toString()}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });

  if (contractor.user_id) {
    try {
      await supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(contractor.user_id)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error('Auth user delete failed:', err);
    }
  }

  return { message: `Professional ${professionalId.slice(0, 8)} deleted.` };
};

const approveContractor = async (professionalId, approved) => {
  if (!professionalId) throw new Error('professionalId is required.');

  const q = new URLSearchParams({ id: `eq.${professionalId}` });
  try {
    await supabaseRequest(`/rest/v1/professionals?${q.toString()}`, {
      method: 'PATCH',
      body: { is_verified: !!approved, is_denied: false, denied_reason: null },
      headers: { Prefer: 'return=minimal' },
    });
  } catch (err) {
    if (!hasMissingColumnError(err, 'is_denied') && !hasMissingColumnError(err, 'denied_reason')) throw err;
    await supabaseRequest(`/rest/v1/professionals?${q.toString()}`, {
      method: 'PATCH',
      body: { is_verified: !!approved },
      headers: { Prefer: 'return=minimal' },
    });
  }

  return { message: approved ? 'Contractor approved.' : 'Contractor set to pending.' };
};

const pauseContractor = async (professionalId) => {
  if (!professionalId) throw new Error('professionalId is required.');

  const q = new URLSearchParams({ id: `eq.${professionalId}` });
  try {
    await supabaseRequest(`/rest/v1/professionals?${q.toString()}`, {
      method: 'PATCH',
      body: { is_verified: false, is_denied: false, denied_reason: null },
      headers: { Prefer: 'return=minimal' },
    });
  } catch (err) {
    if (!hasMissingColumnError(err, 'is_denied') && !hasMissingColumnError(err, 'denied_reason')) throw err;
    await supabaseRequest(`/rest/v1/professionals?${q.toString()}`, {
      method: 'PATCH',
      body: { is_verified: false },
      headers: { Prefer: 'return=minimal' },
    });
  }

  return { message: 'Contractor paused. They will not receive new leads until approved again.' };
};

const denyContractor = async (professionalId, reason = null) => {
  if (!professionalId) throw new Error('professionalId is required.');

  const q = new URLSearchParams({ id: `eq.${professionalId}` });
  try {
    await supabaseRequest(`/rest/v1/professionals?${q.toString()}`, {
      method: 'PATCH',
      body: {
        is_verified: false,
        is_denied: true,
        denied_reason: reason ? String(reason).slice(0, 500) : null,
      },
      headers: { Prefer: 'return=minimal' },
    });
  } catch (err) {
    if (hasMissingColumnError(err, 'is_denied') || hasMissingColumnError(err, 'denied_reason')) {
      await supabaseRequest(`/rest/v1/professionals?${q.toString()}`, {
        method: 'PATCH',
        body: { is_verified: false },
        headers: { Prefer: 'return=minimal' },
      });
      return { message: 'Contractor paused. Denied fields are unavailable until migration is applied.' };
    }
    throw err;
  }

  return { message: 'Contractor denied.' };
};

const assignLeadManually = async (leadRequestId, professionalId, adminActor = 'admin') => {
  if (!leadRequestId || !professionalId) throw new Error('leadRequestId and professionalId are required.');

  const pro = await getContractorById(professionalId);
  if (!pro) throw new Error('Contractor not found.');
  if (!pro.is_verified) throw new Error('Contractor must be approved before assignment.');

  const lq = new URLSearchParams({
    id: `eq.${leadRequestId}`,
    select: 'id,status,specialty,zip_code,project_id,homeowner_id,homeowner_email,homeowner_phone',
    limit: '1',
  });

  let leadRows;
  try {
    leadRows = await supabaseRequest(`/rest/v1/lead_requests?${lq.toString()}`);
  } catch (err) {
    if (!hasMissingColumnError(err, 'homeowner_email') && !hasMissingColumnError(err, 'homeowner_phone')) throw err;
    const legacyLeadQ = new URLSearchParams({
      id: `eq.${leadRequestId}`,
      select: 'id,status,specialty,zip_code,project_id,homeowner_id',
      limit: '1',
    });
    leadRows = await supabaseRequest(`/rest/v1/lead_requests?${legacyLeadQ.toString()}`);
  }

  const lead = leadRows?.[0];
  if (!lead) throw new Error('Lead not found.');

  let project = null;
  if (lead.project_id) {
    const projectQ = new URLSearchParams({
      id: `eq.${lead.project_id}`,
      select: 'project_type,description',
      limit: '1',
    });
    const projectRows = await supabaseRequest(`/rest/v1/projects?${projectQ.toString()}`);
    project = projectRows?.[0] || null;
  }

  let homeowner = null;
  if (lead.homeowner_id) {
    const userQ = new URLSearchParams({
      id: `eq.${lead.homeowner_id}`,
      select: 'full_name,phone,email,street_address,zip_code',
      limit: '1',
    });
    try {
      const userRows = await supabaseRequest(`/rest/v1/users?${userQ.toString()}`);
      homeowner = userRows?.[0] || null;
    } catch (err) {
      if (!hasMissingColumnError(err, 'street_address') && !hasMissingColumnError(err, 'email')) throw err;
      const legacyUserQ = new URLSearchParams({
        id: `eq.${lead.homeowner_id}`,
        select: 'full_name,phone,zip_code',
        limit: '1',
      });
      const userRows = await supabaseRequest(`/rest/v1/users?${legacyUserQ.toString()}`);
      homeowner = userRows?.[0] || null;
    }
  }

  let authHomeowner = null;
  if (lead.homeowner_id) {
    authHomeowner = await getAuthUserContact(lead.homeowner_id);
  }

  const oq = new URLSearchParams({
    lead_request_id: `eq.${leadRequestId}`,
    professional_id: `eq.${professionalId}`,
    select: 'id,position',
    limit: '1',
  });
  const existingOfferRows = await supabaseRequest(`/rest/v1/lead_offers?${oq.toString()}`);
  const existingOffer = existingOfferRows?.[0] || null;

  const nowIso = new Date().toISOString();
  const actor = String(adminActor || 'admin').trim().slice(0, 60) || 'admin';
  const specialty = project?.project_type || lead.specialty || 'Construction';
  const zip = String(lead.zip_code || '').trim();
  const homeownerName = String(homeowner?.full_name || '').trim() || 'N/A';
  const homeownerPhone = String(homeowner?.phone || lead.homeowner_phone || '').trim() || 'N/A';
  const homeownerEmail = String(lead.homeowner_email || homeowner?.email || authHomeowner?.email || '').trim() || 'N/A';
  const homeownerStreet = String(homeowner?.street_address || '').trim();
  const homeownerZip = String(homeowner?.zip_code || zip || '').trim();
  const addressLine = homeownerStreet
    ? `${homeownerStreet}${homeownerZip ? `, ${homeownerZip}` : ''}`
    : (homeownerZip || 'N/A');
  const projectSummary = project?.description
    ? String(project.description).replace(/\s+/g, ' ').trim().slice(0, 260)
    : 'No project notes provided.';
  const smsBody =
    `ProjectPrice admin assigned lead ${leadRequestId.slice(0, 8)}\n`
    + `Service: ${specialty} (${zip || 'N/A'})\n`
    + `Client: ${homeownerName}\n`
    + `Phone: ${homeownerPhone}\n`
    + `Email: ${homeownerEmail}\n`
    + `Address: ${addressLine}\n`
    + `Job: ${projectSummary}`;

  let twilioResult;
  let twilioWarning = null;
  try {
    twilioResult = await sendTwilioMessage(pro.contact_phone, smsBody);
  } catch (error) {
    twilioResult = { sid: null, skipped: true, reason: 'Twilio send failed.' };
    twilioWarning = error instanceof Error ? error.message : 'Twilio send failed.';
  }

  const twilioMarker = twilioResult?.sid
    || `ADMIN_ASSIGN|${actor}|${nowIso}${twilioResult?.reason ? `|${String(twilioResult.reason).slice(0, 80)}` : ''}`;

  if (existingOffer) {
    const patchQ = new URLSearchParams({ id: `eq.${existingOffer.id}` });
    await supabaseRequest(`/rest/v1/lead_offers?${patchQ.toString()}`, {
      method: 'PATCH',
      body: {
        offered_at: nowIso,
        responded_at: nowIso,
        response: 'yes',
        twilio_message_sid: twilioMarker,
      },
      headers: { Prefer: 'return=minimal' },
    });
  } else {
    const allLeadOffers = await supabaseRequest(`/rest/v1/lead_offers?lead_request_id=eq.${encodeURIComponent(leadRequestId)}&select=position`);
    const maxPosition = Array.isArray(allLeadOffers) && allLeadOffers.length > 0
      ? Math.max(...allLeadOffers.map((o) => Number(o.position) || 0))
      : 0;

    await supabaseRequest('/rest/v1/lead_offers', {
      method: 'POST',
      body: {
        lead_request_id: leadRequestId,
        professional_id: professionalId,
        position: maxPosition + 1,
        offered_at: nowIso,
        responded_at: nowIso,
        response: 'yes',
        twilio_message_sid: twilioMarker,
      },
      headers: { Prefer: 'return=minimal' },
    });
  }

  const skipQ = new URLSearchParams({
    lead_request_id: `eq.${leadRequestId}`,
    professional_id: `neq.${professionalId}`,
    response: 'is.null',
  });
  await supabaseRequest(`/rest/v1/lead_offers?${skipQ.toString()}`, {
    method: 'PATCH',
    body: { response: 'skipped', responded_at: nowIso },
    headers: { Prefer: 'return=minimal' },
  });

  const leadPatchQ = new URLSearchParams({ id: `eq.${leadRequestId}` });
  await supabaseRequest(`/rest/v1/lead_requests?${leadPatchQ.toString()}`, {
    method: 'PATCH',
    body: {
      status: 'claimed',
      claimed_professional_id: professionalId,
    },
    headers: { Prefer: 'return=minimal' },
  });

  const warningSuffix = twilioWarning
    ? ` Contractor SMS failed: ${twilioWarning}`
    : (twilioResult?.skipped ? ` Contractor SMS not sent: ${twilioResult.reason}` : ' Contractor SMS sent.');

  return {
    message: `Lead ${leadRequestId.slice(0, 8)} manually assigned to ${pro.company_name || professionalId} by ${actor}.${warningSuffix}`,
    twilio: twilioResult,
  };
};

const removeLead = async (leadRequestId) => {
  if (!leadRequestId) throw new Error('leadRequestId is required.');

  const leadQ = new URLSearchParams({
    id: `eq.${leadRequestId}`,
    select: 'id',
    limit: '1',
  });
  const leadRows = await supabaseRequest(`/rest/v1/lead_requests?${leadQ.toString()}`);
  const lead = leadRows?.[0];
  if (!lead) throw new Error('Lead not found.');

  const offerQ = new URLSearchParams({ lead_request_id: `eq.${leadRequestId}` });
  await supabaseRequest(`/rest/v1/lead_offers?${offerQ.toString()}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });

  const deleteQ = new URLSearchParams({ id: `eq.${leadRequestId}` });
  await supabaseRequest(`/rest/v1/lead_requests?${deleteQ.toString()}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });

  return { message: `Lead ${leadRequestId.slice(0, 8)} removed.` };
};

const setLeadHomeownerEmail = async (leadRequestId, homeownerEmail) => {
  if (!leadRequestId) throw new Error('leadRequestId is required.');
  const email = String(homeownerEmail || '').trim().toLowerCase();
  if (!email) throw new Error('homeownerEmail is required.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('homeownerEmail must be a valid email address.');

  const leadPatchQ = new URLSearchParams({ id: `eq.${leadRequestId}` });
  await supabaseRequest(`/rest/v1/lead_requests?${leadPatchQ.toString()}`, {
    method: 'PATCH',
    body: { homeowner_email: email },
    headers: { Prefer: 'return=minimal' },
  });

  return { message: `Lead ${leadRequestId.slice(0, 8)} homeowner email updated.` };
};

const setLeadHomeownerPhone = async (leadRequestId, homeownerPhone) => {
  if (!leadRequestId) throw new Error('leadRequestId is required.');
  const normalized = normalizePhone(homeownerPhone);
  if (!normalized) throw new Error('homeownerPhone is required.');

  const leadPatchQ = new URLSearchParams({ id: `eq.${leadRequestId}` });
  try {
    await supabaseRequest(`/rest/v1/lead_requests?${leadPatchQ.toString()}`, {
      method: 'PATCH',
      body: { homeowner_phone: normalized },
      headers: { Prefer: 'return=minimal' },
    });
    return { message: `Lead ${leadRequestId.slice(0, 8)} homeowner phone updated.` };
  } catch (err) {
    if (!hasMissingColumnError(err, 'homeowner_phone')) throw err;

    const leadQ = new URLSearchParams({ id: `eq.${leadRequestId}`, select: 'homeowner_id', limit: '1' });
    const leadRows = await supabaseRequest(`/rest/v1/lead_requests?${leadQ.toString()}`);
    const homeownerId = leadRows?.[0]?.homeowner_id;
    if (!homeownerId) throw new Error('Lead not found.');

    const userPatchQ = new URLSearchParams({ id: `eq.${homeownerId}` });
    await supabaseRequest(`/rest/v1/users?${userPatchQ.toString()}`, {
      method: 'PATCH',
      body: { phone: normalized },
      headers: { Prefer: 'return=minimal' },
    });

    return { message: `Lead ${leadRequestId.slice(0, 8)} phone updated via homeowner profile (lead phone column not available yet).` };
  }
};

exports.handler = async (event) => {
  try {
    const denied = requireAdminKey(event);
    if (denied) return denied;

    if (event.httpMethod === 'GET') {
      const data = await fetchOverview();
      return jsonResponse(200, data);
    }

    if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON.' });
    }

    const action = String(payload.action || '').trim();
    if (!action) return jsonResponse(400, { error: 'action is required.' });

    if (action === 'approve_contractor') {
      const result = await approveContractor(payload.professionalId, payload.approved !== false);
      await appendActivityLog(supabaseRequest, buildActivityEntry(event, payload, action, result));
      return jsonResponse(200, result);
    }

    if (action === 'pause_contractor') {
      const result = await pauseContractor(payload.professionalId);
      await appendActivityLog(supabaseRequest, buildActivityEntry(event, payload, action, result));
      return jsonResponse(200, result);
    }

    if (action === 'deny_contractor') {
      const result = await denyContractor(payload.professionalId, payload.reason || null);
      await appendActivityLog(supabaseRequest, buildActivityEntry(event, payload, action, result));
      return jsonResponse(200, result);
    }

    if (action === 'assign_lead') {
      const actorHeader = event.headers?.['x-admin-actor'] || event.headers?.['X-Admin-Actor'] || '';
      const actor = String(payload.adminActor || actorHeader || 'admin');
      const result = await assignLeadManually(payload.leadRequestId, payload.professionalId, actor);
      await appendActivityLog(supabaseRequest, buildActivityEntry(event, payload, action, result));
      return jsonResponse(200, result);
    }

    if (action === 'remove_lead') {
      const result = await removeLead(payload.leadRequestId);
      await appendActivityLog(supabaseRequest, buildActivityEntry(event, payload, action, result));
      return jsonResponse(200, result);
    }

    if (action === 'set_lead_homeowner_email') {
      const result = await setLeadHomeownerEmail(payload.leadRequestId, payload.homeownerEmail);
      await appendActivityLog(supabaseRequest, buildActivityEntry(event, payload, action, result));
      return jsonResponse(200, result);
    }

    if (action === 'set_lead_homeowner_phone') {
      const result = await setLeadHomeownerPhone(payload.leadRequestId, payload.homeownerPhone);
      await appendActivityLog(supabaseRequest, buildActivityEntry(event, payload, action, result));
      return jsonResponse(200, result);
    }

    if (action === 'update_homeowner_profile') {
      const result = await updateHomeownerProfile(payload.homeownerId, payload);
      await appendActivityLog(supabaseRequest, buildActivityEntry(event, payload, action, result));
      return jsonResponse(200, result);
    }

    if (action === 'update_contractor_profile') {
      const result = await updateContractorProfile(payload.professionalId, payload);
      await appendActivityLog(supabaseRequest, buildActivityEntry(event, payload, action, result));
      return jsonResponse(200, result);
    }

    if (action === 'reset_homeowner_password') {
      const result = await resetAccountPassword(payload.homeownerId, payload.newPassword);
      await appendActivityLog(supabaseRequest, buildActivityEntry(event, payload, action, result));
      return jsonResponse(200, result);
    }

    if (action === 'reset_contractor_password') {
      const contractor = await getContractorById(payload.professionalId);
      if (!contractor?.user_id) throw new Error('Contractor account is missing a user id.');
      const result = await resetAccountPassword(contractor.user_id, payload.newPassword);
      let onboardingLink = null;
      let smsResult = null;
      let smsWarning = null;
      try {
        const auth = await getAuthUserContact(contractor.user_id);
        const recovery = auth?.email
          ? await generateRecoveryLink(auth.email, buildDefaultRecoveryRedirect())
          : null;
        onboardingLink = recovery?.actionLink || `${resolvePublicBaseUrl()}/contractor-portal.html`;

        const smsBody = `Project Price account update: your temporary password is ${String(payload.newPassword || '')}. Sign in here: ${resolvePublicBaseUrl()}/contractor-portal.html . If needed, set a new password here: ${onboardingLink}`;
        smsResult = await sendTwilioMessage(contractor.contact_phone, smsBody);
      } catch (err) {
        smsResult = { sid: null, skipped: true, reason: 'Temp password SMS failed.' };
        smsWarning = err instanceof Error ? err.message : 'Temp password SMS failed.';
      }
      const smsSuffix = smsWarning
        ? ` Contractor notification SMS failed: ${smsWarning}`
        : (smsResult?.skipped ? ` Contractor notification SMS not sent: ${smsResult.reason}` : ' Contractor notification SMS sent.');
      result.message = `${result.message}${smsSuffix}`;
      result.welcomeLink = onboardingLink;
      result.welcomeSms = smsResult;
      await appendActivityLog(supabaseRequest, buildActivityEntry(event, payload, action, result));
      return jsonResponse(200, result);
    }

    if (action === 'generate_homeowner_recovery') {
      const result = await generateHomeownerRecovery(payload.homeownerId, payload.redirectTo || null);
      await appendActivityLog(supabaseRequest, buildActivityEntry(event, payload, action, result));
      return jsonResponse(200, result);
    }

    if (action === 'generate_contractor_recovery') {
      const result = await generateContractorRecovery(payload.professionalId, payload.redirectTo || null);
      await appendActivityLog(supabaseRequest, buildActivityEntry(event, payload, action, result));
      return jsonResponse(200, result);
    }

    if (action === 'delete_homeowner') {
      const result = await deleteHomeowner(payload.homeownerId);
      await appendActivityLog(supabaseRequest, buildActivityEntry(event, payload, action, result));
      return jsonResponse(200, result);
    }

    if (action === 'delete_professional') {
      const result = await deleteProfessional(payload.professionalId);
      await appendActivityLog(supabaseRequest, buildActivityEntry(event, payload, action, result));
      return jsonResponse(200, result);
    }

    if (action === 'create_contractor') {
      const result = await createContractor(payload);
      await appendActivityLog(supabaseRequest, buildActivityEntry(event, payload, action, result));
      return jsonResponse(200, result);
    }

    return jsonResponse(400, { error: `Unsupported action: ${action}` });
  } catch (error) {
    return jsonResponse(500, { error: error instanceof Error ? error.message : 'Unexpected error.' });
  }
};
