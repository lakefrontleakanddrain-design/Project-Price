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

const buildFallbackEstimates = (description, zipCode) => {
  const seed = hashText(`${String(description || '').trim().toLowerCase()}|${String(zipCode || '').trim()}`);
  const base = 850 + (seed % 1200);
  const spread = 320 + (seed % 550);
  const locationFactor = zipCostFactor(zipCode);

  const mkRange = (multiplier, extraSpread) => {
    const low = Math.round(base * multiplier * locationFactor);
    const high = Math.round(low + spread * extraSpread * locationFactor);
    return { low, high };
  };

  const basic = mkRange(1.0, 1.0);
  const standard = mkRange(1.45, 1.25);
  const premium = mkRange(2.05, 1.6);

  return {
    summary: 'Estimated from project description and zip-code market context while AI image analysis is temporarily unavailable.',
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

const estimationPrompt = (description, zipCode) => `You are a renovation and home-services estimator.

Use the user description and the image (if provided) to produce three homeowner-facing cost tiers in USD.
Use the zip code as local market context for labor/material pricing.
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

const generateWithGemini = async ({ apiKey, description, zipCode, imageBase64, mimeType }) => {
  const parts = [{ text: estimationPrompt(description, zipCode) }];

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

  // Generate text estimates and preview image independently so a text failure
  // does NOT trigger a second image API call in the catch block.
  let estimates;
  let estimateError = null;
  try {
    estimates = apiKey
      ? await generateWithGemini({ apiKey, description, zipCode, imageBase64, mimeType })
      : buildFallbackEstimates(description, zipCode);
  } catch (error) {
    estimateError = error;
    estimates = buildFallbackEstimates(description, zipCode);
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
    tierPreviewImages: previewResult.images,
    ...(estimateError ? { warning: estimateError instanceof Error ? estimateError.message : 'Estimate service fallback was used.' } : {}),
    ...(debugPreviews ? { previewDiagnostics: previewResult.diagnostics } : {}),
  });
};
