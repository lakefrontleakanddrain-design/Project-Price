import http from 'node:http';
import https from 'node:https';

const endpoint =
  process.env.WATERFALL_ENDPOINT ||
  'http://localhost:8888/.netlify/functions/waterfall-lead';
const leadRequestId = process.env.LEAD_REQUEST_ID;
const proPhone = process.env.PRO_PHONE || '+15555550101';
const replyBody = process.env.REPLY_BODY || '';
const runSecondDispatch = (process.env.RUN_SECOND_DISPATCH || 'true').toLowerCase() === 'true';

if (!leadRequestId) {
  console.error('Missing LEAD_REQUEST_ID.');
  console.error('Example: LEAD_REQUEST_ID=<uuid> node scripts/waterfall-smoke-test.mjs');
  process.exit(1);
}

function request(method, rawUrl, headers = {}, body = '') {
  const url = new URL(rawUrl);
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        method,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        headers: {
          Accept: '*/*',
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode || 0, body: data });
        });
      }
    );

    req.on('error', reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

async function postJson(url, payload) {
  const body = JSON.stringify(payload);
  return request(
    'POST',
    url,
    {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
    body
  );
}

async function postForm(url, formData) {
  const body = new URLSearchParams(formData).toString();
  return request(
    'POST',
    url,
    {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
    body
  );
}

function logResult(label, result) {
  console.log(`\n${label}`);
  console.log(`Status: ${result.statusCode}`);
  console.log(`Body: ${result.body}`);
}

async function run() {
  console.log('ProjectPrice waterfall smoke test');
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Lead Request ID: ${leadRequestId}`);

  const firstDispatch = await postJson(endpoint, { leadRequestId });
  logResult('1) Dispatch lead', firstDispatch);

  if (replyBody) {
    const twilioReply = await postForm(endpoint, {
      From: proPhone,
      Body: replyBody,
    });
    logResult(`2) Simulate Twilio reply (${replyBody})`, twilioReply);
  } else {
    console.log('\n2) Twilio reply simulation skipped (set REPLY_BODY=YES or NO).');
  }

  if (runSecondDispatch) {
    const secondDispatch = await postJson(endpoint, { leadRequestId });
    logResult('3) Dispatch lead again (rollover/next state check)', secondDispatch);
  }
}

run().catch((error) => {
  console.error('Smoke test failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
