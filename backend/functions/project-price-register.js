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
  const digits = phone.replace(/\D/g, '');
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
  } = payload;

  if (!email || !password || !fullName || !companyName || !phone) {
    return jsonResponse(400, { error: 'email, password, fullName, companyName, and phone are required.' });
  }

  if (String(password).length < 8) {
    return jsonResponse(400, { error: 'Password must be at least 8 characters.' });
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
      },
      headers: { Prefer: 'return=minimal' },
    });

    return jsonResponse(201, {
      message: 'Registration submitted. Your account is pending verification. Once approved, sign in at https://project-price-app.netlify.app/contractor-portal.html to view accepted leads.',
      userId,
    });
  } catch (err) {
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Unexpected error.' });
  }
};
