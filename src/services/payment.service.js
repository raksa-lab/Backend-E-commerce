const db = require('../config/database');
const { getStripeClient } = require('../config/stripe');
const HttpError = require('../utils/http-error');

const publicPaymentColumns = 'id, order_id, payment_method, provider, payment_status, amount_cents, currency, stripe_checkout_session_id, stripe_payment_intent_id, created_at, updated_at';

const mapDatabaseError = (error) => {
  if (error.code === 'P0002') throw new HttpError(404, error.message);
  if (error.code === 'P0001') throw new HttpError(409, error.message);
  if (error.code === '22023') throw new HttpError(400, error.message);
  if (error.code === '23505') throw new HttpError(409, 'Request conflicts with an existing payment');
  throw error;
};

const queryRpc = async (name, args) => {
  const { data, error } = await db.rpc(name, args);
  if (error) mapDatabaseError(error);
  return data;
};

const returnUrl = (envName, paramName, value) => {
  const rawUrl = process.env[envName];
  if (!rawUrl) throw new HttpError(503, 'Payment return URLs are not configured');
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new HttpError(503, 'Payment return URLs are invalid');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new HttpError(503, 'Payment return URLs must use HTTPS');
  }
  url.searchParams.set(paramName, value);
  return url.toString().replace('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}');
};

exports.createCheckoutSession = async ({ orderId, userId, idempotencyKey }) => {
  const stripe = getStripeClient();
  const attempt = await queryRpc('prepare_payment_attempt', {
    p_order_id: orderId,
    p_user_id: userId,
    p_idempotency_key: idempotencyKey,
  });

  if (attempt.stripe_checkout_session_id) {
    const session = await stripe.checkout.sessions.retrieve(attempt.stripe_checkout_session_id);
    if (session?.url) return { payment_id: attempt.id, checkout_url: session.url };
    throw new HttpError(409, 'Checkout session is no longer available');
  }

  const metadata = {
    payment_id: attempt.id,
    order_id: orderId,
    user_id: userId,
  };
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      client_reference_id: attempt.id,
      line_items: [{
        price_data: {
          currency: attempt.currency,
          product_data: { name: `Order ${orderId}` },
          unit_amount: Number(attempt.amount_cents),
        },
        quantity: 1,
      }],
      metadata,
      payment_intent_data: { metadata },
      success_url: returnUrl('PAYMENT_SUCCESS_URL', 'session_id', '{CHECKOUT_SESSION_ID}'),
      cancel_url: returnUrl('PAYMENT_CANCEL_URL', 'order_id', orderId),
    }, { idempotencyKey: attempt.idempotency_key });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, 'Unable to start Stripe checkout');
  }

  if (!session?.id || !session.url) throw new HttpError(502, 'Stripe did not return a checkout URL');
  await queryRpc('attach_payment_session', {
    p_payment_id: attempt.id,
    p_session_id: session.id,
    p_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
  });
  return { payment_id: attempt.id, checkout_url: session.url };
};

exports.processWebhook = async (event) => queryRpc('process_stripe_webhook', {
  p_event_id: event.id,
  p_event_type: event.type,
  p_event_data: event,
});

exports.expireOpenCheckoutForOrder = async (orderId, actor) => {
  let orderQuery = db.from('orders').select('id, user_id').eq('id', orderId);
  if (actor.role !== 'admin') orderQuery = orderQuery.eq('user_id', actor.id);
  const { data: order, error: orderError } = await orderQuery.maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw new HttpError(404, 'Order not found');

  const { data: payments, error } = await db.from('payments')
    .select('id, stripe_checkout_session_id, payment_status')
    .eq('order_id', orderId).eq('payment_status', 'pending')
    .order('created_at', { ascending: false }).range(0, 0);
  if (error) throw error;
  const payment = payments?.[0];
  if (!payment?.stripe_checkout_session_id) return false;

  let session;
  const stripe = getStripeClient();
  try {
    session = await stripe.checkout.sessions.retrieve(payment.stripe_checkout_session_id);
    if (session?.status === 'open') {
      session = await stripe.checkout.sessions.expire(payment.stripe_checkout_session_id);
      return session?.status === 'expired';
    }
  } catch {
    throw new HttpError(502, 'Unable to expire the open Stripe checkout session');
  }
  if (session?.status === 'expired') return false;
  throw new HttpError(409, 'Payment is already being completed; retry cancellation after payment status updates');
};

exports.getCustomerPayment = async (orderId, userId) => {
  const { data: order, error: orderError } = await db.from('orders')
    .select('id').eq('id', orderId).eq('user_id', userId).maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw new HttpError(404, 'Order not found');

  const { data, error } = await db.from('payments').select(publicPaymentColumns)
    .eq('order_id', orderId).order('created_at', { ascending: false }).range(0, 0);
  if (error) throw error;
  return data?.[0] || null;
};

exports.listAdminPayments = async ({ page, limit, status }) => {
  let query = db.from('payments').select(publicPaymentColumns, { count: 'exact' });
  if (status) query = query.eq('payment_status', status);
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (error) throw error;
  return { payments: data || [], page, limit, total: count || 0 };
};

exports.getAdminPayment = async (paymentId) => {
  const { data: payment, error } = await db.from('payments')
    .select(publicPaymentColumns).eq('id', paymentId).maybeSingle();
  if (error) throw error;
  if (!payment) throw new HttpError(404, 'Payment not found');
  const { data: refunds, error: refundsError } = await db.from('payment_refunds')
    .select('id, payment_id, amount_cents, currency, reason, refund_status, stripe_refund_id, actor_id, created_at, updated_at')
    .eq('payment_id', paymentId).order('created_at', { ascending: false });
  if (refundsError) throw refundsError;
  return { payment, refunds: refunds || [] };
};

exports.createRefund = async ({ paymentId, actorId, amountCents, reason, idempotencyKey }) => {
  const refund = await queryRpc('reserve_payment_refund', {
    p_payment_id: paymentId,
    p_actor_id: actorId,
    p_amount_cents: amountCents ?? null,
    p_reason: reason ?? null,
    p_idempotency_key: idempotencyKey,
  });
  let stripeRefund;
  try {
    stripeRefund = await getStripeClient().refunds.create({
      payment_intent: refund.stripe_payment_intent_id,
      amount: Number(refund.amount_cents),
      ...(refund.reason ? { reason: refund.reason } : {}),
      metadata: { payment_refund_id: refund.id, payment_id: paymentId },
    }, { idempotencyKey: refund.idempotency_key });
  } catch {
    throw new HttpError(502, 'Unable to process refund with Stripe; retry with the same Idempotency-Key');
  }

  await queryRpc('complete_payment_refund', {
    p_refund_id: refund.id,
    p_stripe_refund_id: stripeRefund.id,
    p_refund_status: ['pending', 'succeeded', 'failed', 'canceled'].includes(stripeRefund.status)
      ? stripeRefund.status : 'pending',
  });
  const { data: payment, error } = await db.from('payments')
    .select(publicPaymentColumns).eq('id', paymentId).maybeSingle();
  if (error) throw error;
  const { data: storedRefund, error: refundError } = await db.from('payment_refunds')
    .select('id, payment_id, amount_cents, currency, reason, refund_status, stripe_refund_id, actor_id, created_at, updated_at')
    .eq('id', refund.id).maybeSingle();
  if (refundError) throw refundError;
  return { refund: storedRefund, payment_status: payment?.payment_status };
};
