const Stripe = require('stripe');
const HttpError = require('../utils/http-error');

let client;
let clientKey;

exports.getStripeClient = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(503, 'Stripe payments are not configured');
  if (!client || clientKey !== key) {
    client = new Stripe(key);
    clientKey = key;
  }
  return client;
};

exports.getWebhookSecret = () => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, 'Stripe webhooks are not configured');
  return secret;
};
