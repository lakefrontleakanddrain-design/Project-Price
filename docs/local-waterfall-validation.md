# Local Waterfall Validation

This runbook validates the sequential 5-minute claim flow locally.

## 1) Start Supabase

```bash
supabase start
supabase db reset
```

## 2) Prepare environment variables

Copy values from `.env.example` into your local runtime environment for Netlify Functions.

Required variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`

## 3) Insert test data

Create one homeowner user, three verified professionals with matching specialties/zip, one project, and one `lead_requests` row.

Minimum test shape:

- `professionals.specialties` contains your test specialty (example: `"plumbing"`).
- `professionals.service_zip_codes` contains your lead zip.
- `lead_requests.status = 'pending'`.

## 4) Trigger waterfall dispatch

```bash
curl -X POST http://localhost:8888/.netlify/functions/waterfall-lead \
  -H "Content-Type: application/json" \
  -d '{"leadRequestId":"<LEAD_REQUEST_UUID>"}'
```

Expected result: position 1 receives SMS and offer is timestamped with a 5-minute expiry.

## 5) Claim via Twilio webhook simulation

```bash
curl -X POST http://localhost:8888/.netlify/functions/waterfall-lead \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=%2B15555550101&Body=YES"
```

Expected result: lead marked as `claimed`, claiming offer set to `yes`, remaining offers set to `skipped`.

## 6) Timeout rollover test

If no YES arrives, invoke the dispatch endpoint again after offer expiry and verify progression to position 2 then position 3.

## 7) No-install smoke test script

This repository includes a pure Node smoke test that does not require local package installs.

Run from repo root:

LEAD_REQUEST_ID=<LEAD_REQUEST_UUID> npm run smoke:waterfall

Optional variables:

- WATERFALL_ENDPOINT (default: http://localhost:8888/.netlify/functions/waterfall-lead)
- REPLY_BODY (set YES or NO to simulate Twilio reply)
- PRO_PHONE (default: +15555550101)
- RUN_SECOND_DISPATCH (default: true)
