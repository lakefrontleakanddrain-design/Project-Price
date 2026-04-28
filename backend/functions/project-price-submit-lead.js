const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatLeadRef = (leadRequestId) => `PP-${String(leadRequestId || '').slice(0, 8).toUpperCase()}`;

const renderEmailTemplate = ({ title, intro, details = [], ctaLabel, ctaUrl, reference = null }) => {
  const detailsHtml = details.length
    ? `<ul style="margin:0 0 16px 18px;padding:0;color:#2f3b4a;">${details.map((item) => `<li style="margin:0 0 6px 0;">${escapeHtml(item)}</li>`).join('')}</ul>`
    : '';
  const ctaHtml = ctaLabel && ctaUrl
    ? `<p style="margin:20px 0;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#0E3A78;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">${escapeHtml(ctaLabel)}</a></p>`
    : '';
  const referenceHtml = reference
    ? `<p style="margin:12px 0 0 0;color:#68778d;font-size:13px;">Reference: ${escapeHtml(reference)}</p>`
    : '';

  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;background:#f5f8fc;padding:24px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbe4ef;border-radius:12px;padding:24px;">
        <p style="margin:0 0 12px 0;color:#0E3A78;font-weight:700;">Project Price</p>
        <h2 style="margin:0 0 12px 0;color:#112035;font-size:22px;">${escapeHtml(title)}</h2>
        <p style="margin:0 0 14px 0;color:#2f3b4a;line-height:1.5;">${escapeHtml(intro)}</p>
        ${detailsHtml}
        ${ctaHtml}
        ${referenceHtml}
      </div>
    </div>
  `;
};

const supabaseRequest = async (path, { method = 'GET', body, headers = {} } = {}) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

const hasMissingColumnError = (err, columnName) => {
  const text = String(err?.message || err || '');
  return (text.includes('42703') || text.includes('PGRST204')) && text.includes(columnName);
};

const hasInvalidEnumValueError = (err, enumValue) => {
  const text = String(err?.message || err || '');
  return text.includes('22P02') && text.includes(enumValue);
};

const findAuthUserByEmail = async (email) => {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return null;

  // Supabase admin user list filtering by query params is not guaranteed across environments,
  // so we fetch a page and match email exactly in code.
  const list = await supabaseRequest('/auth/v1/admin/users?page=1&per_page=1000');
  const users = Array.isArray(list?.users) ? list.users : [];
  return users.find((u) => String(u?.email || '').trim().toLowerCase() === target) || null;
};

const getAuthUserById = async (userId) => {
  if (!userId) return null;
  const record = await supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`);
  return record?.user || record || null;
};

const normalizePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
};

const loadOwnedProject = async (projectId, ownerId) => {
  const q = new URLSearchParams({
    id: `eq.${projectId}`,
    owner_id: `eq.${ownerId}`,
    select: 'id,name,project_type,zip_code,description',
    limit: '1',
  });
  const rows = await supabaseRequest(`/rest/v1/projects?${q.toString()}`);
  return Array.isArray(rows) ? rows[0] : null;
};

const getAppBaseUrl = () => (process.env.APP_BASE_URL || 'https://project-price-app.netlify.app').replace(/\/$/, '');
const getAdminPhone = () => String(process.env.ADMIN_PHONE_NUMBER || '').trim();
const getAdminNotificationEmail = () => String(process.env.ADMIN_NOTIFICATION_EMAIL || '').trim().toLowerCase();
const getSalesNotificationEmail = () => String(process.env.SALES_NOTIFICATION_EMAIL || '').trim().toLowerCase();
const getGoogleMapsApiKey = () => String(process.env.GOOGLE_MAPS_API_KEY || '').trim();
const getResendApiKey = () => String(process.env.RESEND_API_KEY || '').trim();
const getNotificationsFromEmail = () => String(process.env.NOTIFICATIONS_FROM_EMAIL || 'notifications@projectpriceapp.com').trim();
const getNotificationsReplyToEmail = () => String(process.env.NOTIFICATIONS_REPLY_TO_EMAIL || 'Projectpriceapp@gmail.com').trim();
const getInternalNotificationEmails = () => Array.from(new Set([
  getAdminNotificationEmail(),
  getSalesNotificationEmail(),
].filter((email) => /^\S+@\S+\.\S+$/.test(email))));

const toFloatOrNull = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const haversineDistanceKm = (lat1, lng1, lat2, lng2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const geocodeUsZipCode = async (zipCode) => {
  const key = getGoogleMapsApiKey();
  const zip = String(zipCode || '').trim();
  if (!zip) return null;

  if (key) {
    const params = new URLSearchParams({
      address: zip,
      components: 'country:US',
      key,
    });

    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
      if (res.ok) {
        const payload = await res.json();
        if (payload?.status === 'OK') {
          const location = payload?.results?.[0]?.geometry?.location;
          if (typeof location?.lat === 'number' && typeof location?.lng === 'number') {
            return { latitude: location.lat, longitude: location.lng };
          }
        }
      }
    } catch {
      // Continue to open ZIP geocoder fallback.
    }
  }

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

const fallbackMatchProfessionals = async (lead) => {
  const leadLat = toFloatOrNull(lead?.latitude);
  const leadLng = toFloatOrNull(lead?.longitude);
  if (leadLat === null || leadLng === null) return [];

  const specialty = String(lead?.specialty || '').trim().toLowerCase();
  if (!specialty) return [];

  const q = new URLSearchParams({
    is_verified: 'eq.true',
    select: 'id,specialties,service_zip_codes,service_radius_km,service_center_lat,service_center_lng',
    limit: '500',
  });
  const rows = await supabaseRequest(`/rest/v1/professionals?${q.toString()}`);
  const professionals = Array.isArray(rows) ? rows : [];

  const matches = [];
  for (const pro of professionals) {
    const specialties = Array.isArray(pro?.specialties)
      ? pro.specialties.map((s) => String(s || '').trim().toLowerCase())
      : [];
    if (!specialties.includes(specialty)) continue;

    const zipCodes = Array.isArray(pro?.service_zip_codes)
      ? pro.service_zip_codes.map((z) => String(z || '').trim())
      : [];
    const zipMatch = zipCodes.includes(String(lead.zip_code || '').trim());

    let centerLat = toFloatOrNull(pro?.service_center_lat);
    let centerLng = toFloatOrNull(pro?.service_center_lng);

    if ((centerLat === null || centerLng === null) && zipCodes.length > 0) {
      const geocoded = await geocodeUsZipCode(zipCodes[0]);
      if (geocoded) {
        centerLat = geocoded.latitude;
        centerLng = geocoded.longitude;

        const uq = new URLSearchParams({ id: `eq.${pro.id}` });
        try {
          await supabaseRequest(`/rest/v1/professionals?${uq.toString()}`, {
            method: 'PATCH',
            body: { service_center_lat: centerLat, service_center_lng: centerLng },
            headers: { Prefer: 'return=minimal' },
          });
        } catch {
          // Best-effort cache; matching can still continue without persistence.
        }
      }
    }

    let distanceKm = null;
    if (centerLat !== null && centerLng !== null) {
      distanceKm = haversineDistanceKm(leadLat, leadLng, centerLat, centerLng);
    }

    const radiusKm = Number.isFinite(Number(pro?.service_radius_km)) ? Number(pro.service_radius_km) : 25;
    if (zipMatch || (distanceKm !== null && distanceKm <= radiusKm)) {
      matches.push({
        professional_id: pro.id,
        distance_km: distanceKm,
        zip_match: zipMatch,
      });
    }
  }

  matches.sort((a, b) => {
    if (a.zip_match !== b.zip_match) return a.zip_match ? -1 : 1;
    const ad = a.distance_km ?? Number.POSITIVE_INFINITY;
    const bd = b.distance_km ?? Number.POSITIVE_INFINITY;
    return ad - bd;
  });

  return matches.slice(0, MAX_WATERFALL_PROS);
};

const fallbackMatchBySpecialtyOnly = async (lead) => {
  const specialty = String(lead?.specialty || '').trim().toLowerCase();
  if (!specialty) return [];

  const q = new URLSearchParams({
    is_verified: 'eq.true',
    select: 'id,specialties,is_denied,is_paused_by_contractor',
    limit: '500',
  });

  let rows;
  try {
    rows = await supabaseRequest(`/rest/v1/professionals?${q.toString()}`);
  } catch (err) {
    if (!hasMissingColumnError(err, 'is_denied') && !hasMissingColumnError(err, 'is_paused_by_contractor')) throw err;
    const fallbackQ = new URLSearchParams({
      is_verified: 'eq.true',
      select: 'id,specialties',
      limit: '500',
    });
    rows = await supabaseRequest(`/rest/v1/professionals?${fallbackQ.toString()}`);
  }

  const professionals = Array.isArray(rows) ? rows : [];

  const matches = professionals
    .filter((pro) => {
      if (pro?.is_denied === true) return false;
      if (pro?.is_paused_by_contractor === true) return false;
      const specialties = Array.isArray(pro?.specialties)
        ? pro.specialties.map((s) => String(s || '').trim().toLowerCase())
        : [];
      return specialties.includes(specialty);
    })
    .map((pro) => ({
      professional_id: pro.id,
      distance_km: null,
      zip_match: false,
    }));

  return matches.slice(0, MAX_WATERFALL_PROS);
};

// Reuse the waterfall dispatch logic inline (no cross-function calls in Netlify)
const CLAIM_WINDOW_MINUTES = 10;
const MAX_WATERFALL_PROS = 20;
const toIsoInClaimWindow = () => new Date(Date.now() + CLAIM_WINDOW_MINUTES * 60 * 1000).toISOString();

const sendTwilioMessage = async (to, message) => {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_FROM_NUMBER;
  if (!twilioSid || !twilioToken || !twilioFrom) return { sid: null, skipped: true };

  const form = new URLSearchParams({ To: to, From: twilioFrom, Body: message });
  const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Twilio error ${res.status}: ${JSON.stringify(data)}`);
  return { sid: data.sid, skipped: false };
};

const sendEmail = async ({ to, subject, html }) => {
  const resendApiKey = getResendApiKey();
  const notificationsFromEmail = getNotificationsFromEmail();
  const notificationsReplyToEmail = getNotificationsReplyToEmail();
  if (!resendApiKey || !to) return { skipped: true, reason: 'Missing Resend API key or recipient email.' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: notificationsFromEmail,
      to: [to],
      reply_to: notificationsReplyToEmail,
      subject,
      html,
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${text}`);
  return { skipped: false };
};

const notifyAdminNoMatch = async (leadRequestId, lead) => {
  const adminPhone = getAdminPhone();
  const internalEmails = getInternalNotificationEmails();
  if (!adminPhone && internalEmails.length === 0) {
    return { skipped: true, reason: 'Missing internal no-match notification targets.' };
  }

  const specialty = lead.projectType || lead.specialty || 'project';
  const zip = lead.zip_code || 'unknown zip';
  const ref = formatLeadRef(leadRequestId);
  const message =
    `ACTION NEEDED - ProjectPrice No-Match Alert\n` +
    `Lead Ref: ${ref}\n` +
    `Type: ${specialty} in ${zip}\n` +
    `No approved contractors matched at submission. Manually follow up or expand contractor coverage.`;
  const sms = adminPhone
    ? await sendTwilioMessage(adminPhone, message)
    : { sid: null, skipped: true, reason: 'Missing ADMIN_PHONE_NUMBER.' };

  const emailResults = [];
  for (const recipient of internalEmails) {
    const email = await sendEmail({
      to: recipient,
      subject: `Manual follow-up needed for ${ref}`,
      html: renderEmailTemplate({
        title: 'No-match lead needs manual follow-up',
        intro: 'No approved contractors matched this lead at submission time. Please review and follow up manually.',
        details: [
          `Service: ${specialty}`,
          `ZIP: ${zip}`,
        ],
        reference: ref,
      }),
    });
    emailResults.push({ to: recipient, ...email });
  }

  return { sms, emails: emailResults };
};

const dispatchFirstOffer = async (leadRequestId, lead) => {
  const rpcMatches = await supabaseRequest('/rest/v1/rpc/match_professionals', {
    method: 'POST',
    body: {
      p_zip_code: lead.zip_code,
      p_specialty: lead.specialty,
      p_lat: lead.latitude || null,
      p_lng: lead.longitude || null,
      p_limit: MAX_WATERFALL_PROS,
    },
  });

  let matches = Array.isArray(rpcMatches) ? rpcMatches : [];
  if (matches.length === 0) {
    matches = await fallbackMatchProfessionals(lead);
  }
  if (matches.length === 0) {
    matches = await fallbackMatchBySpecialtyOnly(lead);
  }

  if (!Array.isArray(matches) || matches.length === 0) {
    const q = new URLSearchParams({ id: `eq.${leadRequestId}` });
    try {
      await supabaseRequest(`/rest/v1/lead_requests?${q.toString()}`, {
        method: 'PATCH',
        body: { status: 'no_match' },
        headers: { Prefer: 'return=minimal' },
      });
    } catch (err) {
      if (!hasInvalidEnumValueError(err, 'no_match')) throw err;
      await supabaseRequest(`/rest/v1/lead_requests?${q.toString()}`, {
        method: 'PATCH',
        body: { status: 'expired' },
        headers: { Prefer: 'return=minimal' },
      });
    }
    return { dispatched: false, noMatch: true, reason: 'No matching professionals in your area yet.' };
  }

  // Insert top 3 offer slots
  const inserts = matches.map((m, i) => ({
    lead_request_id: leadRequestId,
    professional_id: m.professional_id,
    position: i + 1,
  }));
  await supabaseRequest('/rest/v1/lead_offers', {
    method: 'POST',
    body: inserts,
    headers: { Prefer: 'return=minimal' },
  });

  // Get first offer's professional contact
  const first = inserts[0];
  const q = new URLSearchParams({ id: `eq.${first.professional_id}`, select: 'id,user_id,company_name,contact_phone', limit: '1' });
  const pros = await supabaseRequest(`/rest/v1/professionals?${q.toString()}`);
  const pro = pros?.[0];
  if (!pro) return { dispatched: false, reason: 'Professional contact not found.' };

  let proEmail = null;
  try {
    const authPro = await getAuthUserById(pro.user_id);
    proEmail = authPro?.email || null;
  } catch {
    proEmail = null;
  }

  // Get offer row id
  const oq = new URLSearchParams({
    lead_request_id: `eq.${leadRequestId}`,
    professional_id: `eq.${first.professional_id}`,
    select: 'id',
    limit: '1',
  });
  const offerRows = await supabaseRequest(`/rest/v1/lead_offers?${oq.toString()}`);
  const offerId = offerRows?.[0]?.id;

  const specialty = lead.projectType || lead.specialty || 'Construction';
  const leadRef = formatLeadRef(leadRequestId);
  const desc = lead.description ? ` - ${lead.description.slice(0, 80)}` : '';
  const smsBody = `ProjectPrice Lead: ${specialty} in ${lead.zip_code}${desc}. Reply YES within ${CLAIM_WINDOW_MINUTES} min to claim. Ref: ${leadRequestId.slice(0, 8)}`;

  const sms = await sendTwilioMessage(pro.contact_phone, smsBody);
  const email = proEmail
    ? await sendEmail({
      to: proEmail,
      subject: `New lead opportunity (${leadRef})`,
      html: renderEmailTemplate({
        title: 'A new lead is available',
        intro: 'You have a new lead opportunity in your service area. Please respond quickly to claim it.',
        details: [
          `Service: ${specialty}`,
          `ZIP: ${lead.zip_code}`,
          `Response window: ${CLAIM_WINDOW_MINUTES} minutes`,
        ],
        ctaLabel: 'Open contractor dashboard',
        ctaUrl: `${getAppBaseUrl()}/contractor-dashboard.html?leadRequestId=${encodeURIComponent(leadRequestId)}&professionalId=${encodeURIComponent(first.professional_id)}`,
        reference: leadRef,
      }),
    })
    : { skipped: true, reason: 'Professional email not available.' };

  if (offerId) {
    const uq = new URLSearchParams({ id: `eq.${offerId}` });
    await supabaseRequest(`/rest/v1/lead_offers?${uq.toString()}`, {
      method: 'PATCH',
      body: { offered_at: new Date().toISOString(), expires_at: toIsoInClaimWindow(), twilio_message_sid: sms.sid },
      headers: { Prefer: 'return=minimal' },
    });
  }

  return { dispatched: true, prosNotified: matches.length, twilio: sms, email };
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return jsonResponse(400, { error: 'Invalid JSON.' }); }

  const {
    userId: requestedUserId,
    projectId: requestedProjectId,
    fullName,
    email,
    phone,
    zipCode,
    streetAddress,
    projectType,
    description,
  } = payload;
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!fullName || !normalizedEmail || !phone || !zipCode || !streetAddress || !projectType) {
    return jsonResponse(400, { error: 'fullName, email, phone, zipCode, streetAddress, and projectType are required.' });
  }
  if (!/^\d{5}$/.test(String(zipCode).trim())) {
    return jsonResponse(400, { error: 'zipCode must be a 5-digit US zip code.' });
  }

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return jsonResponse(400, { error: 'phone must be a valid US phone number.' });
  }

  try {
    const geocodedProjectPoint = await geocodeUsZipCode(zipCode.trim());

    // 1. Create or find auth user
    let userId = String(requestedUserId || '').trim();
    const existing = await findAuthUserByEmail(normalizedEmail);

    if (existing) {
      if (userId && userId !== existing.id) {
        return jsonResponse(409, { error: 'Account mismatch. Please sign in again.' });
      }
      userId = existing.id;
    } else {
      const tempPassword = `PP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const authData = await supabaseRequest('/auth/v1/admin/users', {
        method: 'POST',
        body: { email: normalizedEmail, password: tempPassword, email_confirm: true, user_metadata: { full_name: fullName, role: 'homeowner' } },
      });
      userId = authData?.id;
      if (!userId) throw new Error('Failed to create user account.');
    }

    // 2. Ensure profile row exists
    await supabaseRequest('/rest/v1/profiles', {
      method: 'POST',
      body: { id: userId, display_name: fullName },
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    });

    // 3. Ensure users row exists
    await supabaseRequest('/rest/v1/users', {
      method: 'POST',
      body: { id: userId, role: 'homeowner', full_name: fullName, phone: normalizedPhone, zip_code: zipCode.trim(), ...(streetAddress && { street_address: streetAddress }) },
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    });

    // Always refresh homeowner identity fields so contractor views show current submitter details.
    const profilePatchQ = new URLSearchParams({ id: `eq.${userId}` });
    await supabaseRequest(`/rest/v1/profiles?${profilePatchQ.toString()}`, {
      method: 'PATCH',
      body: { display_name: fullName },
      headers: { Prefer: 'return=minimal' },
    });

    const userPatchQ = new URLSearchParams({ id: `eq.${userId}` });
    await supabaseRequest(`/rest/v1/users?${userPatchQ.toString()}`, {
      method: 'PATCH',
      body: { full_name: fullName, phone: normalizedPhone, zip_code: zipCode.trim(), ...(streetAddress && { street_address: streetAddress }) },
      headers: { Prefer: 'return=minimal' },
    });

    // 4. Reuse saved project when provided; otherwise create a fresh lead project.
    let projectId = String(requestedProjectId || '').trim();
    if (projectId) {
      const existingProject = await loadOwnedProject(projectId, userId);
      if (!existingProject?.id) {
        return jsonResponse(404, { error: 'Saved project not found for this homeowner.' });
      }

      const patchQ = new URLSearchParams({ id: `eq.${projectId}` });
      await supabaseRequest(`/rest/v1/projects?${patchQ.toString()}`, {
        method: 'PATCH',
        body: {
          project_type: projectType.toLowerCase(),
          zip_code: zipCode.trim(),
          description: description || existingProject.description || null,
          ...(geocodedProjectPoint && {
            latitude: geocodedProjectPoint.latitude,
            longitude: geocodedProjectPoint.longitude,
          }),
        },
        headers: { Prefer: 'return=minimal' },
      });
    } else {
      const projectRows = await supabaseRequest('/rest/v1/projects', {
        method: 'POST',
        body: {
          owner_id: userId,
          name: `${projectType} – ${zipCode}`,
          project_type: projectType.toLowerCase(),
          zip_code: zipCode.trim(),
          description: description || null,
          ...(geocodedProjectPoint && {
            latitude: geocodedProjectPoint.latitude,
            longitude: geocodedProjectPoint.longitude,
          }),
        },
        headers: { Prefer: 'return=representation' },
      });
      projectId = projectRows?.[0]?.id;
      if (!projectId) throw new Error('Failed to create project.');
    }

    // 5. Create lead request
    const leadRows = await supabaseRequest('/rest/v1/lead_requests', {
      method: 'POST',
      body: {
        project_id: projectId,
        homeowner_id: userId,
        homeowner_email: normalizedEmail,
        homeowner_phone: normalizedPhone,
        specialty: projectType.toLowerCase(),
        zip_code: zipCode.trim(),
        status: 'pending',
      },
      headers: { Prefer: 'return=representation' },
    }).catch(async (err) => {
      if (hasMissingColumnError(err, 'homeowner_phone')) {
        try {
          return await supabaseRequest('/rest/v1/lead_requests', {
            method: 'POST',
            body: {
              project_id: projectId,
              homeowner_id: userId,
              homeowner_email: normalizedEmail,
              specialty: projectType.toLowerCase(),
              zip_code: zipCode.trim(),
              status: 'pending',
            },
            headers: { Prefer: 'return=representation' },
          });
        } catch (innerErr) {
          if (!hasMissingColumnError(innerErr, 'homeowner_email')) throw innerErr;
        }
      }

      if (!hasMissingColumnError(err, 'homeowner_email') && !hasMissingColumnError(err, 'homeowner_phone')) throw err;
      return supabaseRequest('/rest/v1/lead_requests', {
        method: 'POST',
        body: {
          project_id: projectId,
          homeowner_id: userId,
          specialty: projectType.toLowerCase(),
          zip_code: zipCode.trim(),
          status: 'pending',
        },
        headers: { Prefer: 'return=representation' },
      });
    });
    const lead = leadRows?.[0];
    if (!lead) throw new Error('Failed to create lead request.');

    // 6. Fetch project geolocation for radius-based matching
    const projQ = new URLSearchParams({
      id: `eq.${projectId}`,
      select: 'id,latitude,longitude',
      limit: '1',
    });
    const projRows = await supabaseRequest(`/rest/v1/projects?${projQ.toString()}`);
    const project = projRows?.[0];

    // 7. Auto-dispatch
    const dispatchResult = await dispatchFirstOffer(lead.id, {
      zip_code: zipCode.trim(),
      specialty: projectType.toLowerCase(),
      projectType,
      description,
      latitude: geocodedProjectPoint?.latitude ?? project?.latitude ?? null,
      longitude: geocodedProjectPoint?.longitude ?? project?.longitude ?? null,
    });

    const homeownerDashboardUrl = `${getAppBaseUrl()}/my-estimates.html`;
    const customerName = String(fullName || '').trim() || 'Customer';
    const leadRef = formatLeadRef(lead.id);

    let homeownerSmsBody = `${customerName}, Project Price- We've received your request! To ensure top quality, we are hand-matching your project with one exclusive, verified Pro in your area. Please hang tight-we give our Pros a dedicated window to review your details carefully before they connect. Ref: ${lead.id.slice(0, 8)}.`;
    let responseMessage = `Success! Your request has been submitted. We are currently notifying an Approved contractor available in your area. We also sent a confirmation text while we hand-match your request.`;

    if (dispatchResult.noMatch) {
      homeownerSmsBody = `${customerName}, Project Price- We've received your request, but we could not find an approved contractor match in your area right now. Our team has been notified for manual follow-up. Ref: ${lead.id.slice(0, 8)}.`;
      responseMessage = 'Success! Your request has been submitted, but no approved contractor match was found immediately. Our team has been notified for manual follow-up, and we also sent you a confirmation text.';

      try {
        await notifyAdminNoMatch(lead.id, {
          specialty: projectType.toLowerCase(),
          projectType,
          zip_code: zipCode.trim(),
        });
      } catch {
        // Non-fatal; keep the homeowner flow alive.
      }
    }

    let homeownerSms = { sid: null, skipped: true };
    try {
      homeownerSms = await sendTwilioMessage(normalizedPhone, homeownerSmsBody);
    } catch {
      homeownerSms = { sid: null, skipped: true };
    }

    let homeownerEmail = { skipped: true, reason: 'Homeowner email not available.' };
    try {
      homeownerEmail = await sendEmail({
        to: normalizedEmail,
        subject: dispatchResult.noMatch
          ? `Update on your project request (${leadRef})`
          : `We received your Project Price request (${leadRef})`,
        html: renderEmailTemplate({
          title: dispatchResult.noMatch ? 'We are still working on your match' : 'Your request is in progress',
          intro: homeownerSmsBody,
          ctaLabel: 'View your estimates dashboard',
          ctaUrl: homeownerDashboardUrl,
          reference: leadRef,
        }),
      });
    } catch {
      homeownerEmail = { skipped: true, reason: 'Email send failed.' };
    }

    return jsonResponse(201, {
      message: responseMessage,
      leadRequestId: lead.id,
      dispatched: dispatchResult.dispatched,
      noMatch: dispatchResult.noMatch === true,
      homeownerDashboardUrl,
      smsReceiptSent: homeownerSms.skipped !== true,
      emailReceiptSent: homeownerEmail.skipped !== true,
    });
  } catch (err) {
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Unexpected error.' });
  }
};
