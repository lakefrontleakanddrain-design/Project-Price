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

/**
 * Returns YYYY-MM-DD strings for the last `n` days (excluding today,
 * since today's report isn't ready yet).
 */
const getLast30Days = () => {
  const days = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = 1; i <= 30; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
};

// ---------------------------------------------------------------------------
// Report fetching
// ---------------------------------------------------------------------------

const fetchReport = async (jwt, vendorNumber, frequency, reportDate) => {
  const url = new URL('https://api.appstoreconnect.apple.com/v1/salesReports');
  url.searchParams.set('filter[frequency]', frequency);
  url.searchParams.set('filter[reportType]', 'SALES');
  url.searchParams.set('filter[reportSubType]', 'SUMMARY');
  url.searchParams.set('filter[vendorNumber]', vendorNumber);
  url.searchParams.set('filter[reportDate]', reportDate);

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

const fetchMonthlyReport = (jwt, vendorNumber, month) => fetchReport(jwt, vendorNumber, 'MONTHLY', month);
const fetchDailyReport = (jwt, vendorNumber, day) => fetchReport(jwt, vendorNumber, 'DAILY', day);

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

// Count all product types EXCEPT known in-app purchase / subscription types.
// Apple uses many download type codes (1, 7, 7T, F1, IA1, etc.); it's safer
// to exclude the IAP family than to maintain an allow-list.
const IAP_TYPES = new Set(['IA1', 'IA9', 'IAY', 'IAC', 'IATV', 'IAPD', 'IAPT']);
const isDownload = (productType) => productType !== '' && !IAP_TYPES.has(productType);

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
    // --- Monthly reports (completed months, all fetched in parallel) ---
    const LAUNCH_MONTH = '2025-09';
    const months = getMonthsSince(LAUNCH_MONTH);

    const monthlyData = {}; // { 'YYYY-MM': { US: n, ... } }
    const errors = [];

    const monthResults = await Promise.allSettled(
      months.map((month) => fetchMonthlyReport(jwt, vendorNumber, month).then((tsv) => ({ month, tsv })))
    );

    const parseUnits = (rows, bucket, key) => {
      rows.forEach((row) => {
        const productType = row.product_type_identifier || row.product_type || '';
        if (!isDownload(productType)) return;
        const units = parseInt(row.units || '0', 10);
        if (!Number.isFinite(units) || units <= 0) return;
        const country = row.country_code || 'XX';
        if (!bucket[key]) bucket[key] = {};
        bucket[key][country] = (bucket[key][country] || 0) + units;
      });
    };

    for (const result of monthResults) {
      if (result.status === 'rejected') {
        errors.push({ error: result.reason?.message || 'Unknown error' });
        console.error('[appstore-stats] Month fetch failed:', result.reason?.message);
        continue;
      }
      const { month, tsv } = result.value;
      if (!tsv) continue;
      parseUnits(parseTSV(tsv), monthlyData, month);
    }

    // --- Daily reports for last 30 days (fills in months Apple hasn't published
    //     monthly reports for yet, e.g. current and previous month) ---
    const days = getLast30Days();
    const dailyData = {}; // { 'YYYY-MM-DD': { US: n, ... } }

    const dayResults = await Promise.allSettled(
      days.map((day) => fetchDailyReport(jwt, vendorNumber, day).then((tsv) => ({ day, tsv })))
    );

    for (const result of dayResults) {
      if (result.status === 'rejected') continue; // daily failures are non-fatal
      const { day, tsv } = result.value;
      if (!tsv) continue;
      parseUnits(parseTSV(tsv), dailyData, day);
    }

    // Merge daily data into monthlyData for any month NOT already covered by a
    // completed monthly report (avoids double-counting).
    const coveredMonths = new Set(Object.keys(monthlyData));
    Object.entries(dailyData).forEach(([day, countries]) => {
      const month = day.slice(0, 7); // 'YYYY-MM'
      if (coveredMonths.has(month)) return; // monthly report already covers this
      if (!monthlyData[month]) monthlyData[month] = {};
      Object.entries(countries).forEach(([country, n]) => {
        monthlyData[month][country] = (monthlyData[month][country] || 0) + n;
      });
    });

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
