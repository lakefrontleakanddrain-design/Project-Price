/**
 * project-price-appstore-stats
 *
 * Returns App Store download data for the last 4 complete weeks, aggregated
 * by country/territory.
 *
 * Required Netlify environment variables:
 *   APP_STORE_CONNECT_KEY_IDENTIFIER   — API key ID (from App Store Connect → Users and Access → Keys)
 *   APP_STORE_CONNECT_ISSUER_ID        — Issuer ID (UUID from App Store Connect)
 *   APP_STORE_CONNECT_PRIVATE_KEY      — Full content of the .p8 file; replace
 *                                        physical newlines with \n when saving to Netlify.
 *   APP_STORE_CONNECT_VENDOR_NUMBER    — Vendor/provider number (found in App Store
 *                                        Connect → Agreements, Tax, and Banking).
 *   ADMIN_DASHBOARD_KEY                — Same key used by the admin panel.
 */

'use strict';

const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');

const gunzip = promisify(zlib.gunzip);

// ---------------------------------------------------------------------------
// JWT helper
// ---------------------------------------------------------------------------

const createAppStoreJWT = (keyId, issuerId, privateKeyPem) => {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: issuerId,
    iat: now,
    exp: now + 1200,
    aud: 'appstoreconnect-v1',
  })).toString('base64url');

  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign('SHA256');
  sign.update(signingInput);
  // dsaEncoding:'ieee-p1363' produces raw r||s (64 bytes) — required for JWT ES256
  const signature = sign.sign({ key: privateKeyPem, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${signingInput}.${signature}`;
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Returns YYYY-MM strings for every complete calendar month from
 * startYYYYMM through last month inclusive. Months before the app
 * launched will return 404 from Apple and are silently skipped.
 */
const getMonthsSince = (startYYYYMM) => {
  const months = [];
  const [sy, sm] = startYYYYMM.split('-').map(Number);
  const now = new Date();
  const lastComplete = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const cur = new Date(Date.UTC(sy, sm - 1, 1));
  while (cur <= lastComplete) {
    months.push(cur.toISOString().slice(0, 7)); // YYYY-MM
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return months;
};

// ---------------------------------------------------------------------------
// Report fetching
// ---------------------------------------------------------------------------

const fetchMonthlyReport = async (jwt, vendorNumber, reportMonth) => {
  const url = new URL('https://api.appstoreconnect.apple.com/v1/salesReports');
  url.searchParams.set('filter[frequency]', 'MONTHLY');
  url.searchParams.set('filter[reportType]', 'SALES');
  url.searchParams.set('filter[reportSubType]', 'SUMMARY');
  url.searchParams.set('filter[vendorNumber]', vendorNumber);
  url.searchParams.set('filter[reportDate]', reportMonth);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/a-gzip',
    },
  });

  if (res.status === 404) return null; // Report not yet available
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`App Store Connect API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const unzipped = await gunzip(buffer);
  return unzipped.toString('utf8');
};

// ---------------------------------------------------------------------------
// TSV parser
// ---------------------------------------------------------------------------

const parseTSV = (tsv) => {
  const lines = tsv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split('\t').map((h) => h.trim().toLowerCase().replace(/[\s/\\-]+/g, '_'));
  return lines.slice(1).map((line) => {
    const cols = line.split('\t');
    return Object.fromEntries(headers.map((h, i) => [h, (cols[i] || '').trim()]));
  });
};

// Product Type Identifiers that count as free or paid app downloads (units)
// Type 1 = paid, 7 = free download
const DOWNLOAD_TYPES = new Set(['1', '1F', '1T', '7', 'F1']);

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

  // Auth check (same key as the admin panel)
  const requiredKey = process.env.ADMIN_DASHBOARD_KEY || '';
  const providedKey = (event.headers || {})['x-admin-key'] || '';
  if (requiredKey && providedKey !== requiredKey) {
    return { statusCode: 401, headers: responseHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const keyId = process.env.APP_STORE_CONNECT_KEY_IDENTIFIER || '';
  const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID || '';
  const privateKeyRaw = process.env.APP_STORE_CONNECT_PRIVATE_KEY || '';
  const vendorNumber = process.env.APP_STORE_CONNECT_VENDOR_NUMBER || '';

  const missingVars = [
    !keyId && 'APP_STORE_CONNECT_KEY_IDENTIFIER',
    !issuerId && 'APP_STORE_CONNECT_ISSUER_ID',
    !privateKeyRaw && 'APP_STORE_CONNECT_PRIVATE_KEY',
    !vendorNumber && 'APP_STORE_CONNECT_VENDOR_NUMBER',
  ].filter(Boolean);

  if (missingVars.length > 0) {
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ notConfigured: true, missingVars }),
    };
  }

  // Env vars may store literal \n for newlines
  const privateKeyPem = privateKeyRaw.replace(/\\n/g, '\n');

  try {
    const jwt = createAppStoreJWT(keyId, issuerId, privateKeyPem);
    // Fetch all complete months since launch in parallel (404 = before launch, silently skipped)
    const LAUNCH_MONTH = '2025-09';
    const months = getMonthsSince(LAUNCH_MONTH);

    const monthlyData = {}; // { 'YYYY-MM': { US: n, ... } }
    const errors = [];

    const results = await Promise.allSettled(
      months.map((month) => fetchMonthlyReport(jwt, vendorNumber, month).then((tsv) => ({ month, tsv })))
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        errors.push({ error: result.reason?.message || 'Unknown error' });
        console.error('[appstore-stats] Month fetch failed:', result.reason?.message);
        continue;
      }
      const { month, tsv } = result.value;
      if (!tsv) continue;

      const rows = parseTSV(tsv);
      rows.forEach((row) => {
        const productType = row.product_type_identifier || row.product_type || '';
        if (!DOWNLOAD_TYPES.has(productType) && productType !== '1') return;
        const units = parseInt(row.units || '0', 10);
        if (!Number.isFinite(units) || units <= 0) return;
        const country = row.country_code || 'XX';
        if (!monthlyData[month]) monthlyData[month] = {};
        monthlyData[month][country] = (monthlyData[month][country] || 0) + units;
      });
    }

    // Monthly totals in chronological order
    const byMonth = Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, countries]) => ({
        month,
        total: Object.values(countries).reduce((s, n) => s + n, 0),
      }));

    // Lifetime country totals
    const countryTotals = {};
    Object.values(monthlyData).forEach((countries) => {
      Object.entries(countries).forEach(([c, n]) => { countryTotals[c] = (countryTotals[c] || 0) + n; });
    });
    const byCountry = Object.entries(countryTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([country, total]) => ({ country, total }));

    const lifetimeTotal = byMonth.reduce((s, m) => s + m.total, 0);

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ lifetimeTotal, byMonth, byCountry, errors }),
    };
  } catch (err) {
    console.error('[appstore-stats] Fatal error:', err.message);
    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
