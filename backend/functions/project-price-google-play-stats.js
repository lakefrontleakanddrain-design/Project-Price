/**
 * project-price-google-play-stats
 *
 * Returns Google Play install data aggregated by month and country,
 * using the Google Play Developer Reporting API.
 *
 * Required Netlify environment variables:
 *   GOOGLE_PLAY_CLIENT_EMAIL          — client_email field from the service account JSON.
 *   GOOGLE_PLAY_PACKAGE_NAME          — e.g. com.projectpriceapp.mobile
 *   ADMIN_DASHBOARD_KEY               — Same key used by the admin panel.
 *   SUPABASE_URL                      — Already present site-wide.
 *   SUPABASE_SERVICE_ROLE_KEY         — Already present site-wide.
 *
 * GOOGLE_PLAY_PRIVATE_KEY is intentionally NOT stored as a Netlify env var
 * (the RSA key is ~1.7 KB and pushes the total over AWS Lambda's 4 KB limit).
 * Instead it is stored in the Supabase `app_secrets` table under key
 * 'GOOGLE_PLAY_PRIVATE_KEY' and fetched at runtime via the service-role key.
 */

'use strict';

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Google OAuth2 — service account JWT → access token
// ---------------------------------------------------------------------------

const createGoogleJWT = (serviceAccount) => {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/playdeveloperreporting',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign('SHA256');
  sign.update(signingInput);
  const signature = sign.sign(serviceAccount.private_key).toString('base64url');
  return `${signingInput}.${signature}`;
};

const getAccessToken = async (serviceAccount) => {
  const jwt = createGoogleJWT(serviceAccount);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth token error ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.access_token;
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const LAUNCH_MONTH = '2025-09'; // first month the app was on Google Play

const getMonthsSince = (startYYYYMM) => {
  const months = [];
  const [sy, sm] = startYYYYMM.split('-').map(Number);
  const now = new Date();
  // last complete calendar month
  const lastComplete = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const cur = new Date(Date.UTC(sy, sm - 1, 1));
  while (cur <= lastComplete) {
    months.push({
      year: cur.getUTCFullYear(),
      month: cur.getUTCMonth() + 1,
      label: cur.toISOString().slice(0, 7),
    });
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return months;
};

// ---------------------------------------------------------------------------
// Reporting API fetch — storePerformanceSummaryMetricSet
// ---------------------------------------------------------------------------

const fetchPlayStats = async (accessToken, packageName) => {
  const months = getMonthsSince(LAUNCH_MONTH);
  if (!months.length) return { byMonth: [], byCountry: [], lifetimeTotal: 0 };

  const startM = months[0];
  const endM = months[months.length - 1];

  // End time = last day of the last complete month
  const lastDay = new Date(Date.UTC(endM.year, endM.month, 0)); // day 0 = last day of prev month trick

  const body = {
    dimensions: ['countryId'],
    metrics: ['installerCount'],
    pageSize: 25000,
    timelineSpec: {
      aggregationPeriod: 'MONTHLY',
      startTime: { year: startM.year, month: startM.month, day: 1 },
      endTime: { year: endM.year, month: endM.month, day: lastDay.getUTCDate() },
    },
  };

  const url = `https://playdeveloperreporting.googleapis.com/v1beta1/apps/${encodeURIComponent(packageName)}/storePerformanceSummaryMetricSet:search`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 403) {
    const text = await res.text();
    throw new Error(`PERMISSION_DENIED: ${text.slice(0, 200)}`);
  }
  if (res.status === 404) {
    throw new Error(
      'Play Reporting endpoint not found. Install/acquisition metrics are not available from this API endpoint; use a supported export source (for example Play Console bulk reports / BigQuery) for month+country installs.'
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Play Reporting API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  return data;
};

// ---------------------------------------------------------------------------
// Parse Reporting API rows into byMonth / byCountry
// ---------------------------------------------------------------------------

const parseRows = (rows = []) => {
  // monthlyData: { 'YYYY-MM': { countryCode: count } }
  const monthlyData = {};
  const countryTotals = {};

  for (const row of rows) {
    const { startTime, dimensionValues = [], metricValues = [] } = row;
    if (!startTime) continue;

    const month = `${String(startTime.year).padStart(4, '0')}-${String(startTime.month).padStart(2, '0')}`;
    const country = dimensionValues.find((d) => d.dimension === 'countryId')?.stringValue || 'XX';
    const count = parseInt(
      metricValues.find((m) => m.metric === 'installerCount')?.int64Value || '0',
      10
    );

    if (!Number.isFinite(count) || count <= 0) continue;
    if (!monthlyData[month]) monthlyData[month] = {};
    monthlyData[month][country] = (monthlyData[month][country] || 0) + count;
    countryTotals[country] = (countryTotals[country] || 0) + count;
  }

  const byMonth = Object.entries(monthlyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, countries]) => ({
      month,
      total: Object.values(countries).reduce((s, n) => s + n, 0),
    }));

  const byCountry = Object.entries(countryTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([country, total]) => ({ country, total }));

  const lifetimeTotal = byMonth.reduce((s, m) => s + m.total, 0);

  return { byMonth, byCountry, lifetimeTotal };
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

exports.handler = async (event) => {
  const responseHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'x-admin-key',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: responseHeaders, body: '' };
  }

  // Auth check
  const requiredKey = process.env.ADMIN_DASHBOARD_KEY || '';
  const providedKey = (event.headers || {})['x-admin-key'] || '';
  if (requiredKey && providedKey !== requiredKey) {
    return { statusCode: 401, headers: responseHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const clientEmail = process.env.GOOGLE_PLAY_CLIENT_EMAIL || '';
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || '';

  const missingVars = [
    !clientEmail && 'GOOGLE_PLAY_CLIENT_EMAIL',
    !packageName && 'GOOGLE_PLAY_PACKAGE_NAME',
  ].filter(Boolean);

  if (missingVars.length > 0) {
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ notConfigured: true, missingVars }),
    };
  }

  try {
    // Private key is stored in Supabase app_secrets (too large for Lambda env vars).
    // Fall back to env var if present (local dev convenience).
    let privateKeyRaw = process.env.GOOGLE_PLAY_PRIVATE_KEY || '';
    if (!privateKeyRaw) {
      const supabaseUrl = process.env.SUPABASE_URL || '';
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('GOOGLE_PLAY_PRIVATE_KEY not set and Supabase credentials missing.');
      }
      const secRes = await fetch(
        `${supabaseUrl}/rest/v1/app_secrets?key=eq.GOOGLE_PLAY_PRIVATE_KEY&select=value&limit=1`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
      );
      if (!secRes.ok) throw new Error(`Supabase app_secrets fetch failed: ${secRes.status}`);
      const rows = await secRes.json();
      if (!rows.length) throw new Error('GOOGLE_PLAY_PRIVATE_KEY row not found in app_secrets.');
      privateKeyRaw = rows[0].value;
    }

    const serviceAccount = {
      client_email: clientEmail,
      private_key: privateKeyRaw.replace(/\\n/g, '\n'),
    };
    const accessToken = await getAccessToken(serviceAccount);
    const raw = await fetchPlayStats(accessToken, packageName);
    const { byMonth, byCountry, lifetimeTotal } = parseRows(raw.rows || []);

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ lifetimeTotal, byMonth, byCountry }),
    };
  } catch (err) {
    const permissionDenied = String(err.message || '').includes('PERMISSION_DENIED');
    console.error('[google-play-stats]', err.message);
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ error: err.message, permissionDenied }),
    };
  }
};
