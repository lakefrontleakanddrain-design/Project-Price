/**
 * project-price-google-play-stats
 *
 * Returns Google Play install data from a BigQuery view with schema:
 *   month   STRING  -- YYYY-MM
 *   country STRING  -- ISO2 country code
 *   total   INT64   -- installs for the month+country slice
 *
 * Required Netlify environment variables:
 *   GOOGLE_PLAY_CLIENT_EMAIL          - service account client email
 *   GOOGLE_PLAY_PACKAGE_NAME          - app id (for diagnostics)
 *   GOOGLE_PLAY_BQ_PROJECT_ID         - BigQuery project id
 *   GOOGLE_PLAY_BQ_DATASET            - BigQuery dataset containing the view
 *   GOOGLE_PLAY_BQ_VIEW               - view name (default: google_play_installs_monthly_country)
 *   ADMIN_DASHBOARD_KEY               - same key used by admin panel
 *   SUPABASE_URL                      - used to fetch private key from app_secrets
 *   SUPABASE_SERVICE_ROLE_KEY         - used to fetch private key from app_secrets
 *
 * Notes:
 * - GOOGLE_PLAY_PRIVATE_KEY should stay out of Netlify env vars (Lambda 4KB env limit).
 * - Private key is fetched from Supabase app_secrets where key='GOOGLE_PLAY_PRIVATE_KEY'.
 */

'use strict';

const crypto = require('crypto');

const LAUNCH_MONTH = '2025-09';

const createGoogleJWT = ({ client_email, private_key, scope }) => {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: client_email,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url');

  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign('SHA256');
  sign.update(signingInput);
  const signature = sign.sign(private_key).toString('base64url');
  return `${signingInput}.${signature}`;
};

const getAccessToken = async ({ client_email, private_key, scope }) => {
  const jwt = createGoogleJWT({ client_email, private_key, scope });
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

const fetchPrivateKeyFromSupabase = async () => {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/app_secrets?key=eq.GOOGLE_PLAY_PRIVATE_KEY&select=value&limit=1`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  if (!res.ok) {
    throw new Error(`Supabase app_secrets fetch failed: ${res.status}`);
  }
  const rows = await res.json();
  if (!rows.length || !rows[0].value) {
    throw new Error('GOOGLE_PLAY_PRIVATE_KEY row not found in app_secrets.');
  }
  return rows[0].value;
};

const runBigQuery = async ({ accessToken, projectId, sql, params }) => {
  const queryParameters = Object.entries(params).map(([name, value]) => ({
    name,
    parameterType: { type: 'STRING' },
    parameterValue: { value: String(value) },
  }));

  const res = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/queries`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: sql,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`BigQuery query error ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const fields = (data.schema && data.schema.fields) || [];
  const rows = data.rows || [];

  const idx = {
    month: fields.findIndex((f) => f.name === 'month'),
    country: fields.findIndex((f) => f.name === 'country'),
    total: fields.findIndex((f) => f.name === 'total'),
  };
  if (idx.month < 0 || idx.country < 0 || idx.total < 0) {
    throw new Error('BigQuery view must return columns: month, country, total.');
  }

  return rows.map((r) => ({
    month: r.f[idx.month]?.v || '',
    country: r.f[idx.country]?.v || 'XX',
    total: parseInt(r.f[idx.total]?.v || '0', 10) || 0,
  }));
};

const summarize = (rows) => {
  const byMonthMap = new Map();
  const byCountryMap = new Map();

  for (const row of rows) {
    if (!row.month || !row.country || !Number.isFinite(row.total) || row.total <= 0) continue;
    byMonthMap.set(row.month, (byMonthMap.get(row.month) || 0) + row.total);
    byCountryMap.set(row.country, (byCountryMap.get(row.country) || 0) + row.total);
  }

  const byMonth = Array.from(byMonthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({ month, total }));

  const byCountry = Array.from(byCountryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([country, total]) => ({ country, total }));

  const lifetimeTotal = byMonth.reduce((sum, m) => sum + m.total, 0);
  return { byMonth, byCountry, lifetimeTotal };
};

exports.handler = async (event) => {
  const responseHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'x-admin-key',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: responseHeaders, body: '' };
  }

  const requiredKey = process.env.ADMIN_DASHBOARD_KEY || '';
  const providedKey = (event.headers || {})['x-admin-key'] || '';
  if (requiredKey && providedKey !== requiredKey) {
    return { statusCode: 401, headers: responseHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const clientEmail = process.env.GOOGLE_PLAY_CLIENT_EMAIL || '';
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || '';
  const bqProjectId = process.env.GOOGLE_PLAY_BQ_PROJECT_ID || '';
  const bqDataset = process.env.GOOGLE_PLAY_BQ_DATASET || '';
  const bqView = process.env.GOOGLE_PLAY_BQ_VIEW || 'google_play_installs_monthly_country';

  const missingVars = [
    !clientEmail && 'GOOGLE_PLAY_CLIENT_EMAIL',
    !packageName && 'GOOGLE_PLAY_PACKAGE_NAME',
    !bqProjectId && 'GOOGLE_PLAY_BQ_PROJECT_ID',
    !bqDataset && 'GOOGLE_PLAY_BQ_DATASET',
  ].filter(Boolean);

  if (missingVars.length > 0) {
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ notConfigured: true, missingVars }),
    };
  }

  try {
    const privateKeyRaw = process.env.GOOGLE_PLAY_PRIVATE_KEY || (await fetchPrivateKeyFromSupabase());
    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

    const accessToken = await getAccessToken({
      client_email: clientEmail,
      private_key: privateKey,
      scope: 'https://www.googleapis.com/auth/bigquery.readonly',
    });

    const sql = `
      SELECT month, country, CAST(total AS INT64) AS total
      FROM \`${bqProjectId}.${bqDataset}.${bqView}\`
      WHERE month >= @launchMonth
      ORDER BY month ASC, country ASC
    `;

    const rows = await runBigQuery({
      accessToken,
      projectId: bqProjectId,
      sql,
      params: { launchMonth: LAUNCH_MONTH },
    });

    const { byMonth, byCountry, lifetimeTotal } = summarize(rows);
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ lifetimeTotal, byMonth, byCountry }),
    };
  } catch (err) {
    console.error('[google-play-stats]', err.message);
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({
        error: err.message,
        setupHint:
          'Create BigQuery view with columns month,country,total and set GOOGLE_PLAY_BQ_PROJECT_ID, GOOGLE_PLAY_BQ_DATASET, GOOGLE_PLAY_BQ_VIEW.',
      }),
    };
  }
};
