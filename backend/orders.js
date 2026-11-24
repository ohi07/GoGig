const Stripe = require('stripe');
const { publish } = require('./live');

const mode = process.env.PAYMENT_MODE || 'demo';
const supportedModes = ['demo', 'stripe-test'];
if (!supportedModes.includes(mode)) throw new Error('PAYMENT_MODE must be demo or stripe-test');

let stripe;
let publicOrigin;
if (mode === 'stripe-test') {
  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') || !process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) {
    throw new Error('Stripe test mode requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET');
  }
  publicOrigin = new URL(process.env.PUBLIC_ORIGIN).origin;
  if (!/^https?:\/\//.test(publicOrigin)) throw new Error('PUBLIC_ORIGIN must use HTTP or HTTPS');
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 10000, maxNetworkRetries: 1 });
}

const currencies = new Map([['$', 'USD'], ['€', 'EUR'], ['৳', 'BDT'], ['USD', 'USD'], ['EUR', 'EUR'], ['BDT', 'BDT']]);
const now = () => new Date().toISOString();

function proposalTotal(amount, currency) {
  const raw = typeof amount === 'number' || typeof amount === 'string' ? String(amount) : '';
  const code = currencies.get(currency);
  if (!code || !/^\d{1,7}(?:\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) return null;
  const [whole, decimal = ''] = raw.split('.');
  return { amountMinor: Number(whole) * 100 + Number(decimal.padEnd(2, '0')), currency: code };
}

function createOrder(job, proposal) {
  const total = proposalTotal(proposal.amount, proposal.currency || job.currency || '৳');
  return {
    id: job.id, jobId: job.id, title: job.title, clientId: job.clientId,
    freelancerId: proposal.freelancerId, createdAt: now(), status: 'assigned',
    ...total, paymentStatus: total ? 'unpaid' : 'agreement_required',
  };
}

function projectOrder(order, user, db) {
  const { checkoutSessionId, ...details } = order;
  return {
    ...details,
    clientName: db.users.find((person) => person.id === order.clientId)?.name,
    freelancerName: db.users.find((person) => person.id === order.freelancerId)?.name,
    canPay: user.id === order.clientId && order.paymentStatus === 'unpaid'
      && (mode !== 'stripe-test' || ['USD', 'EUR'].includes(order.currency)),
    paymentMode: mode,
  };
}

function completeOrder(job, order) {
  const timestamp = now();
  job.status = 'completed';
  if (order) {
    order.status = 'completed';
    order.completedAt = timestamp;
  }
}

function analytics(db) {
  const paymentVolume = {};
  for (const order of db.orders) {
    if (order.paymentStatus !== 'paid') continue;
    const totals = paymentVolume[order.provider] ||= {};
    totals[order.currency] = (totals[order.currency] || 0) + order.amountMinor;
  }
  return {
    users: db.users.length,
    openJobs: db.jobs.filter((job) => job.status === 'open' && !job.flagged).length,
    orders: db.orders.length,
    completedJobs: db.jobs.filter((job) => job.status === 'completed').length,
    openTickets: db.tickets.filter((ticket) => ticket.status === 'open').length,
    pendingModeration: [...db.jobs, ...db.proposals, ...db.posts].filter((entry) => entry.flagged).length,
    paymentVolume,
  };
}

function markPaid(order, provider) {
  order.paymentStatus = 'paid';
  order.provider = provider;
  order.paidAt = now();
}

async function handleOrderRequest(pathname, req, res, helpers) {
  const { authenticate, readDb, writeDb, sendJson, getBody } = helpers;
  const match = /^\/api\/orders(?:\/([^/]+)(?:\/(checkout|terms|deliver))?)?$/.exec(pathname);
  if (pathname === '/api/payments/stripe/webhook' && req.method === 'POST' && stripe) {
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    } catch {
      return sendJson(res, 400, { error: 'Invalid Stripe event signature' });
    }
    if (!event.livemode && ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
      const checkout = event.data.object;
      const db = await readDb();
      const order = db.orders.find((item) => item.id === checkout.metadata?.orderId);
      if (order?.paymentStatus === 'unpaid' && order.checkoutSessionId === checkout.id &&
          checkout.payment_status === 'paid' && checkout.amount_total === order.amountMinor &&
          checkout.currency === order.currency.toLowerCase()) {
        markPaid(order, 'stripe-test');
        await writeDb(db);
        publish([order.clientId, order.freelancerId]);
      }
    }
    return sendJson(res, 200, { received: true });
  }
  if (!match) return false;
  const user = await authenticate(req);
  if (!user) return sendJson(res, 401, { error: 'Sign in to view orders' });
  const db = await readDb();
  const [, orderId, action] = match;
  const canView = (order) => user.role === 'admin' || [order.clientId, order.freelancerId].includes(user.id);
  if (!orderId && req.method === 'GET') {
    return sendJson(res, 200, db.orders.filter(canView).slice().reverse().map((order) => projectOrder(order, user, db)));
  }
  const order = db.orders.find((item) => item.id === orderId && canView(item));
  if (!order) return sendJson(res, 404, { error: 'Order not found' });
  if (!action && req.method === 'GET') return sendJson(res, 200, projectOrder(order, user, db));
  if (!action || req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  if (action === 'deliver') {
    if (user.id !== order.freelancerId) return sendJson(res, 403, { error: 'Only the freelancer can submit delivery' });
    const { note } = await getBody();
    if (typeof note !== 'string' || !note.trim() || note.length > 4000) {
      return sendJson(res, 400, { error: 'Enter a delivery note of up to 4,000 characters' });
    }
    if (order.status !== 'assigned' || order.paymentStatus !== 'paid') {
      return sendJson(res, 409, { error: 'Delivery opens after payment' });
    }
    order.deliveryNote = note.trim();
    order.deliveredAt = now();
    order.status = 'delivered';
  } else {
    if (user.id !== order.clientId) return sendJson(res, 403, { error: 'Only the client can arrange payment' });
    if (action === 'terms') {
      if (order.status !== 'assigned' || order.paymentStatus !== 'agreement_required') {
        return sendJson(res, 409, { error: 'This order already has an agreed price' });
      }
      const { amount, currency } = await getBody();
      const total = proposalTotal(amount, currency);
      if (!total) return sendJson(res, 400, { error: 'Enter a valid price and currency' });
      Object.assign(order, total, { paymentStatus: 'unpaid' });
    } else {
      if (order.paymentStatus === 'paid') return sendJson(res, 200, projectOrder(order, user, db));
      if (order.status !== 'assigned' || order.paymentStatus !== 'unpaid') {
        return sendJson(res, 409, { error: 'Agree on a price before checkout' });
      }
      if (stripe) {
        if (!['USD', 'EUR'].includes(order.currency) || order.amountMinor < 50 || order.amountMinor > 99999999) {
          return sendJson(res, 400, { error: 'Stripe test checkout supports USD or EUR amounts from 0.50 to 999,999.99' });
        }
        const previous = order.checkoutSessionId && await stripe.checkout.sessions.retrieve(order.checkoutSessionId);
        if (previous?.status === 'open') return sendJson(res, 200, { url: previous.url });
        if (previous?.status === 'complete') {
          return sendJson(res, 409, { error: 'Stripe is processing this payment. Refresh once Stripe confirms it.' });
        }
        const url = `${publicOrigin}/orders/${order.id}`;
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          payment_method_types: ['card'],
          success_url: `${url}?checkout=returned`,
          cancel_url: url,
          metadata: { orderId: order.id },
          line_items: [{ price_data: {
            currency: order.currency.toLowerCase(),
            unit_amount: order.amountMinor,
            product_data: { name: order.title.slice(0, 100) },
          }, quantity: 1 }],
        }, { idempotencyKey: `gogig-order-${order.id}-${previous?.id || 'initial'}` });
        order.checkoutSessionId = session.id;
        await writeDb(db);
        return sendJson(res, 200, { url: session.url });
      }
      if (order.checkoutSessionId) {
        return sendJson(res, 409, { error: 'Resume this order with its original payment provider' });
      }
      markPaid(order, 'demo');
    }
  }
  await writeDb(db);
  publish([order.clientId, order.freelancerId]);
  return sendJson(res, 200, projectOrder(order, user, db));
}

module.exports = { analytics, completeOrder, createOrder, handleOrderRequest, proposalTotal };
