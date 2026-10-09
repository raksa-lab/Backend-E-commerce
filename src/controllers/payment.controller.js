const service = require('../services/payment.service');
const { getStripeClient, getWebhookSecret } = require('../config/stripe');
const HttpError = require('../utils/http-error');
const { requireUuid } = require('../utils/uuid');

const parsePositiveInteger = (value, fallback, name, max) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new HttpError(400, name + ' must be a positive integer');
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || (max && number > max)) {
    throw new HttpError(400, name + ' is outside the allowed range');
  }
  return number;
};

const requireIdempotencyKey = (req) => {
  const key = req.get('Idempotency-Key');
  requireUuid(key, 'Idempotency-Key');
  return key;
};

exports.createCheckoutSession = async (req, res) => {
  requireUuid(req.params.id, 'id');
  const idempotencyKey = requireIdempotencyKey(req);
  res.status(201).json(await service.createCheckoutSession({
    orderId: req.params.id,
    userId: req.user.id,
    idempotencyKey,
  }));
};

exports.getCustomerPayment = async (req, res) => {
  requireUuid(req.params.id, 'id');
  res.json(await service.getCustomerPayment(req.params.id, req.user.id));
};

exports.webhook = async (req, res) => {
  const signature = req.get('stripe-signature');
  if (!Buffer.isBuffer(req.body) || typeof signature !== 'string') {
    return res.status(400).json({ message: 'Invalid Stripe webhook request' });
  }
  let event;
  try {
    event = getStripeClient().webhooks.constructEvent(req.body, signature, getWebhookSecret());
  } catch {
    return res.status(400).json({ message: 'Invalid Stripe webhook signature' });
  }
  res.json(await service.processWebhook(event));
};

exports.listAdminPayments = async (req, res) => {
  const page = parsePositiveInteger(req.query.page, 1, 'page');
  const limit = parsePositiveInteger(req.query.limit, 20, 'limit', 100);
  const status = req.query.status;
  if (status !== undefined && !['pending', 'succeeded', 'failed', 'partially_refunded', 'refunded'].includes(status)) {
    throw new HttpError(400, 'status is invalid');
  }
  res.json(await service.listAdminPayments({ page, limit, status }));
};

exports.getAdminPayment = async (req, res) => {
  requireUuid(req.params.id, 'id');
  res.json(await service.getAdminPayment(req.params.id));
};

exports.createRefund = async (req, res) => {
  requireUuid(req.params.id, 'id');
  const idempotencyKey = requireIdempotencyKey(req);
  const body = req.body === undefined ? {} : req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((key) => !['amount_cents', 'reason'].includes(key))) {
    throw new HttpError(400, 'Request body contains invalid refund fields');
  }
  if (body.amount_cents !== undefined && (!Number.isSafeInteger(body.amount_cents) || body.amount_cents < 1)) {
    throw new HttpError(400, 'amount_cents must be a positive integer');
  }
  const reasons = ['duplicate', 'fraudulent', 'requested_by_customer'];
  if (body.reason !== undefined && !reasons.includes(body.reason)) {
    throw new HttpError(400, 'reason is invalid');
  }
  res.status(201).json(await service.createRefund({
    paymentId: req.params.id,
    actorId: req.user.id,
    amountCents: body.amount_cents,
    reason: body.reason,
    idempotencyKey,
  }));
};
