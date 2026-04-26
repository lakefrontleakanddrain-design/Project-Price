const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const escapeXml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const xmlResponse = (message) => ({
  statusCode: 200,
  headers: { 'Content-Type': 'text/xml' },
  body: `<Response><Message>${escapeXml(message)}</Message></Response>`,
});

const env = () => ({
  supabaseUrl: process.env.SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  twilioSid: process.env.TWILIO_ACCOUNT_SID,
  twilioToken: process.env.TWILIO_AUTH_TOKEN,
  twilioFrom: process.env.TWILIO_FROM_NUMBER,
  contractorDashboardUrl: process.env.CONTRACTOR_DASHBOARD_URL,
  adminPhone: process.env.ADMIN_PHONE_NUMBER,
  appBaseUrl: process.env.APP_BASE_URL || 'https://project-price-app.netlify.app',
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
  if (!res.ok) {
    throw new Error(`Supabase error ${res.status}: ${text}`);
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const sendTwilioMessage = async (to, message) => {
  const { twilioSid, twilioToken, twilioFrom } = env();
  if (!twilioSid || !twilioToken || !twilioFrom) {
    return { sid: null, skipped: true, reason: 'Missing Twilio env vars' };
  }

  const form = new URLSearchParams({
    To: to,
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
  return { sid: data.sid, skipped: false };
};

const CLAIM_WINDOW_MINUTES = 10;
const REPLY_GRACE_MINUTES = 3;
const MAX_WATERFALL_PROS = 20;
const toIsoInClaimWindow = () => new Date(Date.now() + CLAIM_WINDOW_MINUTES * 60 * 1000).toISOString();

const parseBody = (eventBody) => {
  if (!eventBody) return {};
  try {
    return JSON.parse(eventBody);
  } catch {
    return Object.fromEntries(new URLSearchParams(eventBody).entries());
  }
};

const hasInvalidEnumValueError = (err, enumValue) => {
  const text = String(err?.message || err || '');
  return text.includes('22P02') && text.includes(enumValue);
};

const setLeadNoMatchStatus = async (leadRequestId) => {
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
};

const normalizePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return phone || '';
};

const getLead = async (leadRequestId) => {
  const q = new URLSearchParams({
    id: `eq.${leadRequestId}`,
    select: 'id,status,specialty,zip_code,latitude,longitude,project_id',
    limit: '1',
  });
  const rows = await supabaseRequest(`/rest/v1/lead_requests?${q.toString()}`);
  const lead = rows?.[0] || null;
  if (lead?.project_id) {
    const pq = new URLSearchParams({
      id: `eq.${lead.project_id}`,
      select: 'name,description,project_type,estimated_cost_range',
      limit: '1',
    });
    const projects = await supabaseRequest(`/rest/v1/projects?${pq.toString()}`);
    lead.project = projects?.[0] || null;
  }
  return lead;
};

const getOffers = async (leadRequestId) => {
  const q = new URLSearchParams({
    lead_request_id: `eq.${leadRequestId}`,
    order: 'position.asc',
    select: 'id,lead_request_id,professional_id,position,offered_at,expires_at,response',
  });
  return (await supabaseRequest(`/rest/v1/lead_offers?${q.toString()}`)) || [];
};

const initWaterfall = async (lead) => {
  const matches = await supabaseRequest('/rest/v1/rpc/match_professionals', {
    method: 'POST',
    body: {
      p_zip_code: lead.zip_code,
      p_specialty: lead.specialty,
      p_lat: lead.latitude,
      p_lng: lead.longitude,
      p_limit: MAX_WATERFALL_PROS,
    },
  });

  if (!Array.isArray(matches) || matches.length === 0) {
    await setLeadNoMatchStatus(lead.id);
    await notifyNoMatch(lead, lead.id);
    return [];
  }

  const inserts = matches.map((m, i) => ({
    lead_request_id: lead.id,
    professional_id: m.professional_id,
    position: i + 1,
  }));

  await supabaseRequest('/rest/v1/lead_offers', {
    method: 'POST',
    body: inserts,
    headers: { Prefer: 'return=minimal' },
  });

  return getOffers(lead.id);
};

const markOffer = async (offerId, patch) => {
  const q = new URLSearchParams({ id: `eq.${offerId}` });
  await supabaseRequest(`/rest/v1/lead_offers?${q.toString()}`, {
    method: 'PATCH',
    body: patch,
    headers: { Prefer: 'return=minimal' },
  });
};

const claimOffer = async (offer) => {
  await markOffer(offer.id, { response: 'yes', responded_at: new Date().toISOString() });

  const qLead = new URLSearchParams({ id: `eq.${offer.lead_request_id}` });
  await supabaseRequest(`/rest/v1/lead_requests?${qLead.toString()}`, {
    method: 'PATCH',
    body: { status: 'claimed', claimed_professional_id: offer.professional_id },
    headers: { Prefer: 'return=minimal' },
  });

  const qOthers = new URLSearchParams({
    lead_request_id: `eq.${offer.lead_request_id}`,
    id: `neq.${offer.id}`,
    response: 'is.null',
  });
  await supabaseRequest(`/rest/v1/lead_offers?${qOthers.toString()}`, {
    method: 'PATCH',
    body: { response: 'skipped', responded_at: new Date().toISOString() },
    headers: { Prefer: 'return=minimal' },
  });

  const dashboardBaseUrl = env().contractorDashboardUrl || 'https://project-price-app.netlify.app/contractor-dashboard.html';
  const separator = dashboardBaseUrl.includes('?') ? '&' : '?';
  const dashboardUrl = `${dashboardBaseUrl}${separator}leadRequestId=${encodeURIComponent(offer.lead_request_id)}&professionalId=${encodeURIComponent(offer.professional_id)}`;
  return `Lead claimed. Dashboard access granted: ${dashboardUrl}`;
};

const notifyNoMatch = async (lead, leadRequestId, prosTried = 0) => {
  const { adminPhone, appBaseUrl } = env();
  const specialty = lead.project?.project_type || lead.specialty || 'project';
  const zip = lead.zip_code || 'unknown zip';
  const ref = leadRequestId.slice(0, 8);
  const dashboardUrl = `${appBaseUrl.replace(/\/$/, '')}/my-estimates.html`;

  // Option A: Notify homeowner via SMS
  try {
    const homeownerQ = new URLSearchParams({
      id: `eq.${leadRequestId}`,
      select: 'homeowner_phone,homeowner_email',
      limit: '1',
    });
    const leadRows = await supabaseRequest(`/rest/v1/lead_requests?${homeownerQ.toString()}`);
    const homeownerPhone = leadRows?.[0]?.homeowner_phone;

    if (homeownerPhone) {
      const homeownerMsg =
        `ProjectPrice: We weren't able to match your ${specialty} request (Ref: ${ref}) in ${zip} with an available contractor right now. ` +
        `Our team has been notified and will follow up shortly. You can also re-submit anytime at: ${dashboardUrl}`;
      await sendTwilioMessage(homeownerPhone, homeownerMsg);
    }
  } catch {
    // Non-fatal: log silently, don't block the response
  }

  // Option C: Notify admin/sales for manual follow-up
  try {
    if (adminPhone) {
      const triedText = prosTried > 0 ? `\nContractors tried: ${prosTried} (all declined or timed out).` : '';
      const adminMsg =
        `ACTION NEEDED \u2014 ProjectPrice No-Match Alert\n` +
        `Lead Ref: ${ref}\n` +
        `Type: ${specialty} in ${zip}${triedText}\n` +
        `Manually follow up or expand contractor coverage.`;
      await sendTwilioMessage(adminPhone, adminMsg);
    }
  } catch {
    // Non-fatal
  }
};

const dispatchNextOffer = async (leadRequestId) => {
  const lead = await getLead(leadRequestId);
  if (!lead) throw new Error('Lead request not found.');
  if (lead.status !== 'pending') return { message: `Lead is ${lead.status}; no dispatch.` };

  let offers = await getOffers(leadRequestId);
  if (offers.length === 0) offers = await initWaterfall(lead);
  if (offers.length === 0) return { message: 'No matching pros; lead marked no_match.' };

  for (const offer of offers) {
    if (offer.response === 'yes') return { message: 'Lead already claimed.' };
    if (offer.offered_at && offer.expires_at && !offer.response && new Date(offer.expires_at).getTime() <= Date.now()) {
      await markOffer(offer.id, { response: 'timeout', responded_at: new Date().toISOString() });
    }
  }

  offers = await getOffers(leadRequestId);
  const next = offers.find((o) => !o.response && !o.offered_at);

  if (!next) {
    const unresolved = offers.find((o) => !o.response);
    if (!unresolved) {
      // All 3 contractors declined or timed out — mark as no_match and notify
      await setLeadNoMatchStatus(leadRequestId);
      await notifyNoMatch(lead, leadRequestId, offers.length);
      return { message: `Waterfall complete: no_match after ${offers.length} contractors. Homeowner and admin notified.` };
    }
    return { message: 'Awaiting active offer response.' };
  }

  const q = new URLSearchParams({
    id: `eq.${next.professional_id}`,
    select: 'id,company_name,contact_phone',
    limit: '1',
  });
  const pros = await supabaseRequest(`/rest/v1/professionals?${q.toString()}`);
  const pro = pros?.[0];
  if (!pro) throw new Error('Professional contact not found.');

  const specialty = lead.project?.project_type || lead.specialty || 'Construction';
  const zip = lead.zip_code || '';
  const desc = lead.project?.description ? ` - ${lead.project.description.slice(0, 80)}` : '';
  const smsBody = `ProjectPrice Lead: ${specialty} in ${zip}${desc}. Reply YES within ${CLAIM_WINDOW_MINUTES} min to claim. Ref: ${leadRequestId.slice(0, 8)}`;

  const sms = await sendTwilioMessage(pro.contact_phone, smsBody);

  await markOffer(next.id, {
    offered_at: new Date().toISOString(),
    expires_at: toIsoInClaimWindow(),
    twilio_message_sid: sms.sid,
  });

  return { message: `Offer sent to position ${next.position}.`, twilio: sms };
};

const handleTwilioReply = async (fromPhone, body) => {
  const phoneCandidates = Array.from(new Set([fromPhone, normalizePhone(fromPhone)].filter(Boolean)));
  let pros = [];
  for (const phone of phoneCandidates) {
    const qPro = new URLSearchParams({
      contact_phone: `eq.${phone}`,
      select: 'id,contact_phone',
      limit: '20',
    });
    const rows = (await supabaseRequest(`/rest/v1/professionals?${qPro.toString()}`)) || [];
    pros = pros.concat(rows);
  }
  const professionalIds = Array.from(new Set(pros.map((p) => p.id).filter(Boolean)));
  if (professionalIds.length === 0) return 'Phone not linked to a professional account.';

  const qOffer = new URLSearchParams({
    professional_id: `in.(${professionalIds.join(',')})`,
    select: 'id,lead_request_id,professional_id,expires_at,response,offered_at,created_at',
    response: 'is.null',
    order: 'offered_at.desc',
    limit: '20',
  });
  const offers = (await supabaseRequest(`/rest/v1/lead_offers?${qOffer.toString()}`)) || [];

  const now = Date.now();
  const replyText = String(body || '').trim();
  const normalizedReply = replyText.replace(/\s+/g, ' ').trim().toUpperCase();
  const isYes = /^YES\b/.test(normalizedReply);
  const isNo = /^NO\b/.test(normalizedReply);
  const refMatch = replyText.match(/\b([0-9a-f]{8})\b/i);
  const refToken = refMatch?.[1]?.toLowerCase() || null;

  let offer = null;
  if (refToken) {
    offer = offers.find((o) => String(o.lead_request_id || '').toLowerCase().startsWith(refToken)) || null;
  }
  if (!offer) {
    offer = offers.find((o) => o.expires_at && new Date(o.expires_at).getTime() >= now) || null;
  }
  if (!offer && offers.length > 0) {
    offer = offers[0];
  }
  if (!offer) return 'No active offer found.';

  if (!isYes && !isNo) {
    return 'Reply YES to claim or NO to pass. You can include Ref: XXXXXXXX from the offer text.';
  }

  const expiresAt = offer.expires_at ? new Date(offer.expires_at).getTime() : 0;
  const isExpired = !expiresAt || expiresAt < now;
  if (isExpired) {
    const withinGrace = isYes && expiresAt > 0 && now - expiresAt <= REPLY_GRACE_MINUTES * 60 * 1000;
    if (withinGrace) {
      const lead = await getLead(offer.lead_request_id);
      if (lead?.status === 'pending') {
        return claimOffer(offer);
      }
    }

    await markOffer(offer.id, { response: 'timeout', responded_at: new Date().toISOString() });
    await dispatchNextOffer(offer.lead_request_id);
    return 'Offer expired. Passed to the next professional.';
  }

  if (isYes) {
    return claimOffer(offer);
  }

  await markOffer(offer.id, { response: 'no', responded_at: new Date().toISOString() });
  await dispatchNextOffer(offer.lead_request_id);
  return 'Declined. Moved to next professional.';
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

    const payload = parseBody(event.body);
    if (typeof payload.From === 'string' && typeof payload.Body === 'string') {
      const message = await handleTwilioReply(payload.From, payload.Body);
      return xmlResponse(message);
    }

    if (typeof payload.leadRequestId !== 'string' || payload.leadRequestId.length < 8) {
      return jsonResponse(400, { error: 'leadRequestId is required.' });
    }

    const result = await dispatchNextOffer(payload.leadRequestId);
    return jsonResponse(200, result);
  } catch (error) {
    return jsonResponse(500, { error: error instanceof Error ? error.message : 'Unexpected error' });
  }
};
