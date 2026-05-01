/**
 * project-price-appstore-stats
 *
 * Returns App Store download data for the last 4 complete weeks, aggregated
 * by country/territory.
 *
 * Required Netlify environment variables:
 *   APP_STORE_CONNECT_KEY_IDENTIFIER   — API key ID (e.g. 7M4252YLKU)
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

/** Returns the ISO Monday (YYYY-MM-DD, UTC) for the week containing `d`. */
const toIsoMonday = (d) => {
  const dt = new Date(d);
  dt.setUTCHours(0, 0, 0, 0);
  const day = dt.getUTCDay(); // 0=Sun
  const offset = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + offset);
  return dt.toISOString().slice(0, 10);
};

/**
 * Returns the last `n` complete Mondays (most-recent-first).
 * "Complete" means the week has already ended (i.e., start from previous Monday).
 */
const getLastNMondays = (n) => {
  const mondays = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayMonday = toIsoMonday(today);
  // Start one week before the current week so we only fetch complete weeks
  const start = new Date(todayMonday);
  start.setUTCDate(start.getUTCDate() - 7);
  for (let i = 0; i < n; i++) {
    mondays.push(start.toISOString().slice(0, 10));
    start.setUTCDate(start.getUTCDate() - 7);
  }
  return mondays;
};

// ---------------------------------------------------------------------------
// Report fetching
// ---------------------------------------------------------------------------

const fetchWeeklyReport = async (jwt, vendorNumber, reportDate) => {
  const url = new URL('https://api.appstoreconnect.apple.com/v1/salesReports');
  url.searchParams.set('filter[frequency]', 'WEEKLY');
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
    const mondays = getLastNMondays(4); // last 4 complete weeks (~30 days)

    // { '2026-04-21': { US: 12, CA: 3, ... }, ... }
    const weeklyData = {};
    const errors = [];

    for (const monday of mondays) {
      try {
        const tsv = await fetchWeeklyReport(jwt, vendorNumber, monday);
        if (!tsv) continue;

        const rows = parseTSV(tsv);
        rows.forEach((row) => {
          const productType = row.product_type_identifier || row.product_type || '';
          if (!DOWNLOAD_TYPES.has(productType) && productType !== '1') return;

          const units = parseInt(row.units || '0', 10);
          if (!Number.isFinite(units) || units <= 0) return;

          const country = row.country_code || 'XX';
          if (!weeklyData[monday]) weeklyData[monday] = {};
          weeklyData[monday][country] = (weeklyData[monday][country] || 0) + units;
        });
      } catch (err) {
        errors.push({ week: monday, error: err.message });
        console.error(`[appstore-stats] Failed for week ${monday}:`, err.message);
      }
    }

    // Aggregate totals by country across all weeks
    const totals = {};
    Object.values(weeklyData).forEach((weekCountries) => {
      Object.entries(weekCountries).forEach(([country, units]) => {
        totals[country] = (totals[country] || 0) + units;
      });
    });

    // Build per-country weekly breakdown
    const territories = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([country, total]) => ({
        country,
        total,
        weeks: Object.fromEntries(mondays.map((m) => [m, weeklyData[m]?.[country] || 0])),
      }));

    const grandTotal = territories.reduce((sum, t) => sum + t.total, 0);

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ territories, grandTotal, weeksChecked: mondays, errors }),
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
