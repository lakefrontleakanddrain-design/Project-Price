const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const env = () => ({
  supabaseUrl: process.env.SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

const LICENSE_REQUIRED_SERVICES = new Set([
  'roofing', 'plumbing', 'hvac', 'electrical',
  'painting', 'flooring', 'windows and doors', 'siding', 'landscaping',
]);

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

const normalizePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return phone || '';
};

const normalizeServiceZip = (raw) => {
  const first = String(raw || '')
    .split(/[\s,]+/)
    .map((z) => z.trim())
    .find((z) => /^\d{5}$/.test(z));
  return first || '';
};

const milesToKm = (miles) => Number(miles) * 1.60934;

const kmToMiles = (km) => {
  const value = Number(km);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value / 1.60934);
};

const normalizeServices = (raw) => {
  const arr = Array.isArray(raw) ? raw : String(raw || '').split(/[\s,]+/);
  return Array.from(new Set(arr.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)));
};

const getGoogleMapsApiKey = () => String(process.env.GOOGLE_MAPS_API_KEY || '').trim();

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

const ensureDocsTable = async () => {
  const q = new URLSearchParams({
    select: 'id',
    limit: '1',
  });
  try {
    await supabaseRequest(`/rest/v1/contractor_compliance_docs?${q.toString()}`);
    return true;
  } catch (err) {
    const msg = String(err?.message || '');
    if (msg.includes('42P01') || msg.includes('PGRST205')) return false;
    throw err;
  }
};

const ensureStorageBucket = async () => {
  const { supabaseUrl, serviceKey } = env();
  const bucket = 'contractor-docs';

  const getRes = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucket}`, {
    method: 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (getRes.ok) return bucket;

  await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: bucket, public: false }),
  });
  return bucket;
};

const uploadDataUrlDoc = async ({ professionalId, serviceName, kind, dataUrl, filename }) => {
  if (!dataUrl) return null;
  const { supabaseUrl, serviceKey } = env();
  const bucket = await ensureStorageBucket();

  const match = String(dataUrl).match(/^data:(.+);base64,(.+)$/);
  if (!match) throw new Error('Invalid file format.');
  const contentType = match[1] || 'application/octet-stream';
  const base64 = match[2] || '';
  const bytes = Buffer.from(base64, 'base64');

  const safeName = (filename || `${kind}.bin`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${professionalId}/${serviceName}/${kind}-${Date.now()}-${safeName}`;

  const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: bytes,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Failed to upload ${kind}: ${text}`);

  return `${bucket}/${path}`;
};

const getAuthUserById = async (userId) => {
  return supabaseRequest(`/auth/v1/admin/users/${userId}`);
};

const getProfessionalByUserId = async (userId) => {
  const q = new URLSearchParams({
    user_id: `eq.${userId}`,
    select: 'id,user_id,company_name,contact_phone,specialties,service_zip_codes,service_radius_km,is_verified,is_paused_by_contractor,is_denied,denied_reason',
    limit: '1',
  });

  try {
    const rows = await supabaseRequest(`/rest/v1/professionals?${q.toString()}`);
    const p = rows?.[0] || null;
    if (!p) return null;
    return {
      ...p,
      is_paused_by_contractor: !!p.is_paused_by_contractor,
      is_denied: !!p.is_denied,
    };
  } catch (err) {
    const msg = String(err?.message || '');
    if (!msg.includes('is_paused_by_contractor') && !msg.includes('is_denied')) throw err;
    const fallbackQ = new URLSearchParams({
      user_id: `eq.${userId}`,
      select: 'id,user_id,company_name,contact_phone,specialties,service_zip_codes,service_radius_km,is_verified',
      limit: '1',
    });
    const rows = await supabaseRequest(`/rest/v1/professionals?${fallbackQ.toString()}`);
    const p = rows?.[0] || null;
    if (!p) return null;
    return {
      ...p,
      is_paused_by_contractor: !p.is_verified,
      is_denied: false,
      denied_reason: null,
    };
  }
};

const getComplianceDocs = async (professionalId) => {
  const hasTable = await ensureDocsTable();
  if (!hasTable) return [];
  const q = new URLSearchParams({
    professional_id: `eq.${professionalId}`,
    select: 'id,service_name,insurance_doc_path,insurance_expires_on,license_doc_path,license_expires_on,last_notified_on,created_at,updated_at',
    order: 'service_name.asc',
  });
  return (await supabaseRequest(`/rest/v1/contractor_compliance_docs?${q.toString()}`)) || [];
};

const upsertComplianceDoc = async ({ professionalId, payload }) => {
  const hasTable = await ensureDocsTable();
  if (!hasTable) throw new Error('Run migration 20260424_contractor_compliance_docs.sql first.');

  const serviceName = String(payload.serviceName || '').trim().toLowerCase();
  if (!serviceName) throw new Error('serviceName is required.');

  const insuranceExpiresOn = payload.insuranceExpiresOn || null;
  const licenseExpiresOn = payload.licenseExpiresOn || null;

  let insurancePath = payload.insuranceDocPath || null;
  let licensePath = payload.licenseDocPath || null;

  if (payload.insuranceDocDataUrl) {
    insurancePath = await uploadDataUrlDoc({
      professionalId,
      serviceName,
      kind: 'insurance',
      dataUrl: payload.insuranceDocDataUrl,
      filename: payload.insuranceDocFileName,
    });
  }

  if (payload.licenseDocDataUrl) {
    licensePath = await uploadDataUrlDoc({
      professionalId,
      serviceName,
      kind: 'license',
      dataUrl: payload.licenseDocDataUrl,
      filename: payload.licenseDocFileName,
    });
  }

  const requiresLicense = LICENSE_REQUIRED_SERVICES.has(serviceName);
  const licenseWaived = payload.licenseWaived === true;
  if (requiresLicense && !licenseWaived && (!licensePath || !licenseExpiresOn)) {
    throw new Error(`License document and expiration date are required for ${serviceName}. If not required in your state, select the waiver option.`);
  }
  if (!insurancePath || !insuranceExpiresOn) {
    throw new Error('Insurance document and expiration date are required.');
  }

  await supabaseRequest('/rest/v1/contractor_compliance_docs', {
    method: 'POST',
    body: {
      professional_id: professionalId,
      service_name: serviceName,
      insurance_doc_path: insurancePath,
      insurance_expires_on: insuranceExpiresOn,
      license_doc_path: licenseWaived ? null : licensePath,
      license_expires_on: licenseWaived ? null : licenseExpiresOn,
      license_waived: licenseWaived,
      license_waiver_signature: licenseWaived ? (payload.licenseWaiverSignature || null) : null,
      license_waiver_ip: licenseWaived ? (payload.clientIp || null) : null,
      license_waiver_at: licenseWaived ? new Date().toISOString() : null,
      admin_cleared_at: null,
      admin_cleared_by: null,
      last_notified_on: null,
    },
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  });
};

const deleteComplianceDoc = async ({ professionalId, serviceName }) => {
  const hasTable = await ensureDocsTable();
  if (!hasTable) return;
  const q = new URLSearchParams({
    professional_id: `eq.${professionalId}`,
    service_name: `eq.${String(serviceName || '').trim().toLowerCase()}`,
  });
  await supabaseRequest(`/rest/v1/contractor_compliance_docs?${q.toString()}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
};

const maybeAutoPauseForCompliance = async (professional) => {
  const docs = await getComplianceDocs(professional.id);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const specialties = Array.isArray(professional.specialties)
    ? professional.specialties.map((s) => String(s).toLowerCase())
    : [];

  let shouldPause = false;

  for (const service of specialties) {
    const doc = docs.find((d) => String(d.service_name || '').toLowerCase() === service);
    if (!doc) {
      shouldPause = true;
      break;
    }

    const insuranceExp = doc.insurance_expires_on ? new Date(doc.insurance_expires_on) : null;
    if (!insuranceExp || Number.isNaN(insuranceExp.getTime()) || insuranceExp < today) {
      shouldPause = true;
      break;
    }

    if (LICENSE_REQUIRED_SERVICES.has(service) && !doc.license_waived) {
      const licenseExp = doc.license_expires_on ? new Date(doc.license_expires_on) : null;
      if (!doc.license_doc_path || !licenseExp || Number.isNaN(licenseExp.getTime()) || licenseExp < today) {
        shouldPause = true;
        break;
      }
    }
  }

  const q = new URLSearchParams({ id: `eq.${professional.id}` });
  if (!shouldPause) {
    // Auto-reactivate if currently paused due to compliance and all docs are now valid
    if (!professional.is_verified) {
      try {
        await supabaseRequest(`/rest/v1/professionals?${q.toString()}`, {
          method: 'PATCH',
          body: { is_verified: true, is_paused_by_contractor: false },
          headers: { Prefer: 'return=minimal' },
        });
      } catch {
        await supabaseRequest(`/rest/v1/professionals?${q.toString()}`, {
          method: 'PATCH',
          body: { is_verified: true },
          headers: { Prefer: 'return=minimal' },
        });
      }
    }
    return;
  }

  try {
    await supabaseRequest(`/rest/v1/professionals?${q.toString()}`, {
      method: 'PATCH',
      body: { is_verified: false, is_paused_by_contractor: true },
      headers: { Prefer: 'return=minimal' },
    });
  } catch {
    await supabaseRequest(`/rest/v1/professionals?${q.toString()}`, {
      method: 'PATCH',
      body: { is_verified: false },
      headers: { Prefer: 'return=minimal' },
    });
  }
};

const updateProfessional = async ({ professional, payload }) => {
  const patch = {};
  if (payload.phone) patch.contact_phone = normalizePhone(payload.phone);
  if (payload.services) patch.specialties = normalizeServices(payload.services);
  const centerZip = normalizeServiceZip(payload.serviceZipCode || payload.zipCodes || '');
  if (centerZip) {
    patch.service_zip_codes = [centerZip];
    const centerPoint = await geocodeUsZipCode(centerZip);
    if (centerPoint) {
      patch.service_center_lat = centerPoint.latitude;
      patch.service_center_lng = centerPoint.longitude;
    }
  }

  if (payload.serviceRadiusMiles !== undefined && payload.serviceRadiusMiles !== null && payload.serviceRadiusMiles !== '') {
    const radiusMiles = Number(payload.serviceRadiusMiles);
    if (!Number.isFinite(radiusMiles) || radiusMiles <= 0) throw new Error('serviceRadiusMiles must be a positive number.');
    patch.service_radius_km = milesToKm(radiusMiles);
  } else if (payload.serviceRadiusKm !== undefined && payload.serviceRadiusKm !== null && payload.serviceRadiusKm !== '') {
    const radius = Number(payload.serviceRadiusKm);
    if (!Number.isFinite(radius) || radius <= 0) throw new Error('serviceRadiusKm must be a positive number.');
    patch.service_radius_km = radius;
  }

  if (Object.keys(patch).length > 0) {
    const q = new URLSearchParams({ id: `eq.${professional.id}` });
    await supabaseRequest(`/rest/v1/professionals?${q.toString()}`, {
      method: 'PATCH',
      body: patch,
      headers: { Prefer: 'return=minimal' },
    });
  }

  if (payload.phone) {
    const uq = new URLSearchParams({ id: `eq.${professional.user_id}` });
    await supabaseRequest(`/rest/v1/users?${uq.toString()}`, {
      method: 'PATCH',
      body: { phone: normalizePhone(payload.phone) },
      headers: { Prefer: 'return=minimal' },
    });
  }

  if (typeof payload.pauseService === 'boolean') {
    const q = new URLSearchParams({ id: `eq.${professional.id}` });
    if (payload.pauseService) {
      try {
        await supabaseRequest(`/rest/v1/professionals?${q.toString()}`, {
          method: 'PATCH',
          body: { is_verified: false, is_paused_by_contractor: true },
          headers: { Prefer: 'return=minimal' },
        });
      } catch {
        await supabaseRequest(`/rest/v1/professionals?${q.toString()}`, {
          method: 'PATCH',
          body: { is_verified: false },
          headers: { Prefer: 'return=minimal' },
        });
      }
    } else {
      try {
        await supabaseRequest(`/rest/v1/professionals?${q.toString()}`, {
          method: 'PATCH',
          body: { is_verified: true, is_paused_by_contractor: false },
          headers: { Prefer: 'return=minimal' },
        });
      } catch {
        await supabaseRequest(`/rest/v1/professionals?${q.toString()}`, {
          method: 'PATCH',
          body: { is_verified: true },
          headers: { Prefer: 'return=minimal' },
        });
      }
    }
  }
};

const changeAuthEmail = async (userId, newEmail) => {
  const safeEmail = String(newEmail || '').trim().toLowerCase();
  if (!safeEmail) throw new Error('newEmail is required.');
  return supabaseRequest(`/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    body: { email: safeEmail, email_confirm: true },
  });
};

const changeAuthPassword = async (userId, newPassword) => {
  const pwd = String(newPassword || '');
  if (pwd.length < 8) throw new Error('newPassword must be at least 8 characters.');
  return supabaseRequest(`/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    body: { password: pwd },
  });
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
  const action = String(payload.action || '').trim();

  if (!email || !password || !action) {
    return jsonResponse(400, { error: 'email, password, and action are required.' });
  }

  try {
    const authData = await signInContractor(email, password);
    const user = authData?.user;
    const userId = user?.id;
    if (!userId) return jsonResponse(401, { error: 'Invalid email or password.' });

    const professional = await getProfessionalByUserId(userId);
    if (!professional) return jsonResponse(403, { error: 'This account is not a contractor account.' });

    if (action === 'get_profile') {
      await maybeAutoPauseForCompliance(professional);
      const refreshed = await getProfessionalByUserId(userId);
      const docs = await getComplianceDocs(refreshed.id);
      const authUser = await getAuthUserById(userId);
      return jsonResponse(200, {
        profile: {
          professionalId: refreshed.id,
          userId,
          companyName: refreshed.company_name,
          phone: refreshed.contact_phone,
          email: authUser?.email || user?.email || email,
          services: refreshed.specialties || [],
          zipCodes: refreshed.service_zip_codes || [],
          serviceZipCode: refreshed.service_zip_codes?.[0] || null,
          serviceRadiusKm: refreshed.service_radius_km || 40,
          serviceRadiusMiles: kmToMiles(refreshed.service_radius_km || 40),
          isVerified: !!refreshed.is_verified,
          isPausedByContractor: !!refreshed.is_paused_by_contractor,
          isDenied: !!refreshed.is_denied,
          deniedReason: refreshed.denied_reason || null,
        },
        complianceDocs: docs,
        licenseRequiredServices: Array.from(LICENSE_REQUIRED_SERVICES),
      });
    }

    if (action === 'update_profile') {
      await updateProfessional({ professional, payload });
      await maybeAutoPauseForCompliance(await getProfessionalByUserId(userId));
      return jsonResponse(200, { message: 'Profile updated.' });
    }

    if (action === 'change_email') {
      await changeAuthEmail(userId, payload.newEmail);
      return jsonResponse(200, { message: 'Email updated.' });
    }

    if (action === 'change_password') {
      await changeAuthPassword(userId, payload.newPassword);
      return jsonResponse(200, { message: 'Password updated.' });
    }

    if (action === 'upsert_compliance_doc') {
      await upsertComplianceDoc({ professionalId: professional.id, payload });
      await maybeAutoPauseForCompliance(await getProfessionalByUserId(userId));
      return jsonResponse(200, { message: 'Compliance documents updated.' });
    }

    if (action === 'delete_compliance_doc') {
      await deleteComplianceDoc({ professionalId: professional.id, serviceName: payload.serviceName });
      await maybeAutoPauseForCompliance(await getProfessionalByUserId(userId));
      return jsonResponse(200, { message: 'Compliance document removed.' });
    }

    return jsonResponse(400, { error: `Unsupported action: ${action}` });
  } catch (err) {
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Unexpected error.' });
  }
};
