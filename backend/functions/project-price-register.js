const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

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

const normalizePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
};

const normalizeServiceZip = (zipRaw) => {
  const first = String(zipRaw || '')
    .split(/[\s,]+/)
    .map((z) => z.trim())
    .find((z) => /^\d{5}$/.test(z));
  return first || '';
};

const milesToKm = (miles) => Number(miles) * 1.60934;

const getGoogleMapsApiKey = () => String(process.env.GOOGLE_MAPS_API_KEY || '').trim();
const getResendApiKey = () => String(process.env.RESEND_API_KEY || '').trim();

const LICENSE_REQUIRED_SERVICES = new Set([
  'general contractor', 'roofing', 'plumbing', 'hvac', 'electrical',
  'painting', 'flooring', 'windows and doors', 'siding', 'landscaping',
]);
const getStripeSecretKey = () => String(process.env.STRIPE_SECRET_KEY || '').trim();
const getStripePriceId = () => String(process.env.STRIPE_PRICE_ID || '').trim();

const createStripeCheckoutSession = async ({ professionalId, email, companyName, appBaseUrl }) => {
  const secretKey = getStripeSecretKey();
  const priceId = getStripePriceId();
  if (!secretKey || !priceId) throw new Error('Stripe is not configured (missing STRIPE_SECRET_KEY or STRIPE_PRICE_ID).');

  const params = new URLSearchParams({
    'mode': 'subscription',
    'payment_method_types[0]': 'card',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'client_reference_id': professionalId,
    'customer_email': email,
    'success_url': `${appBaseUrl}/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`,
    'cancel_url': `${appBaseUrl}/checkout-cancel.html`,
    'subscription_data[metadata][professionalId]': professionalId,
    'subscription_data[metadata][companyName]': companyName,
  });

  const auth = Buffer.from(`${secretKey}:`).toString('base64');
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Stripe error ${res.status}: ${text}`);
  const session = JSON.parse(text);
  return session.url;
};

const getNotificationsFromEmail = () => String(process.env.NOTIFICATIONS_FROM_EMAIL || 'notifications@projectprice.app').trim();
const getNotificationsReplyToEmail = () => String(process.env.NOTIFICATIONS_REPLY_TO_EMAIL || 'support@projectprice.app').trim();
const getAdminPhone = () => normalizePhone(String(process.env.ADMIN_PHONE_NUMBER || '').trim());
const getAdminNotificationEmail = () => String(process.env.ADMIN_NOTIFICATION_EMAIL || '').trim().toLowerCase();
const getSalesNotificationEmail = () => String(process.env.SALES_NOTIFICATION_EMAIL || '').trim().toLowerCase();
const getAppBaseUrl = () => String(process.env.APP_BASE_URL || process.env.SITE_URL || 'https://projectpriceapp.com').trim().replace(/\/$/, '');

const CONTRACTOR_TERMS_VERSION = 'charter-member-professional-v1.0-2026-04-30';

const isEmail = (value) => /^\S+@\S+\.\S+$/.test(String(value || '').trim());

const sendTwilioMessage = async (to, message) => {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_FROM_NUMBER;
  if (!twilioSid || !twilioToken || !twilioFrom || !to) {
    return { skipped: true, reason: 'Missing Twilio config or recipient.' };
  }

  const form = new URLSearchParams({ To: to, From: twilioFrom, Body: message });
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
  if (!res.ok) throw new Error(`Twilio error ${res.status}: ${JSON.stringify(data)}`);
  return { skipped: false, sid: data.sid };
};

const sendEmail = async ({ to, subject, html }) => {
  const resendApiKey = getResendApiKey();
  if (!resendApiKey || !to) {
    return { skipped: true, reason: 'Missing Resend config or recipient.' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: getNotificationsFromEmail(),
      to: [to],
      reply_to: getNotificationsReplyToEmail(),
      subject,
      html,
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${text}`);
  return { skipped: false };
};

const ensureStorageBucket = async () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = 'contractor-docs';
  const getRes = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucket}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!getRes.ok) {
    await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: bucket, public: false }),
    });
  }
  return bucket;
};

const uploadDataUrlDoc = async ({ professionalId, serviceName, kind, dataUrl, filename }) => {
  if (!dataUrl) return null;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = await ensureStorageBucket();
  const match = String(dataUrl).match(/^data:(.+);base64,(.+)$/);
  if (!match) throw new Error('Invalid file format.');
  const contentType = match[1] || 'application/octet-stream';
  const bytes = Buffer.from(match[2] || '', 'base64');
  const safeName = (filename || `${kind}.bin`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${professionalId}/${serviceName}/${kind}-${Date.now()}-${safeName}`;
  const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: bytes,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Failed to upload ${kind}: ${text}`);
  return `${bucket}/${path}`;
};

const saveComplianceDocs = async ({ professionalId, complianceDocs, clientIp }) => {
  if (!Array.isArray(complianceDocs) || complianceDocs.length === 0) return;
  for (const doc of complianceDocs) {
    const serviceName = String(doc.specialty || '').trim().toLowerCase();
    if (!serviceName) continue;

    const insurancePath = await uploadDataUrlDoc({
      professionalId,
      serviceName,
      kind: 'insurance',
      dataUrl: doc.insuranceDocDataUrl,
      filename: doc.insuranceDocFileName,
    });

    let licensePath = null;
    const licWaived = doc.licenseWaived === true;
    const needsLicense = LICENSE_REQUIRED_SERVICES.has(serviceName);

    if (needsLicense && !licWaived && doc.licenseDocDataUrl) {
      licensePath = await uploadDataUrlDoc({
        professionalId,
        serviceName,
        kind: 'license',
        dataUrl: doc.licenseDocDataUrl,
        filename: doc.licenseDocFileName,
      });
    }

    await supabaseRequest('/rest/v1/contractor_compliance_docs', {
      method: 'POST',
      body: {
        professional_id: professionalId,
        service_name: serviceName,
        insurance_doc_path: insurancePath,
        insurance_expires_on: doc.insuranceExpiresOn || null,
        license_doc_path: licensePath,
        license_expires_on: licWaived ? null : (doc.licenseExpiresOn || null),
        license_waived: licWaived,
        license_waiver_signature: licWaived ? (doc.licenseWaiverSignature || null) : null,
        license_waiver_ip: licWaived ? clientIp : null,
        license_waiver_at: licWaived ? new Date().toISOString() : null,
        last_notified_on: null,
      },
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
  }
};

const notifyOnContractorRegistration = async ({
  fullName,
  companyName,
  email,
  normalizedPhone,
  centerZip,
  specialtiesList,
}) => {
  const adminEmails = Array.from(new Set([
    getAdminNotificationEmail(),
    getSalesNotificationEmail(),
  ].filter((v) => isEmail(v))));

  const specialtyText = specialtiesList.join(', ');
  const portalUrl = `${getAppBaseUrl()}/contractor-portal.html`;

  const adminEmailHtml = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.45;color:#1f2d3d;">
      <h2 style="margin:0 0 12px;">New Contractor Registration</h2>
      <p style="margin:0 0 10px;">A new contractor account was submitted and is pending verification.</p>
      <ul>
        <li><strong>Name:</strong> ${fullName}</li>
        <li><strong>Company:</strong> ${companyName}</li>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Phone:</strong> ${normalizedPhone}</li>
        <li><strong>Service ZIP:</strong> ${centerZip}</li>
        <li><strong>Specialties:</strong> ${specialtyText}</li>
      </ul>
      <p><a href="${portalUrl}">Open Contractor Portal</a></p>
    </div>
  `;

  const contractorEmailHtml = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.45;color:#1f2d3d;">
      <h2 style="margin:0 0 12px;">Contractor Registration Received</h2>
      <p style="margin:0 0 10px;">Thanks for registering with Project Price. Your account is currently pending verification.</p>
      <p style="margin:0 0 10px;">Once approved, sign in here: <a href="${portalUrl}">${portalUrl}</a></p>
      <p style="margin:0;">If you have questions, reply to this email.</p>
    </div>
  `;

  const adminSms = [
    'Project Price: New contractor registration pending verification.',
    `${companyName} (${fullName})`,
    `ZIP ${centerZip} | ${specialtyText}`,
  ].join('\n');

  const contractorSms = [
    'Project Price: Your contractor registration was received.',
    'Status: Pending verification.',
    `Portal: ${portalUrl}`,
  ].join('\n');

  const result = {
    adminEmailsTargeted: adminEmails.length,
    adminEmailStatus: adminEmails.length ? [] : [{ status: 'skipped', reason: 'No admin/sales emails configured.' }],
    contractorEmailStatus: { status: 'skipped', reason: 'Contractor email missing or invalid.' },
    adminSmsStatus: { status: 'skipped', reason: 'ADMIN_PHONE_NUMBER missing or invalid.' },
    contractorSmsStatus: { status: 'skipped', reason: 'Contractor phone missing or invalid.' },
  };

  const emailTasks = adminEmails.map(async (adminEmail) => {
    try {
      const sent = await sendEmail({
        to: adminEmail,
        subject: `New contractor signup: ${companyName}`,
        html: adminEmailHtml,
      });
      return { to: adminEmail, status: sent.skipped ? 'skipped' : 'sent', reason: sent.reason || null };
    } catch (error) {
      return { to: adminEmail, status: 'error', reason: error instanceof Error ? error.message : 'Unknown email error.' };
    }
  });
  result.adminEmailStatus = await Promise.all(emailTasks);

  if (isEmail(email)) {
    try {
      const sent = await sendEmail({
        to: email,
        subject: 'Project Price contractor registration received',
        html: contractorEmailHtml,
      });
      result.contractorEmailStatus = { status: sent.skipped ? 'skipped' : 'sent', reason: sent.reason || null };
    } catch (error) {
      result.contractorEmailStatus = {
        status: 'error',
        reason: error instanceof Error ? error.message : 'Unknown contractor email error.',
      };
    }
  }

  const adminPhone = getAdminPhone();
  if (adminPhone) {
    try {
      const sent = await sendTwilioMessage(adminPhone, adminSms);
      result.adminSmsStatus = { status: sent.skipped ? 'skipped' : 'sent', reason: sent.reason || null, sid: sent.sid || null };
    } catch (error) {
      result.adminSmsStatus = { status: 'error', reason: error instanceof Error ? error.message : 'Unknown admin SMS error.' };
    }
  }

  if (normalizedPhone) {
    try {
      const sent = await sendTwilioMessage(normalizedPhone, contractorSms);
      result.contractorSmsStatus = { status: sent.skipped ? 'skipped' : 'sent', reason: sent.reason || null, sid: sent.sid || null };
    } catch (error) {
      result.contractorSmsStatus = { status: 'error', reason: error instanceof Error ? error.message : 'Unknown contractor SMS error.' };
    }
  }

  console.log('contractor-registration-notifications', JSON.stringify(result));
  return result;
};

const getRequestIp = (event) => {
  const headers = event?.headers || {};
  const forwarded = String(
    headers['x-forwarded-for']
    || headers['X-Forwarded-For']
    || headers['x-nf-client-connection-ip']
    || headers['X-Nf-Client-Connection-Ip']
    || ''
  ).trim();
  if (!forwarded) return null;
  return forwarded.split(',')[0].trim() || null;
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON.' });
  }

  const {
    email,
    password,
    fullName,
    companyName,
    phone,
    specialties,
    serviceZipCode,
    serviceZipCodes,
    serviceRadiusMiles,
    serviceRadiusKm,
    termsAccepted,
    accelerationClauseAccepted,
    twentyFourHourRuleAccepted,
    termsVersion,
    complianceDocs,
  } = payload;

  if (!email || !password || !fullName || !companyName || !phone) {
    return jsonResponse(400, { error: 'email, password, fullName, companyName, and phone are required.' });
  }

  if (String(password).length < 8) {
    return jsonResponse(400, { error: 'Password must be at least 8 characters.' });
  }

  if (termsAccepted !== true || accelerationClauseAccepted !== true || twentyFourHourRuleAccepted !== true) {
    return jsonResponse(400, {
      error: 'You must accept the contractor digital terms, acceleration clause, and 24-hour payment rule.',
    });
  }

  if (String(termsVersion || '').trim() !== CONTRACTOR_TERMS_VERSION) {
    return jsonResponse(400, {
      error: `Unsupported terms version. Expected ${CONTRACTOR_TERMS_VERSION}.`,
    });
  }

  const normalizedPhone = normalizePhone(String(phone));
  const centerZip = normalizeServiceZip(serviceZipCode || serviceZipCodes || '');
  if (!centerZip) {
    return jsonResponse(400, { error: 'A valid 5-digit service center zip code is required.' });
  }

  const specialtiesList = Array.isArray(specialties)
    ? specialties.map((s) => s.trim().toLowerCase()).filter(Boolean)
    : String(specialties || '').split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);

  if (specialtiesList.length === 0) return jsonResponse(400, { error: 'At least one specialty is required.' });

  const radiusMiles = parseFloat(serviceRadiusMiles);
  const radiusKmInput = parseFloat(serviceRadiusKm);
  const radius = Number.isFinite(radiusMiles) && radiusMiles > 0
    ? milesToKm(radiusMiles)
    : (Number.isFinite(radiusKmInput) && radiusKmInput > 0 ? radiusKmInput : milesToKm(30));

  try {
    const centerPoint = await geocodeUsZipCode(centerZip);
    const acceptedAt = new Date().toISOString();
    const acceptedIp = getRequestIp(event);

    // 1. Create auth user via Supabase Admin API
    const authData = await supabaseRequest('/auth/v1/admin/users', {
      method: 'POST',
      body: {
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role: 'professional' },
      },
    });

    const userId = authData?.id;
    if (!userId) throw new Error('Failed to create auth user.');

    // 2. Insert into public.profiles (required for projects FK)
    await supabaseRequest('/rest/v1/profiles', {
      method: 'POST',
      body: { id: userId, display_name: fullName },
      headers: { Prefer: 'return=minimal' },
    });

    // 3. Insert into public.users
    await supabaseRequest('/rest/v1/users', {
      method: 'POST',
      body: {
        id: userId,
        role: 'professional',
        full_name: fullName,
        phone: normalizedPhone,
      },
      headers: { Prefer: 'return=minimal' },
    });

    // 4. Insert into public.professionals (is_verified = false until admin approves)
    await supabaseRequest('/rest/v1/professionals', {
      method: 'POST',
      body: {
        user_id: userId,
        company_name: companyName,
        contact_phone: normalizedPhone,
        specialties: specialtiesList,
        service_zip_codes: [centerZip],
        service_radius_km: radius,
        ...(centerPoint && {
          service_center_lat: centerPoint.latitude,
          service_center_lng: centerPoint.longitude,
        }),
        is_verified: false,
        contractor_terms_version: CONTRACTOR_TERMS_VERSION,
        contractor_terms_accepted_at: acceptedAt,
        contractor_terms_accepted_ip: acceptedIp,
        contractor_terms_acceleration_acknowledged: true,
        contractor_terms_24h_rule_acknowledged: true,
      },
      headers: { Prefer: 'return=minimal' },
    });

    // 5. Get the new professional's id and save compliance docs
    const proRows = await supabaseRequest(
      `/rest/v1/professionals?user_id=eq.${userId}&select=id&limit=1`
    );
    const professionalId = proRows?.[0]?.id || null;
    if (professionalId && Array.isArray(complianceDocs) && complianceDocs.length > 0) {
      await saveComplianceDocs({ professionalId, complianceDocs, clientIp: acceptedIp });
    }

    const notificationStatus = await notifyOnContractorRegistration({
      fullName,
      companyName,
      email: String(email).trim().toLowerCase(),
      normalizedPhone,
      centerZip,
      specialtiesList,
    });

    const appBaseUrl = getAppBaseUrl();
    let checkoutUrl = null;
    try {
      checkoutUrl = await createStripeCheckoutSession({
        professionalId,
        email: String(email).trim().toLowerCase(),
        companyName,
        appBaseUrl,
      });
    } catch (stripeErr) {
      console.error('Stripe checkout creation failed:', stripeErr.message);
      // Non-fatal: account was created. Return error so user knows to contact support.
      return jsonResponse(201, {
        message: 'Account created but payment setup failed. Please contact support@projectprice.app to activate your subscription.',
        userId,
        stripeError: stripeErr.message,
        notifications: notificationStatus,
      });
    }

    return jsonResponse(201, {
      message: 'Account created. Redirecting to payment...',
      userId,
      checkoutUrl,
      notifications: notificationStatus,
    });
  } catch (err) {
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Unexpected error.' });
  }
};
