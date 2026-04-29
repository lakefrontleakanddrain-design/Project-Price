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
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
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
  return users.find((user) => String(user?.email || '').trim().toLowerCase() === target) || null;
};

const ensureHomeownerProfile = async ({ userId, fullName, normalizedPhone, zipCode, streetAddress }) => {
  await supabaseRequest('/rest/v1/profiles', {
    method: 'POST',
    body: { id: userId, display_name: fullName },
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
  });

  await supabaseRequest('/rest/v1/users', {
    method: 'POST',
    body: {
      id: userId,
      role: 'homeowner',
      full_name: fullName,
      phone: normalizedPhone,
      zip_code: zipCode,
      street_address: streetAddress,
    },
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
  });

  const profilePatch = new URLSearchParams({ id: `eq.${userId}` });
  await supabaseRequest(`/rest/v1/profiles?${profilePatch.toString()}`, {
    method: 'PATCH',
    body: { display_name: fullName },
    headers: { Prefer: 'return=minimal' },
  });

  await supabaseRequest(`/rest/v1/users?${profilePatch.toString()}`, {
    method: 'PATCH',
    body: {
      full_name: fullName,
      phone: normalizedPhone,
      zip_code: zipCode,
      street_address: streetAddress,
    },
    headers: { Prefer: 'return=minimal' },
  });
};

const uploadProjectPhoto = async ({ projectId, imageBase64, mimeType, variant = 'original' }) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey || !projectId || !imageBase64) return null;

  const contentType = String(mimeType || 'image/jpeg').trim() || 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const safeVariant = String(variant || 'original').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'original';
  const path = `${projectId}/${safeVariant}-${Date.now()}.${ext}`;

  try {
    const buffer = Buffer.from(String(imageBase64), 'base64');
    const res = await fetch(`${supabaseUrl}/storage/v1/object/project-photos/${path}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: buffer,
    });
    if (!res.ok) return null;
    return `${supabaseUrl}/storage/v1/object/public/project-photos/${path}`;
  } catch {
    return null;
  }
};

const buildProjectDescription = ({ description, selectedTier, summary, allTiers }) => {
  const formattedTiers = Array.isArray(allTiers)
    ? allTiers
        .map((tier) => `${tier.name}: $${tier.rangeLow}-$${tier.rangeHigh}`)
        .join(' | ')
    : '';

  return [
    description,
    '',
    `Preferred tier: ${selectedTier.name}`,
    `Preferred range: $${selectedTier.rangeLow} - $${selectedTier.rangeHigh}`,
    summary ? `Estimate summary: ${summary}` : '',
    formattedTiers ? `All tiers: ${formattedTiers}` : '',
  ]
    .filter(Boolean)
    .join('\n');
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
    userId,
    fullName,
    email,
    phone,
    streetAddress,
    zipCode,
    password,
    description,
    summary,
    selectedTier,
    allTiers,
    imageBase64,
    mimeType,
    renderedImageBase64,
    renderedMimeType,
  } = payload;

  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPhone = normalizePhone(phone);
  const normalizedZip = String(zipCode || '').trim();
  const normalizedStreet = String(streetAddress || '').trim();

  if (!fullName || !normalizedEmail || !normalizedPhone || !normalizedStreet || !normalizedZip || !description) {
    return jsonResponse(400, {
      error: 'fullName, email, phone, streetAddress, zipCode, and description are required.',
    });
  }

  if (!/^\d{5}$/.test(normalizedZip)) {
    return jsonResponse(400, { error: 'zipCode must be a valid 5-digit zip code.' });
  }

  if (!selectedTier?.name || !selectedTier?.rangeLow || !selectedTier?.rangeHigh) {
    return jsonResponse(400, { error: 'selectedTier with name and range is required.' });
  }

  try {
    let homeownerId = String(userId || '').trim();
    const existingUser = await findAuthUserByEmail(normalizedEmail);

    if (existingUser) {
      if (homeownerId && homeownerId !== existingUser.id) {
        return jsonResponse(409, { error: 'Account mismatch. Please sign in again.' });
      }
      homeownerId = existingUser.id;
    } else {
      if (String(password || '').length < 8) {
        return jsonResponse(400, { error: 'Password must be at least 8 characters.' });
      }

      const authData = await supabaseRequest('/auth/v1/admin/users', {
        method: 'POST',
        body: {
          email: normalizedEmail,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, role: 'homeowner' },
        },
      });

      homeownerId = authData?.id;
      if (!homeownerId) throw new Error('Failed to create homeowner account.');
    }

    await ensureHomeownerProfile({
      userId: homeownerId,
      fullName,
      normalizedPhone,
      zipCode: normalizedZip,
      streetAddress: normalizedStreet,
    });

    const tierName = String(selectedTier.name).trim();
    const projectRows = await supabaseRequest('/rest/v1/projects', {
      method: 'POST',
      body: {
        owner_id: homeownerId,
        name: `${tierName} Saved Project`,
        project_type: 'general',
        zip_code: normalizedZip,
        description: buildProjectDescription({ description, selectedTier, summary, allTiers }),
        estimated_cost_range: `$${selectedTier.rangeLow} - $${selectedTier.rangeHigh}`,
      },
      headers: { Prefer: 'return=representation' },
    });

    const project = Array.isArray(projectRows) ? projectRows[0] : null;
    if (!project?.id) throw new Error('Failed to save project.');

    // Upload photos to Storage and store public URLs (non-fatal if uploads fail)
    if (imageBase64 && project.id) {
      const originalPhotoUrl = await uploadProjectPhoto({
        projectId: project.id,
        imageBase64: String(imageBase64),
        mimeType: String(mimeType || ''),
        variant: 'original',
      });
      const renderedPhotoUrl = renderedImageBase64
        ? await uploadProjectPhoto({
          projectId: project.id,
          imageBase64: String(renderedImageBase64),
          mimeType: String(renderedMimeType || ''),
          variant: 'rendered',
        })
        : null;

      if (originalPhotoUrl || renderedPhotoUrl) {
        const pq = new URLSearchParams({ id: `eq.${project.id}` });
        await supabaseRequest(`/rest/v1/projects?${pq.toString()}`, {
          method: 'PATCH',
          body: {
            ...(originalPhotoUrl ? { photo_url: originalPhotoUrl } : {}),
            ...(renderedPhotoUrl ? { rendered_photo_url: renderedPhotoUrl } : {}),
          },
          headers: { Prefer: 'return=minimal' },
        }).catch(() => { /* non-fatal */ });
      }
    }

    return jsonResponse(201, {
      message: 'Project saved to My Projects.',
      homeowner: {
        userId: homeownerId,
        fullName,
        email: normalizedEmail,
        phone: normalizedPhone,
        streetAddress: normalizedStreet,
        zipCode: normalizedZip,
      },
      project: {
        id: project.id,
        name: project.name,
        estimatedCostRange: project.estimated_cost_range,
        createdAt: project.created_at,
      },
    });
  } catch (error) {
    return jsonResponse(500, { error: error instanceof Error ? error.message : 'Unexpected error.' });
  }
};