/**
 * project-price-stripe-webhook
 * Handles Stripe webhook events for subscription lifecycle.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY         - Stripe secret key (sk_live_... or sk_test_...)
 *   STRIPE_WEBHOOK_SECRET     - Webhook signing secret from Stripe dashboard (whsec_...)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY
 *   NOTIFICATIONS_FROM_EMAIL  - defaults to notifications@projectprice.app
 *
 * Handled events:
 *   checkout.session.completed  → activate contractor, store stripe IDs
 *   invoice.paid                → ensure contractor is active (renewals)
 *   invoice.payment_succeeded   → ensure contractor is active (renewals, alt event name)
 *   invoice.payment_failed      → pause contractor
 *   customer.subscription.created → sync initial subscription id/status
 *   customer.subscription.deleted → pause + cancel contractor
 *   customer.subscription.updated → pause/cancel when status transitions
 */

const crypto = require('crypto');

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const getHeaderIgnoreCase = (headers, key) => {
  if (!headers || typeof headers !== 'object') return '';
  const wanted = String(key || '').toLowerCase();
  for (const [headerKey, value] of Object.entries(headers)) {
    if (String(headerKey).toLowerCase() === wanted) return String(value || '');
  }
  return '';
};

const getRawBody = (event) => {
  const body = event?.body;
  if (typeof body !== 'string') return '';
  if (event?.isBase64Encoded) {
    return Buffer.from(body, 'base64').toString('utf8');
  }
  return body;
};

const parseWebhookSecrets = () => {
  const secrets = [];
  const primary = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  const previous = String(process.env.STRIPE_WEBHOOK_SECRET_PREVIOUS || '').trim();
  const csv = String(process.env.STRIPE_WEBHOOK_SECRETS || '').trim();

  if (primary) secrets.push(primary);
  if (previous) secrets.push(previous);
  if (csv) {
    for (const value of csv.split(',')) {
      const secret = value.trim();
      if (secret) secrets.push(secret);
    }
  }

  return [...new Set(secrets)];
};

// ─── Stripe signature verification ─────────────────────────────────────────

const verifyStripeSignature = (rawBody, sigHeader, secret) => {
  const segments = String(sigHeader || '').split(',').map((part) => String(part).trim()).filter(Boolean);
  let timestamp = '';
  const signatures = [];
  for (const segment of segments) {
    const sep = segment.indexOf('=');
    if (sep < 0) continue;
    const key = segment.slice(0, sep);
    const value = segment.slice(sep + 1);
    if (key === 't') timestamp = value;
    if (key === 'v1' && value) signatures.push(value);
  }

  if (!timestamp || signatures.length === 0) {
    throw new Error('Missing Stripe signature components.');
  }

  const tolerance = 600; // 10 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > tolerance) {
    throw new Error('Stripe webhook timestamp out of tolerance.');
  }

  const payload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  let matched = false;
  for (const signature of signatures) {
    const sigBuffer = Buffer.from(signature, 'hex');
    const expBuffer = Buffer.from(expected, 'hex');
    if (sigBuffer.length === expBuffer.length && crypto.timingSafeEqual(sigBuffer, expBuffer)) {
      matched = true;
      break;
    }
  }

  if (!matched) {
    throw new Error('Stripe signature verification failed.');
  }
};

// ─── Supabase helpers ───────────────────────────────────────────────────────

const supabaseRequest = async (path, { method = 'GET', body, headers = {} } = {}) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

const getProfessionalByUserId = async (userId) => {
  const rows = await supabaseRequest(
    `/rest/v1/professionals?user_id=eq.${userId}&limit=1&select=id,is_verified,subscription_status,stripe_customer_id`
  );
  return rows?.[0] || null;
};

const getProfessionalByStripeCustomer = async (customerId) => {
  const rows = await supabaseRequest(
    `/rest/v1/professionals?stripe_customer_id=eq.${encodeURIComponent(customerId)}&limit=1&select=id,is_verified,subscription_status,company_name,contact_phone`
  );
  return rows?.[0] || null;
};

const updateProfessional = async (professionalId, patch) => {
  await supabaseRequest(`/rest/v1/professionals?id=eq.${professionalId}`, {
    method: 'PATCH',
    body: patch,
    headers: { Prefer: 'return=minimal' },
  });
};

const getUserEmailByProfessionalId = async (professionalId) => {
  // professionals → users → auth.users (email via Supabase admin)
  const proRows = await supabaseRequest(
    `/rest/v1/professionals?id=eq.${professionalId}&select=user_id&limit=1`
  );
  const userId = proRows?.[0]?.user_id;
  if (!userId) return null;
  try {
    const authUser = await supabaseRequest(`/auth/v1/admin/users/${userId}`);
    return authUser?.email || null;
  } catch {
    return null;
  }
};

// ─── Email helper ────────────────────────────────────────────────────────────

const getFromEmail = () => String(process.env.NOTIFICATIONS_FROM_EMAIL || 'notifications@projectprice.app').trim();

const sendEmail = async ({ to, subject, html }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return { skipped: true };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: getFromEmail(), to, subject, html }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${text}`);
  return JSON.parse(text);
};

// ─── Event handlers ──────────────────────────────────────────────────────────

/**
 * checkout.session.completed
 * client_reference_id = professionalId (set when creating the session)
 */
const handleCheckoutCompleted = async (session) => {
  const professionalId = session.client_reference_id;
  const customerId = session.customer;
  const subscriptionId = session.subscription;

  if (!professionalId) {
    console.warn('checkout.session.completed: no client_reference_id');
    return;
  }

  await updateProfessional(professionalId, {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    subscription_status: 'active',
    is_verified: true,
    is_paused_by_contractor: false,
  });

  console.log(`checkout.session.completed: activated professional ${professionalId}`);

  // Send welcome / payment confirmation email
  const email = await getUserEmailByProfessionalId(professionalId);
  if (email) {
    await sendEmail({
      to: email,
      subject: 'Welcome to Project Price — Your account is active!',
      html: `
        <p>Your subscription is confirmed and your Project Price contractor account is now active.</p>
        <p>You can now sign in and start receiving jobs:<br/>
        <a href="https://projectpriceapp.com/contractor-portal.html">https://projectpriceapp.com/contractor-portal.html</a></p>
        <p>Subscription: $399/month, billed monthly. Manage your subscription at any time via your account portal.</p>
        <p>Thank you for joining Project Price!</p>
      `,
    });
  }
};

/**
 * invoice.paid — fires on successful renewal payments
 */
const handleInvoicePaid = async (invoice) => {
  const customerId = invoice.customer;
  if (!customerId) return;

  const pro = await getProfessionalByStripeCustomer(customerId);
  if (!pro) { console.warn(`invoice.paid: no professional found for customer ${customerId}`); return; }

  if (pro.subscription_status !== 'active' || !pro.is_verified) {
    await updateProfessional(pro.id, {
      subscription_status: 'active',
      is_verified: true,
      is_paused_by_contractor: false,
    });
    console.log(`invoice.paid: reactivated professional ${pro.id}`);

    const email = await getUserEmailByProfessionalId(pro.id);
    if (email) {
      await sendEmail({
        to: email,
        subject: 'Project Price subscription restored',
        html: `
          <p>Great news - your Project Price subscription payment was successful.</p>
          <p>Your contractor account is active again and you can continue receiving jobs.</p>
          <p><a href="https://projectpriceapp.com/contractor-portal.html">Open your contractor portal</a></p>
          <p>If you need help, contact support@projectprice.app.</p>
        `,
      });
    }
  }
};

/**
 * invoice.payment_failed — fires when a renewal charge fails
 */
const handlePaymentFailed = async (invoice) => {
  const customerId = invoice.customer;
  if (!customerId) return;

  const pro = await getProfessionalByStripeCustomer(customerId);
  if (!pro) { console.warn(`invoice.payment_failed: no professional found for customer ${customerId}`); return; }

  await updateProfessional(pro.id, {
    subscription_status: 'past_due',
    is_verified: false,
  });

  console.log(`invoice.payment_failed: paused professional ${pro.id}`);

  const email = await getUserEmailByProfessionalId(pro.id);
  if (email) {
    await sendEmail({
      to: email,
      subject: 'Action Required — Project Price payment failed',
      html: `
        <p>We were unable to process your Project Price subscription payment of $399.</p>
        <p>Your account has been temporarily paused. Please update your payment method to reactivate your account and continue receiving jobs.</p>
        <p><a href="https://projectpriceapp.com/contractor-portal.html">Update payment method</a></p>
        <p>If you have questions, reply to this email or contact support@projectprice.app.</p>
      `,
    });
  }
};

/**
 * customer.subscription.deleted — subscription was canceled
 */
const handleSubscriptionDeleted = async (subscription) => {
  const customerId = subscription.customer;
  if (!customerId) return;

  const pro = await getProfessionalByStripeCustomer(customerId);
  if (!pro) { console.warn(`subscription.deleted: no professional found for customer ${customerId}`); return; }

  await updateProfessional(pro.id, {
    subscription_status: 'canceled',
    is_verified: false,
    stripe_subscription_id: null,
  });

  console.log(`subscription.deleted: deactivated professional ${pro.id}`);

  const email = await getUserEmailByProfessionalId(pro.id);
  if (email) {
    await sendEmail({
      to: email,
      subject: 'Your Project Price subscription has been canceled',
      html: `
        <p>Your Project Price contractor subscription has been canceled and your account is no longer active.</p>
        <p>If this was a mistake or you'd like to resubscribe, please visit:</p>
        <p><a href="https://projectpriceapp.com/contractor-signup.html">https://projectpriceapp.com/contractor-signup.html</a></p>
        <p>Questions? Contact support@projectprice.app.</p>
      `,
    });
  }
};

/**
 * customer.subscription.created — store initial subscription id/status.
 */
const handleSubscriptionCreated = async (subscription) => {
  const customerId = subscription.customer;
  const status = String(subscription.status || '').toLowerCase();
  if (!customerId) return;

  const pro = await getProfessionalByStripeCustomer(customerId);
  if (!pro) { console.warn(`subscription.created: no professional found for customer ${customerId}`); return; }

  const patch = { stripe_subscription_id: subscription.id || null };
  if (status === 'active' || status === 'trialing') {
    patch.subscription_status = 'active';
    patch.is_verified = true;
    patch.is_paused_by_contractor = false;
  } else if (status === 'past_due' || status === 'unpaid' || status === 'incomplete_expired') {
    patch.subscription_status = 'past_due';
    patch.is_verified = false;
  } else if (status === 'canceled') {
    patch.subscription_status = 'canceled';
    patch.is_verified = false;
  }

  await updateProfessional(pro.id, patch);
  console.log(`subscription.created: synced professional ${pro.id} status=${status || 'unknown'}`);
};

/**
 * customer.subscription.updated — fallback for Stripe accounts where deleted event
 * isn't available in event destination UI.
 */
const handleSubscriptionUpdated = async (subscription) => {
  const customerId = subscription.customer;
  const status = String(subscription.status || '').toLowerCase();
  if (!customerId || !status) return;

  const pro = await getProfessionalByStripeCustomer(customerId);
  if (!pro) { console.warn(`subscription.updated: no professional found for customer ${customerId}`); return; }

  if (status === 'active' || status === 'trialing') {
    await updateProfessional(pro.id, {
      subscription_status: 'active',
      is_verified: true,
      is_paused_by_contractor: false,
      stripe_subscription_id: subscription.id || null,
    });
    console.log(`subscription.updated: activated professional ${pro.id}`);
    return;
  }

  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete_expired') {
    await updateProfessional(pro.id, {
      subscription_status: 'past_due',
      is_verified: false,
      stripe_subscription_id: subscription.id || null,
    });
    console.log(`subscription.updated: marked past_due professional ${pro.id}`);
    return;
  }

  if (status === 'canceled') {
    await handleSubscriptionDeleted(subscription);
  }
};

// ─── Main handler ────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const webhookSecrets = parseWebhookSecrets();
  if (webhookSecrets.length === 0) {
    console.error('No Stripe webhook secret configured');
    return jsonResponse(500, { error: 'Webhook secret not configured.' });
  }

  const sigHeader = getHeaderIgnoreCase(event.headers, 'stripe-signature');
  const rawBody = getRawBody(event);

  try {
    let verified = false;
    for (const secret of webhookSecrets) {
      try {
        verifyStripeSignature(rawBody, sigHeader, secret);
        verified = true;
        break;
      } catch {
        // Try next configured secret to support webhook secret rotation.
      }
    }
    if (!verified) throw new Error('Stripe signature verification failed.');
  } catch (err) {
    console.error('Stripe signature error:', err.message);
    return jsonResponse(400, { error: err.message });
  }

  let stripeEvent;
  try {
    stripeEvent = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  console.log(`Stripe event: ${stripeEvent.type} id=${stripeEvent.id}`);

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(stripeEvent.data.object);
        break;
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
        await handleInvoicePaid(stripeEvent.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(stripeEvent.data.object);
        break;
      case 'customer.subscription.created':
        await handleSubscriptionCreated(stripeEvent.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(stripeEvent.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(stripeEvent.data.object);
        break;
      default:
        console.log(`Unhandled Stripe event type: ${stripeEvent.type}`);
    }
  } catch (err) {
    console.error(`Error handling ${stripeEvent.type}:`, err.message);
    // Return 200 to prevent Stripe retrying for non-signature errors
    return jsonResponse(200, { received: true, error: err.message });
  }

  return jsonResponse(200, { received: true });
};
