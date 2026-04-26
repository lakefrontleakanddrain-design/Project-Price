const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const env = () => ({
  supabaseUrl: process.env.SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  resendApiKey: process.env.RESEND_API_KEY || '',
  complianceFromEmail: process.env.COMPLIANCE_FROM_EMAIL || 'compliance@projectprice.app',
  appBaseUrl: process.env.APP_BASE_URL || 'https://project-price-app.netlify.app',
  complianceRunKey: process.env.COMPLIANCE_RUN_KEY || '',
});

exports.config = {
  schedule: '@daily',
};

const LICENSE_REQUIRED_SERVICES = new Set(['plumbing', 'electrical', 'hvac']);

const supabaseRequest = async (path, { method = 'GET', body, headers = {} } = {}) => {
  const { supabaseUrl, serviceKey } = env();
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
  try { return JSON.parse(text); } catch { return text; }
};

const sendEmail = async ({ to, subject, html }) => {
  const { resendApiKey, complianceFromEmail } = env();
  if (!resendApiKey || !to) return { skipped: true };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: complianceFromEmail,
      to: [to],
      subject,
      html,
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${text}`);
  return { skipped: false };
};

const getAuthUserById = async (userId) => supabaseRequest(`/auth/v1/admin/users/${userId}`);

const daysUntil = (dateText) => {
  if (!dateText) return null;
  const target = new Date(dateText);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
};

const upsertLastNotified = async (docId) => {
  const q = new URLSearchParams({ id: `eq.${docId}` });
  const today = new Date().toISOString().slice(0, 10);
  await supabaseRequest(`/rest/v1/contractor_compliance_docs?${q.toString()}`, {
    method: 'PATCH',
    body: { last_notified_on: today },
    headers: { Prefer: 'return=minimal' },
  });
};

const pauseProfessional = async (professionalId) => {
  const q = new URLSearchParams({ id: `eq.${professionalId}` });
  try {
    await supabaseRequest(`/rest/v1/professionals?${q.toString()}`, {
      method: 'PATCH',
      body: { is_verified: false, is_paused_by_contractor: true },
      headers: { Prefer: 'return=minimal' },
    });
  } catch {
    await supabaseRequest(`/rest/v1/professionals?${q.toString()}`, {
      method: 'PATCH',
      body: { is_verified: false },
      headers: { Prefer: 'return=minimal' },
    });
  }
};

const shouldNotifyToday = (lastNotifiedOn) => {
  const today = new Date().toISOString().slice(0, 10);
  return String(lastNotifiedOn || '') !== today;
};

const buildReminderEmail = ({ companyName, serviceName, insuranceDays, licenseDays }) => {
  const { appBaseUrl } = env();
  const insuranceText = insuranceDays < 0
    ? `Insurance expired ${Math.abs(insuranceDays)} day(s) ago.`
    : `Insurance expires in ${insuranceDays} day(s).`;
  const licenseText = licenseDays === null
    ? ''
    : (licenseDays < 0 ? ` License expired ${Math.abs(licenseDays)} day(s) ago.` : ` License expires in ${licenseDays} day(s).`);

  const subject = `[Action Required] ${companyName} compliance docs for ${serviceName}`;
  const html = `
    <p>Hello ${companyName},</p>
    <p>${insuranceText}${licenseText}</p>
    <p>Please upload updated insurance/license documents in your contractor dashboard to avoid interruptions.</p>
    <p><a href="${appBaseUrl}/contractor-portal.html">Open Contractor Dashboard</a></p>
    <p>ProjectPrice Compliance</p>
  `;
  return { subject, html };
};

exports.handler = async (event) => {
  try {
    const { complianceRunKey } = env();
    if (event?.httpMethod === 'POST' && complianceRunKey) {
      const headerKey = event.headers?.['x-compliance-key'] || event.headers?.['X-Compliance-Key'] || '';
      if (headerKey !== complianceRunKey) return jsonResponse(401, { error: 'Unauthorized.' });
    }

    let docs = [];
    try {
      docs = (await supabaseRequest('/rest/v1/contractor_compliance_docs?select=id,professional_id,service_name,insurance_expires_on,license_expires_on,last_notified_on')) || [];
    } catch (err) {
      const msg = String(err?.message || '');
      if (msg.includes('42P01') || msg.includes('PGRST205')) {
        return jsonResponse(200, { message: 'contractor_compliance_docs table not found. Skipping.' });
      }
      throw err;
    }

    const professionalIds = Array.from(new Set(docs.map((d) => d.professional_id).filter(Boolean)));
    if (professionalIds.length === 0) return jsonResponse(200, { message: 'No compliance docs to process.' });

    const inList = professionalIds.join(',');
    const pros = (await supabaseRequest(`/rest/v1/professionals?id=in.(${inList})&select=id,user_id,company_name,specialties,is_verified`)) || [];
    const proById = Object.fromEntries(pros.map((p) => [p.id, p]));

    let remindersSent = 0;
    let contractorsPaused = 0;

    for (const doc of docs) {
      const pro = proById[doc.professional_id];
      if (!pro) continue;

      const insuranceDays = daysUntil(doc.insurance_expires_on);
      const requiresLicense = LICENSE_REQUIRED_SERVICES.has(String(doc.service_name || '').toLowerCase());
      const licenseDays = requiresLicense ? daysUntil(doc.license_expires_on) : null;

      const shouldWarnInsurance = insuranceDays !== null && insuranceDays <= 30;
      const shouldWarnLicense = licenseDays !== null && licenseDays <= 30;
      if (!shouldWarnInsurance && !shouldWarnLicense) continue;

      if (shouldNotifyToday(doc.last_notified_on)) {
        const authUser = await getAuthUserById(pro.user_id);
        const to = authUser?.email || null;
        const email = buildReminderEmail({
          companyName: pro.company_name || 'Contractor',
          serviceName: doc.service_name,
          insuranceDays,
          licenseDays,
        });
        try {
          await sendEmail({ to, subject: email.subject, html: email.html });
          remindersSent += 1;
        } catch {
          // Do not fail the whole job on one email error.
        }
        await upsertLastNotified(doc.id);
      }

      const isExpired = (insuranceDays !== null && insuranceDays < 0) || (licenseDays !== null && licenseDays < 0);
      if (isExpired && pro.is_verified) {
        await pauseProfessional(pro.id);
        contractorsPaused += 1;
      }
    }

    return jsonResponse(200, {
      message: 'Compliance check completed.',
      remindersSent,
      contractorsPaused,
      processedDocs: docs.length,
    });
  } catch (err) {
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Unexpected error.' });
  }
};
