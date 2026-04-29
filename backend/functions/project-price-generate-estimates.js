const responseHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: responseHeaders,
  body: JSON.stringify(body),
});

const env = () => ({
  supabaseUrl: process.env.SUPABASE_URL || '',
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
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
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const DEFAULT_MARKET_PROFILE = {
  marketCode: 'national_default',
  marketName: 'National baseline',
  region: 'national',
  laborCostIndex: 1.0,
  materialCostIndex: 1.0,
  permitComplexity: 3,
  codeComplexity: 3,
  accessComplexity: 3,
  weatherComplexity: 3,
  pricingNotes: 'Use balanced national planning assumptions for labor, materials, and permitting.',
};

const REGIONAL_MARKET_PROFILES = {
  northeast: {
    marketCode: 'regional_northeast',
    marketName: 'Northeast regional market',
    region: 'northeast',
    laborCostIndex: 1.18,
    materialCostIndex: 1.08,
    permitComplexity: 4,
    codeComplexity: 4,
    accessComplexity: 3,
    weatherComplexity: 4,
    pricingNotes: 'Expect higher labor cost, stricter code enforcement, and weather-driven seasonality.',
  },
  southeast: {
    marketCode: 'regional_southeast',
    marketName: 'Southeast regional market',
    region: 'southeast',
    laborCostIndex: 0.98,
    materialCostIndex: 0.97,
    permitComplexity: 3,
    codeComplexity: 3,
    accessComplexity: 3,
    weatherComplexity: 3,
    pricingNotes: 'Use moderate labor and permit assumptions with heat and storm resilience where relevant.',
  },
  midwest: {
    marketCode: 'regional_midwest',
    marketName: 'Midwest regional market',
    region: 'midwest',
    laborCostIndex: 1.0,
    materialCostIndex: 0.99,
    permitComplexity: 3,
    codeComplexity: 3,
    accessComplexity: 2,
    weatherComplexity: 4,
    pricingNotes: 'Use balanced labor with weather and seasonal construction impacts.',
  },
  south_central: {
    marketCode: 'regional_south_central',
    marketName: 'South Central regional market',
    region: 'south_central',
    laborCostIndex: 0.96,
    materialCostIndex: 0.98,
    permitComplexity: 3,
    codeComplexity: 3,
    accessComplexity: 2,
    weatherComplexity: 3,
    pricingNotes: 'Use moderate pricing with localized weather, expansion, and suburban access assumptions.',
  },
  mountain: {
    marketCode: 'regional_mountain',
    marketName: 'Mountain regional market',
    region: 'mountain',
    laborCostIndex: 1.04,
    materialCostIndex: 1.02,
    permitComplexity: 3,
    codeComplexity: 3,
    accessComplexity: 4,
    weatherComplexity: 4,
    pricingNotes: 'Account for elevation, access, and weather effects on scheduling and delivery.',
  },
  southwest: {
    marketCode: 'regional_southwest',
    marketName: 'Southwest regional market',
    region: 'southwest',
    laborCostIndex: 1.03,
    materialCostIndex: 1.01,
    permitComplexity: 3,
    codeComplexity: 3,
    accessComplexity: 3,
    weatherComplexity: 2,
    pricingNotes: 'Use moderate-high labor assumptions with heat and utility upgrade considerations.',
  },
  west_coast: {
    marketCode: 'regional_west_coast',
    marketName: 'West Coast regional market',
    region: 'west_coast',
    laborCostIndex: 1.28,
    materialCostIndex: 1.16,
    permitComplexity: 5,
    codeComplexity: 5,
    accessComplexity: 4,
    weatherComplexity: 2,
    pricingNotes: 'Expect premium labor, stronger code requirements, and more expensive permitting in major coastal markets.',
  },
};

const regionForZipCode = (zipCode) => {
  const zip = String(zipCode || '').trim();
  if (!/^\d{5}$/.test(zip)) return DEFAULT_MARKET_PROFILE.region;

  const firstDigit = Number(zip[0]);
  if (firstDigit <= 1) return 'northeast';
  if (firstDigit <= 3) return 'southeast';
  if (firstDigit <= 5) return 'midwest';
  if (firstDigit === 6) return 'south_central';
  if (firstDigit === 7) return 'mountain';
  if (firstDigit === 8) return 'southwest';
  return 'west_coast';
};

const normalizeMarketProfile = (profile, overrides = {}) => {
  const source = profile || DEFAULT_MARKET_PROFILE;
  return {
    marketCode: String(overrides.marketCode || source.marketCode || DEFAULT_MARKET_PROFILE.marketCode),
    marketName: String(overrides.marketName || source.marketName || DEFAULT_MARKET_PROFILE.marketName),
    region: String(overrides.region || source.region || DEFAULT_MARKET_PROFILE.region),
    city: overrides.city ? String(overrides.city) : null,
    stateCode: overrides.stateCode ? String(overrides.stateCode) : null,
    laborCostIndex: clamp(Number(source.laborCostIndex ?? source.labor_cost_index ?? 1), 0.75, 1.6),
    materialCostIndex: clamp(Number(source.materialCostIndex ?? source.material_cost_index ?? 1), 0.8, 1.5),
    permitComplexity: clamp(Number(source.permitComplexity ?? source.permit_complexity ?? 3), 1, 5),
    codeComplexity: clamp(Number(source.codeComplexity ?? source.code_complexity ?? 3), 1, 5),
    accessComplexity: clamp(Number(source.accessComplexity ?? source.access_complexity ?? 3), 1, 5),
    weatherComplexity: clamp(Number(source.weatherComplexity ?? source.weather_complexity ?? 3), 1, 5),
    pricingNotes: String(source.pricingNotes ?? source.pricing_notes ?? DEFAULT_MARKET_PROFILE.pricingNotes),
  };
};

const buildRegionalFallbackProfile = (zipCode) => {
  const region = regionForZipCode(zipCode);
  return normalizeMarketProfile(REGIONAL_MARKET_PROFILES[region] || DEFAULT_MARKET_PROFILE);
};

const loadMarketContext = async (zipCode) => {
  const zip = String(zipCode || '').trim();
  const zipPrefix = /^\d{5}$/.test(zip) ? zip.slice(0, 3) : '';
  const regionalFallback = buildRegionalFallbackProfile(zip);

  if (!zipPrefix) return regionalFallback;

  try {
    const lookupRows = await supabaseRequest(`/rest/v1/zip_market_lookup?zip_prefix=eq.${zipPrefix}&select=zip_prefix,market_code,city,state_code&limit=1`);
    const lookup = Array.isArray(lookupRows) ? lookupRows[0] : null;
    if (!lookup?.market_code) return regionalFallback;

    const profileRows = await supabaseRequest(`/rest/v1/pricing_market_profiles?market_code=eq.${encodeURIComponent(lookup.market_code)}&select=market_code,market_name,region,labor_cost_index,material_cost_index,permit_complexity,code_complexity,access_complexity,weather_complexity,pricing_notes&limit=1`);
    const profile = Array.isArray(profileRows) ? profileRows[0] : null;
    if (!profile) {
      return normalizeMarketProfile(regionalFallback, {
        marketCode: String(lookup.market_code),
        marketName: String(lookup.city || regionalFallback.marketName),
        city: lookup.city || null,
        stateCode: lookup.state_code || null,
      });
    }

    return normalizeMarketProfile(profile, {
      marketCode: profile.market_code,
      marketName: profile.market_name,
      city: lookup.city || null,
      stateCode: lookup.state_code || null,
    });
  } catch {
    return regionalFallback;
  }
};

const hashText = (text) => {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (h * 31 + text.charCodeAt(i)) >>> 0;
  }
  return h;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const uniqueValues = (values) => {
  const seen = new Set();
  return values.filter((value) => {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
};

const zipCostFactor = (zipCode) => {
  const zip = String(zipCode || '').trim();
  if (!/^\d{5}$/.test(zip)) return 1.0;

  const prefix = Number(zip.slice(0, 3));
  const normalized = clamp(prefix, 1, 999) / 999;
  // Keep bounded so fallback tiers stay realistic.
  return 0.88 + normalized * 0.28;
};

const marketCostFactor = (zipCode, marketContext) => {
  const zipFactor = zipCostFactor(zipCode);
  const labor = Number(marketContext?.laborCostIndex || 1);
  const materials = Number(marketContext?.materialCostIndex || 1);
  const complexityScore = (
    Number(marketContext?.permitComplexity || 3)
    + Number(marketContext?.codeComplexity || 3)
    + Number(marketContext?.accessComplexity || 3)
    + Number(marketContext?.weatherComplexity || 3)
  ) / 4;
  const complexityFactor = 0.9 + (clamp(complexityScore, 1, 5) - 1) * 0.06;
  return clamp(zipFactor * ((labor + materials) / 2) * complexityFactor, 0.75, 1.85);
};

const buildFallbackEstimates = (description, zipCode, marketContext = DEFAULT_MARKET_PROFILE) => {
  const seed = hashText(`${String(description || '').trim().toLowerCase()}|${String(zipCode || '').trim()}`);
  const base = 850 + (seed % 1200);
  const spread = 320 + (seed % 550);
  const locationFactor = marketCostFactor(zipCode, marketContext);

  const mkRange = (multiplier, extraSpread) => {
    const low = Math.round(base * multiplier * locationFactor);
    const high = Math.round(low + spread * extraSpread * locationFactor);
    return { low, high };
  };

  const basic = mkRange(1.0, 1.0);
  const standard = mkRange(1.45, 1.25);
  const premium = mkRange(2.05, 1.6);

  return {
    summary: `Estimated from project description and ${marketContext.marketName} market context while AI image analysis is temporarily unavailable.`,
    tiers: [
      {
        name: 'Basic',
        rangeLow: basic.low,
        rangeHigh: basic.high,
        rationale: 'Budget-first scope with essential materials and standard labor.',
      },
      {
        name: 'Standard',
        rangeLow: standard.low,
        rangeHigh: standard.high,
        rationale: 'Balanced scope and durability with higher quality fixtures and workmanship.',
      },
      {
        name: 'Premium',
        rangeLow: premium.low,
        rangeHigh: premium.high,
        rationale: 'Top-tier materials, upgrades, and craftsmanship with extended finish work.',
      },
    ],
    source: 'fallback',
  };
};

const estimationPrompt = (description, zipCode, marketContext) => `You are a renovation and home-services estimator.

Use the user description and the image (if provided) to produce three homeowner-facing cost tiers in USD.
Use the structured market profile below as the pricing anchor and the zip code as geographic context.
- Do not browse or reference random public-web pricing sources.
- Keep the estimate appropriate for the referenced market profile.
- Explain why Basic, Standard, and Premium differ based on finish level, scope, and market conditions.
- Return STRICT JSON only. No markdown.
- Keep output grounded and realistic for U.S. metro pricing.
- Include exactly three tiers named Basic, Standard, Premium.
- Each tier must include numeric rangeLow and rangeHigh integers.
- Ensure rangeLow < rangeHigh.

Required JSON shape:
{
  "summary": "short summary",
  "tiers": [
    {"name":"Basic","rangeLow":1000,"rangeHigh":1500,"rationale":"..."},
    {"name":"Standard","rangeLow":1800,"rangeHigh":2600,"rationale":"..."},
    {"name":"Premium","rangeLow":2800,"rangeHigh":4200,"rationale":"..."}
  ]
}

Market profile:
- Market name: ${marketContext.marketName}
- Region: ${marketContext.region}
- City: ${marketContext.city || 'regional default'}
- State: ${marketContext.stateCode || 'N/A'}
- Labor cost index: ${marketContext.laborCostIndex}
- Material cost index: ${marketContext.materialCostIndex}
- Permit complexity (1-5): ${marketContext.permitComplexity}
- Code complexity (1-5): ${marketContext.codeComplexity}
- Access complexity (1-5): ${marketContext.accessComplexity}
- Weather complexity (1-5): ${marketContext.weatherComplexity}
- Pricing notes: ${marketContext.pricingNotes}

Zip code:
${zipCode}

Project description:
${description}`;

const extractJsonFromText = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    // continue
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // continue
    }
  }

  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const snippet = raw.slice(first, last + 1);
    try {
      return JSON.parse(snippet);
    } catch {
      return null;
    }
  }

  return null;
};

const normalizeTier = (tier, fallbackName) => {
  const name = String(tier?.name || fallbackName || '').trim();
  const low = Number(tier?.rangeLow);
  const high = Number(tier?.rangeHigh);
  const normalizedLow = Number.isFinite(low) ? Math.round(low) : 0;
  const normalizedHigh = Number.isFinite(high) ? Math.round(high) : normalizedLow + 500;

  return {
    name,
    rangeLow: clamp(Math.min(normalizedLow, normalizedHigh - 1), 100, 1000000),
    rangeHigh: clamp(Math.max(normalizedHigh, normalizedLow + 1), 150, 1500000),
    rationale: String(tier?.rationale || '').trim() || 'Estimated based on scope, labor, and materials.',
  };
};

const normalizeGeminiResponse = (payload) => {
  const tiers = Array.isArray(payload?.tiers) ? payload.tiers : [];
  const byName = new Map();
  for (const t of tiers) {
    const key = String(t?.name || '').trim().toLowerCase();
    if (key) byName.set(key, t);
  }

  const normalized = [
    normalizeTier(byName.get('basic'), 'Basic'),
    normalizeTier(byName.get('standard'), 'Standard'),
    normalizeTier(byName.get('premium'), 'Premium'),
  ];

  return {
    summary: String(payload?.summary || '').trim() || 'AI-generated estimate ranges from your project details.',
    tiers: normalized,
    source: 'gemini',
  };
};

const previewImagePrompt = ({ description, zipCode, tierName }) => `You are creating a realistic renovation preview image.

Task:
- Use the provided homeowner photo as the base scene.
- Keep perspective, room geometry, and all untouched areas consistent.
- Replace or repair only the relevant target item from the project description.
- For tier "${tierName}", reflect the appropriate finish/material quality.

Tier guidance:
- Basic: budget-friendly, clean, functional replacement.
- Standard: mid-grade, durable, visually balanced upgrade.
- Premium: high-end, premium finish and fixture quality.

Project context:
- Zip code: ${zipCode}
- Description: ${description}

Output requirements:
- Return only one edited image.
- No text, labels, watermarks, or split views.
- Preserve photorealism.`;

const generateTierPreviewImage = async ({
  apiKey,
  description,
  zipCode,
  tierName,
  imageBase64,
  mimeType,
  timeoutMs,
}) => {
  const configuredImageModel = String(process.env.GEMINI_IMAGE_MODEL || '').trim();
  const modelCandidates = uniqueValues([
    configuredImageModel,
    'gemini-2.5-flash-image',
    'gemini-3.1-flash-image-preview',
    'gemini-3-pro-image-preview',
  ]);

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: previewImagePrompt({ description, zipCode, tierName }) },
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseModalities: ['TEXT', 'IMAGE'],
    },
  };

  let lastError = null;
  for (const model of modelCandidates) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutHandle = controller
      ? setTimeout(() => controller.abort(new Error(`Preview generation timed out for ${tierName}.`)), timeoutMs || 20000)
      : null;

    let res;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller?.signal,
        },
      );
    } catch (error) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }

    if (timeoutHandle) clearTimeout(timeoutHandle);

    const raw = await res.text();
    if (!res.ok) {
      lastError = new Error(`Gemini image API error (${model}) ${res.status}: ${raw}`);
      if (res.status === 404) {
        // If a custom model is configured and missing, try fallback model.
        if (configuredImageModel && model === configuredImageModel) {
          continue;
        }
        // Default model missing support: stop quickly and fall back to overlay UX.
        throw new Error(`Gemini image model unavailable (${model}).`);
      }
      throw lastError;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`Gemini image response parse failed (${model}).`);
    }

    const parts = data?.candidates?.[0]?.content?.parts;
    const imagePart = Array.isArray(parts)
      ? [...parts]
          .reverse()
          .find((p) => p?.inlineData?.data && p?.thought !== true)
      : null;
    if (imagePart?.inlineData?.data) {
      return {
        imageBase64: String(imagePart.inlineData.data),
        mimeType: String(imagePart.inlineData.mimeType || 'image/png'),
        model,
      };
    }

    lastError = new Error(`No image part returned for ${tierName} (${model}).`);
  }

  throw lastError || new Error(`No image model candidates succeeded for ${tierName}.`);
};

const buildTierPreviewImages = async ({ apiKey, description, zipCode, imageBase64, mimeType }) => {
  if (!apiKey || !imageBase64) {
    return {
      images: null,
      diagnostics: [{ stage: 'skipped', reason: 'missing_api_key_or_image' }],
    };
  }

  // Only generate AI preview for Premium; Basic and Standard use the fallback overlay.
  const tiers = ['Premium'];
  const previewEntries = [];
  for (const tierName of tiers) {
    previewEntries.push(
      await Promise.resolve().then(async () => {
        try {
          const generated = await generateTierPreviewImage({
            apiKey,
            description,
            zipCode,
            tierName,
            imageBase64,
            mimeType,
            timeoutMs: 20000,
          });
          return { status: 'fulfilled', value: [tierName.toLowerCase(), generated] };
        } catch (err) {
          return { status: 'rejected', reason: err };
        }
      }),
    );
  }

  const previewImages = Object.fromEntries(
    previewEntries
      .filter((entry) => entry.status === 'fulfilled' && Array.isArray(entry.value))
      .map((entry) => entry.value),
  );

  const diagnostics = previewEntries
    .map((entry, index) => {
      const tierName = tiers[index];
      if (entry.status === 'fulfilled') {
        const [, generated] = entry.value;
        return {
          tier: tierName,
          ok: true,
          model: generated?.model || null,
        };
      }

      return {
        tier: tierName,
        ok: false,
        error: entry.reason instanceof Error ? entry.reason.message : String(entry.reason || 'unknown_preview_error'),
      };
    });

  return {
    images: Object.keys(previewImages).length > 0 ? previewImages : null,
    diagnostics,
  };
};

const generateWithGemini = async ({ apiKey, description, zipCode, imageBase64, mimeType, marketContext }) => {
  const parts = [{ text: estimationPrompt(description, zipCode, marketContext) }];

  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: mimeType || 'image/jpeg',
        data: imageBase64,
      },
    });
  }

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.25,
      responseMimeType: 'application/json',
    },
  };

  const configuredModel = String(process.env.GEMINI_MODEL || '').trim();
  const modelCandidates = [
    configuredModel,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
  ].filter(Boolean);

  let lastError = null;

  // Some accounts/projects do not have every model alias enabled. Try a few known-good options.
  for (const model of modelCandidates) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    const raw = await res.text();
    if (!res.ok) {
      lastError = new Error(`Gemini API error (${model}) ${res.status}: ${raw}`);
      if (res.status === 404) {
        continue;
      }
      throw lastError;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`Gemini returned non-JSON response payload (${model}).`);
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((p) => (typeof p?.text === 'string' ? p.text : ''))
      .join('\n')
      .trim();

    const parsed = extractJsonFromText(text);
    if (!parsed) {
      throw new Error(`Unable to parse Gemini JSON estimate payload (${model}).`);
    }

    const normalized = normalizeGeminiResponse(parsed);
    return {
      ...normalized,
      model,
    };
  }

  throw lastError || new Error('No Gemini model candidates succeeded.');
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, { ok: true });
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  // Shared-secret guard: reject requests that do not supply the correct token.
  // Set APP_API_SECRET in Netlify environment variables. If not set, auth is skipped
  // so existing deployments don't break before the env var is added.
  const appSecret = String(process.env.APP_API_SECRET || '').trim();
  if (appSecret) {
    const requestToken = String(event.headers?.['x-app-token'] || '').trim();
    if (requestToken !== appSecret) {
      return jsonResponse(401, { error: 'Unauthorized.' });
    }
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  const description = String(body?.description || '').trim();
  const zipCode = String(body?.zipCode || '').trim();
  const imageBase64 = String(body?.imageBase64 || '').trim();
  const mimeType = String(body?.mimeType || '').trim() || 'image/jpeg';
  const debugPreviews =
    body?.debugPreviews === true ||
    body?.debugPreviews === 1 ||
    String(body?.debugPreviews || '').trim().toLowerCase() === 'true';

  if (!description) {
    return jsonResponse(400, { error: 'description is required.' });
  }

  if (!/^\d{5}$/.test(zipCode)) {
    return jsonResponse(400, { error: 'zipCode must be a 5-digit US zip code.' });
  }

  // Guardrail for payload size to avoid accidental huge uploads.
  if (imageBase64 && imageBase64.length > 3_500_000) {
    return jsonResponse(413, { error: 'Image is too large. Please choose a smaller photo.' });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const marketContext = await loadMarketContext(zipCode);

  // Generate text estimates and preview image independently so a text failure
  // does NOT trigger a second image API call in the catch block.
  let estimates;
  let estimateError = null;
  try {
    estimates = apiKey
      ? await generateWithGemini({ apiKey, description, zipCode, imageBase64, mimeType, marketContext })
      : buildFallbackEstimates(description, zipCode, marketContext);
  } catch (error) {
    estimateError = error;
    estimates = buildFallbackEstimates(description, zipCode, marketContext);
  }

  // Image generation runs exactly once regardless of whether text estimation succeeded.
  const previewResult = await buildTierPreviewImages({
    apiKey,
    description,
    zipCode,
    imageBase64,
    mimeType,
  });

  const premiumDiagnostic = Array.isArray(previewResult.diagnostics)
    ? previewResult.diagnostics.find((d) => String(d?.tier || '').toLowerCase() === 'premium') || null
    : null;

  console.log(
    '[project-price-generate-estimates] preview',
    JSON.stringify({
      hasPremiumImage: !!previewResult?.images?.premium,
      premiumDiagnostic,
      estimateFallback: !!estimateError,
    }),
  );

  return jsonResponse(200, {
    ...estimates,
    marketContext,
    tierPreviewImages: previewResult.images,
    ...(estimateError ? { warning: estimateError instanceof Error ? estimateError.message : 'Estimate service fallback was used.' } : {}),
    ...(debugPreviews ? { previewDiagnostics: previewResult.diagnostics } : {}),
  });
};
