const { after, before, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const stripeConfigPath = path.resolve(__dirname, '../src/config/stripe.js');
const stripeState = { sessions: [], refunds: [] };
const fakeStripe = {
  checkout: { sessions: {
    async create(params, options) {
      const existing = stripeState.sessions.find((session) => session.idempotencyKey === options.idempotencyKey);
      if (existing) return existing;
      const session = {
        id: 'cs_test_' + (stripeState.sessions.length + 1),
        url: 'https://checkout.stripe.test/session/' + (stripeState.sessions.length + 1),
        status: 'open',
        params,
        idempotencyKey: options.idempotencyKey,
      };
      stripeState.sessions.push(session);
      return session;
    },
    async retrieve(id) { return stripeState.sessions.find((session) => session.id === id); },
    async expire(id) {
      const session = stripeState.sessions.find((item) => item.id === id);
      if (!session || session.status !== 'open') throw new Error('Checkout session cannot be expired');
      session.status = 'expired';
      return session;
    },
  } },
  refunds: { async create(params, options) {
    const existing = stripeState.refunds.find((refund) => refund.idempotencyKey === options.idempotencyKey);
    if (existing) return existing;
    const refund = {
      id: 're_test_' + (stripeState.refunds.length + 1), status: 'succeeded',
      ...params, idempotencyKey: options.idempotencyKey,
    };
    stripeState.refunds.push(refund);
    return refund;
  } },
  webhooks: { constructEvent(rawBody, signature) {
    if (signature !== 'test-signature') throw new Error('signature verification failed');
    return JSON.parse(rawBody.toString('utf8'));
  } },
};
require.cache[stripeConfigPath] = {
  id: stripeConfigPath, filename: stripeConfigPath, loaded: true,
  exports: { getStripeClient: () => fakeStripe, getWebhookSecret: () => 'whsec_unit_test_only' }, children: [], paths: [],
};

const ids = {
  alice: '11111111-1111-4111-8111-111111111111',
  bob: '22222222-2222-4222-8222-222222222222',
  aliceCart: '33333333-3333-4333-8333-333333333333',
  bobCart: '44444444-4444-4444-8444-444444444444',
  aliceItem: '55555555-5555-4555-8555-555555555555',
  bobItem: '66666666-6666-4666-8666-666666666666',
  aliceAddress: '77777777-7777-4777-8777-777777777777',
  bobAddress: '88888888-8888-4888-8888-888888888888',
  variant: '99999999-9999-4999-8999-999999999999',
  aliceOrder: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  bobOrder: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  aliceOrderItem: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
};

const baseTables = {
  users: [],
  payments: [],
  payment_refunds: [],
  stripe_webhook_events: [],
  carts: [
    { id: ids.aliceCart, user_id: ids.alice },
    { id: ids.bobCart, user_id: ids.bob },
  ],
  cart_items: [
    { id: ids.aliceItem, cart_id: ids.aliceCart, variant_id: ids.variant, quantity: 1 },
    { id: ids.bobItem, cart_id: ids.bobCart, variant_id: ids.variant, quantity: 1 },
  ],
  user_addresses: [
    { id: ids.aliceAddress, user_id: ids.alice, city: 'Phnom Penh' },
    { id: ids.bobAddress, user_id: ids.bob, city: 'Siem Reap' },
  ],
  product_variants: [{ id: ids.variant, price: 12.5, stock_quantity: 2 }],
  orders: [
    { id: ids.aliceOrder, user_id: ids.alice, address_id: ids.aliceAddress, total_amount: 12.5, final_amount: 12.5, status: 'pending', created_at: '2026-01-02T00:00:00.000Z' },
    { id: ids.bobOrder, user_id: ids.bob, address_id: ids.bobAddress, total_amount: 99, final_amount: 99, status: 'pending', created_at: '2026-01-01T00:00:00.000Z' },
  ],
  order_items: [
    { id: ids.aliceOrderItem, order_id: ids.aliceOrder, variant_id: ids.variant, quantity: 1, price: 12.5 },
  ],
  inventory_movements: [],
  order_status_history: [],
};

let tables;
const clone = (value) => JSON.parse(JSON.stringify(value));

class Query {
  constructor(table) {
    this.table = table;
    this.operation = 'select';
    this.payload = null;
    this.filters = [];
    this.returning = false;
    this.countRequested = false;
    this.sort = null;
    this.window = null;
    this.cardinality = null;
  }

  select(_columns = '*', options = {}) {
    this.returning = true;
    this.countRequested = options.count === 'exact';
    return this;
  }

  insert(rows) {
    this.operation = 'insert';
    this.payload = rows;
    return this;
  }

  update(payload) {
    this.operation = 'update';
    this.payload = payload;
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  eq(column, value) {
    this.filters.push([column, value]);
    return this;
  }

  order(column, options = {}) {
    this.sort = { column, ascending: options.ascending !== false };
    return this;
  }

  range(from, to) {
    this.window = [from, to];
    return this;
  }

  single() {
    this.cardinality = 'single';
    return this.run();
  }

  maybeSingle() {
    this.cardinality = 'maybeSingle';
    return this.run();
  }

  matches(row) {
    return this.filters.every(([column, value]) => row[column] === value);
  }

  async run() {
    const rows = tables[this.table] || (tables[this.table] = []);
    let data = [];

    if (this.operation === 'select') {
      data = rows.filter((row) => this.matches(row));
      const count = this.countRequested ? data.length : null;
      if (this.sort) {
        const { column, ascending } = this.sort;
        data = [...data].sort((a, b) => {
          const order = String(a[column] || '').localeCompare(String(b[column] || ''));
          return ascending ? order : -order;
        });
      }
      if (this.window) data = data.slice(this.window[0], this.window[1] + 1);
      return this.cardinal(data, count);
    }

    if (this.operation === 'insert') {
      data = this.payload.map((entry) => ({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...entry,
      }));
      rows.push(...data);
      return this.cardinal(this.returning ? data : [], null);
    }

    if (this.operation === 'update') {
      data = rows.filter((row) => this.matches(row));
      for (const row of data) Object.assign(row, this.payload);
      return this.cardinal(this.returning ? data : [], null);
    }

    if (this.operation === 'delete') {
      data = rows.filter((row) => this.matches(row));
      tables[this.table] = rows.filter((row) => !this.matches(row));
      return this.cardinal(this.returning ? data : [], null);
    }

    throw new Error('Unsupported operation: ' + this.operation);
  }

  cardinal(data, count) {
    if (this.cardinality === 'single') {
      if (data.length !== 1) return { data: null, count, error: { message: 'Expected one row' } };
      return { data: data[0], count, error: null };
    }
    if (this.cardinality === 'maybeSingle') {
      if (data.length > 1) return { data: null, count, error: { message: 'Expected at most one row' } };
      return { data: data[0] || null, count, error: null };
    }
    return { data, count, error: null };
  }

  then(resolve, reject) {
    return this.run().then(resolve, reject);
  }
}

const supabase = {
  from: (table) => new Query(table),
  async rpc(name, args) {
    if (name === 'prepare_payment_attempt') {
      const order = tables.orders.find((row) => row.id === args.p_order_id && row.user_id === args.p_user_id);
      if (!order) return { data: null, error: { code: 'P0002', message: 'Order not found' } };
      if (order.status !== 'pending') return { data: null, error: { code: 'P0001', message: 'Order is not payable' } };
      const sameKey = tables.payments.find((row) => row.idempotency_key === args.p_idempotency_key);
      if (sameKey) {
        if (sameKey.order_id !== order.id) return { data: null, error: { code: 'P0001', message: 'Idempotency key already used' } };
        return { data: sameKey, error: null };
      }
      const existing = tables.payments.find((row) => row.order_id === order.id && row.payment_status === 'pending');
      if (existing) return { data: existing, error: null };
      if (tables.payments.some((row) => row.order_id === order.id && ['succeeded', 'partially_refunded', 'refunded'].includes(row.payment_status))) {
        return { data: null, error: { code: 'P0001', message: 'Order is already paid' } };
      }
      const payment = {
        id: crypto.randomUUID(), order_id: order.id, amount_cents: Math.round(Number(order.final_amount) * 100),
        currency: 'usd', payment_status: 'pending', provider: 'stripe', idempotency_key: args.p_idempotency_key,
      };
      tables.payments.push(payment);
      return { data: payment, error: null };
    }
    if (name === 'attach_payment_session') {
      const payment = tables.payments.find((row) => row.id === args.p_payment_id);
      if (!payment) return { data: null, error: { code: 'P0002', message: 'Payment not found' } };
      payment.stripe_checkout_session_id = args.p_session_id;
      payment.checkout_url = args.p_checkout_url;
      return { data: payment, error: null };
    }
    if (name === 'process_stripe_webhook') {
      if (tables.stripe_webhook_events.some((row) => row.event_id === args.p_event_id)) {
        return { data: { duplicate: true }, error: null };
      }
      const event = args.p_event_data;
      const object = event.data?.object;
      tables.stripe_webhook_events.push({ event_id: args.p_event_id, event_type: args.p_event_type });
      if (args.p_event_type === 'checkout.session.completed') {
        const payment = tables.payments.find((row) => row.id === object.metadata.payment_id);
        if (!payment || payment.stripe_checkout_session_id !== object.id
          || payment.amount_cents !== object.amount_total || payment.currency !== object.currency) {
          tables.stripe_webhook_events.pop();
          return { data: null, error: { code: 'P0001', message: 'Payment does not match checkout session' } };
        }
        if (object.payment_status === 'paid') {
          payment.payment_status = 'succeeded';
          payment.stripe_payment_intent_id = object.payment_intent;
        }
      } else if (args.p_event_type === 'checkout.session.expired') {
        const payment = tables.payments.find((row) => row.stripe_checkout_session_id === object.id);
        if (payment && payment.payment_status === 'pending') {
          payment.payment_status = 'failed';
          const order = tables.orders.find((row) => row.id === payment.order_id);
          if (order?.status === 'pending') {
            order.status = 'cancelled';
            for (const item of tables.order_items.filter((row) => row.order_id === order.id)) {
              const variant = tables.product_variants.find((row) => row.id === item.variant_id);
              if (variant) variant.stock_quantity += item.quantity;
              tables.inventory_movements.push({ id: crypto.randomUUID(), variant_id: item.variant_id, change_type: 'add', quantity: item.quantity, actor_id: order.user_id, order_id: order.id });
            }
          }
        }
      } else if (args.p_event_type === 'refund.updated') {
        const refund = tables.payment_refunds.find((row) => row.id === object.metadata?.payment_refund_id);
        if (refund) {
          refund.stripe_refund_id ||= object.id;
          if (refund.refund_status === 'pending') refund.refund_status = object.status;
        }
      }
      return { data: { duplicate: false }, error: null };
    }
    if (name === 'reserve_payment_refund') {
      const payment = tables.payments.find((row) => row.id === args.p_payment_id);
      if (!payment) return { data: null, error: { code: 'P0002', message: 'Payment not found' } };
      const prior = tables.payment_refunds.find((row) => row.idempotency_key === args.p_idempotency_key);
      if (prior) {
        if (prior.payment_id !== payment.id || prior.requested_amount_cents !== args.p_amount_cents) {
          return { data: null, error: { code: 'P0001', message: 'Idempotency key reused with different refund data' } };
        }
        return { data: prior, error: null };
      }
      if (!['succeeded', 'partially_refunded'].includes(payment.payment_status)) {
        return { data: null, error: { code: 'P0001', message: 'Payment cannot be refunded' } };
      }
      const reserved = tables.payment_refunds.filter((row) => row.payment_id === payment.id && ['pending', 'succeeded'].includes(row.refund_status)).reduce((sum, row) => sum + row.amount_cents, 0);
      const amount = args.p_amount_cents ?? payment.amount_cents - reserved;
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > payment.amount_cents - reserved) {
        return { data: null, error: { code: '22023', message: 'Invalid refund amount' } };
      }
      const refund = {
        id: crypto.randomUUID(), payment_id: payment.id, amount_cents: amount,
        requested_amount_cents: args.p_amount_cents, currency: payment.currency,
        reason: args.p_reason, actor_id: args.p_actor_id, idempotency_key: args.p_idempotency_key,
        refund_status: 'pending', stripe_payment_intent_id: payment.stripe_payment_intent_id,
      };
      tables.payment_refunds.push(refund);
      return { data: refund, error: null };
    }
    if (name === 'complete_payment_refund') {
      const refund = tables.payment_refunds.find((row) => row.id === args.p_refund_id);
      if (!refund) return { data: null, error: { code: 'P0002', message: 'Refund not found' } };
      refund.stripe_refund_id = args.p_stripe_refund_id;
      if (refund.refund_status === 'pending') refund.refund_status = args.p_refund_status;
      const payment = tables.payments.find((row) => row.id === refund.payment_id);
      const refunded = tables.payment_refunds.filter((row) => row.payment_id === payment.id && row.refund_status === 'succeeded').reduce((sum, row) => sum + row.amount_cents, 0);
      payment.payment_status = refunded === 0 ? 'succeeded' : refunded >= payment.amount_cents ? 'refunded' : 'partially_refunded';
      return { data: refund, error: null };
    }
    if (name === 'admin_adjust_inventory') {
      const variant = (tables.product_variants || []).find((row) => row.id === args.p_variant_id);
      if (!variant) return { data: null, error: { code: 'P0002', message: 'Variant not found' } };
      const quantity = Number(variant.stock_quantity || 0);
      const delta = args.p_change_type === 'add' ? args.p_quantity : -args.p_quantity;
      if (quantity + delta < 0) return { data: null, error: { code: 'P0001', message: 'Insufficient stock' } };
      variant.stock_quantity = quantity + delta;
      const log = { id: crypto.randomUUID(), variant_id: args.p_variant_id, change_type: args.p_change_type, quantity: args.p_quantity, note: args.p_note, actor_id: args.p_actor_id, created_at: new Date().toISOString() };
      (tables.inventory_movements || (tables.inventory_movements = [])).push(log);
      return { data: { variant_id: variant.id, stock_quantity: variant.stock_quantity, movement: log }, error: null };
    }
    if (name === 'checkout_order') {
      const address = tables.user_addresses.find((row) => row.id === args.p_address_id && row.user_id === args.p_user_id);
      if (!address) return { data: null, error: { code: 'P0002', message: 'Address not found' } };
      const cart = tables.carts.find((row) => row.user_id === args.p_user_id);
      const items = cart && tables.cart_items.filter((row) => row.cart_id === cart.id);
      if (!items || !items.length) return { data: null, error: { code: 'P0001', message: 'Cart is empty' } };
      for (const item of items) {
        const variant = tables.product_variants.find((row) => row.id === item.variant_id);
        if (!variant) return { data: null, error: { code: 'P0002', message: 'Variant not found' } };
        if (Number(variant.stock_quantity || 0) < item.quantity) return { data: null, error: { code: 'P0001', message: 'Insufficient stock' } };
      }
      const orderItems = items.map((item) => {
        const variant = tables.product_variants.find((row) => row.id === item.variant_id);
        variant.stock_quantity = Number(variant.stock_quantity || 0) - item.quantity;
        return { ...item, price: variant.price };
      });
      const total = orderItems.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
      const order = { id: crypto.randomUUID(), user_id: args.p_user_id, address_id: args.p_address_id, total_amount: total, final_amount: total, status: 'pending' };
      tables.orders.push(order);
      tables.order_status_history.push({ id: crypto.randomUUID(), order_id: order.id, from_status: null, to_status: 'pending', actor_id: args.p_user_id, note: 'Order created', created_at: new Date().toISOString() });
      tables.order_items.push(...orderItems.map((item) => ({ id: crypto.randomUUID(), order_id: order.id, variant_id: item.variant_id, quantity: item.quantity, price: item.price })));
      tables.cart_items = tables.cart_items.filter((row) => row.cart_id !== cart.id);
      return { data: order, error: null };
    }
    if (name === 'change_order_status') {
      const order = tables.orders.find((row) => row.id === args.p_order_id);
      if (!order) return { data: null, error: { code: 'P0002', message: 'Order not found' } };
      const isAdmin = args.p_actor_role === 'admin';
      if (['processing', 'shipped', 'delivered'].includes(args.p_target_status)
        && !tables.payments.some((row) => row.order_id === order.id && ['succeeded', 'partially_refunded'].includes(row.payment_status))) {
        return { data: null, error: { code: 'P0001', message: 'Payment confirmation is required before order processing' } };
      }
      if (!isAdmin && (order.user_id !== args.p_actor_id || args.p_target_status !== 'cancelled')) {
        return { data: null, error: { code: 'P0002', message: 'Order not found' } };
      }
      const allowed = args.p_target_status === 'cancelled'
        ? (isAdmin ? ['pending', 'processing'] : ['pending']).includes(order.status)
        : isAdmin && ({ pending: 'processing', processing: 'shipped', shipped: 'delivered' }[order.status] === args.p_target_status);
      if (!allowed) return { data: null, error: { code: 'P0001', message: 'Invalid order status transition' } };
      const oldStatus = order.status;
      if (args.p_target_status === 'cancelled') {
        for (const item of tables.order_items.filter((row) => row.order_id === order.id)) {
          const variant = tables.product_variants.find((row) => row.id === item.variant_id);
          variant.stock_quantity = Number(variant.stock_quantity || 0) + item.quantity;
          tables.inventory_movements.push({ id: crypto.randomUUID(), variant_id: item.variant_id, change_type: 'add', quantity: item.quantity, note: args.p_note || 'Order cancellation restock', actor_id: args.p_actor_id, order_id: order.id, created_at: new Date().toISOString() });
        }
      }
      order.status = args.p_target_status;
      tables.order_status_history.push({ id: crypto.randomUUID(), order_id: order.id, from_status: oldStatus, to_status: order.status, actor_id: args.p_actor_id, note: args.p_note || null, created_at: new Date().toISOString() });
      return { data: order, error: null };
    }
    return { data: null, error: { message: 'Unknown RPC' } };
  },
};
const databasePath = path.resolve(__dirname, '../src/config/database.js');
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: supabase,
  children: [],
  paths: [],
};

process.env.JWT_SECRET = 'api-security-test-secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_unit_test_only';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_unit_test_only';
process.env.PAYMENT_SUCCESS_URL = 'https://shop.example.test/payment-success';
process.env.PAYMENT_CANCEL_URL = 'https://shop.example.test/payment-cancel';
const app = require('../src/app');
let server;
let baseUrl;

const tokenFor = (id, role = 'customer') =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '1h' });

async function request(method, endpoint, options = {}) {
  const headers = {};
  if (options.token) headers.authorization = 'Bearer ' + options.token;
  if (options.authorization) headers.authorization = options.authorization;
  if (options.body !== undefined || options.rawBody !== undefined) headers['content-type'] = 'application/json';
  if (options.signature) headers['stripe-signature'] = options.signature;
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;

  const response = await fetch(baseUrl + endpoint, {
    method,
    headers,
    ...(options.rawBody !== undefined
      ? { body: options.rawBody }
      : options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

beforeEach(() => {
  tables = clone(baseTables);
  stripeState.sessions.length = 0;
  stripeState.refunds.length = 0;
});

describe('customer order history', () => {
  it('returns only the signed-in customer orders with pagination metadata', async () => {
    const response = await request('GET', '/api/orders?page=1&limit=1', {
      token: tokenFor(ids.alice),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.orders.map((order) => order.id), [ids.aliceOrder]);
    assert.equal(response.body.page, 1);
    assert.equal(response.body.limit, 1);
    assert.equal(response.body.total, 1);
  });

  it('returns an owned order and its items, but hides another customer order', async () => {
    const own = await request('GET', '/api/orders/' + ids.aliceOrder, {
      token: tokenFor(ids.alice),
    });
    const foreign = await request('GET', '/api/orders/' + ids.bobOrder, {
      token: tokenFor(ids.alice),
    });

    assert.equal(own.status, 200);
    assert.equal(own.body.items.length, 1);
    assert.equal(foreign.status, 404);
  });

  it('rejects invalid pagination and malformed order UUIDs', async () => {
    const invalidPage = await request('GET', '/api/orders?page=0', {
      token: tokenFor(ids.alice),
    });
    const invalidId = await request('GET', '/api/orders/not-a-uuid', {
      token: tokenFor(ids.alice),
    });

    assert.equal(invalidPage.status, 400);
    assert.equal(invalidId.status, 400);
  });
});

describe('authentication flows', () => {
  it('validates registration fields before writing to PostgreSQL', async () => {
    const malformed = await request('POST', '/api/auth/register', {
      body: { full_name: '', email: 'not-an-email', password: 'short', role: 'admin' },
    });

    assert.equal(malformed.status, 400);
    assert.equal(tables.users.length, 0);
  });

  it('registers a customer with a password hash and UUID token subject', async () => {
    const response = await request('POST', '/api/auth/register', {
      body: { full_name: 'Alice Example', email: 'alice@example.com', password: 'correct-horse-9' },
    });

    assert.equal(response.status, 201);
    assert.match(response.body.id, /^[0-9a-f-]{36}$/i);
    assert.equal(tables.users[0].role, 'customer');
    assert.notEqual(tables.users[0].password, 'correct-horse-9');
    assert.equal(jwt.verify(response.body.token, process.env.JWT_SECRET).id, response.body.id);

    const login = await request('POST', '/api/auth/login', {
      body: { email: 'ALICE@example.com', password: 'correct-horse-9' },
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.id, response.body.id);
    const profile = await request('GET', '/api/auth/profile', { token: login.body.token });
    assert.equal(profile.status, 200);
    assert.equal(profile.body.email, 'alice@example.com');
  });

  it('returns the same unauthorized response for unknown users and wrong passwords', async () => {
    const unknown = await request('POST', '/api/auth/login', {
      body: { email: 'missing@example.com', password: 'incorrect-pass-9' },
    });
    tables.users.push({
      id: ids.alice, full_name: 'Alice', email: 'alice@example.com',
      password: '$2a$10$invalid', role: 'customer', provider: 'local',
    });
    const incorrect = await request('POST', '/api/auth/login', {
      body: { email: 'alice@example.com', password: 'incorrect-pass-9' },
    });

    assert.equal(unknown.status, 401);
    assert.equal(incorrect.status, 401);
    assert.equal(unknown.body.message, incorrect.body.message);
  });

  it('creates a Google user when no matching PostgreSQL user exists', async () => {
    const originalVerify = OAuth2Client.prototype.verifyIdToken;
    OAuth2Client.prototype.verifyIdToken = async () => ({
      getPayload: () => ({ email: 'google@example.com', name: 'Google User', email_verified: true }),
    });
    try {
      const response = await request('POST', '/api/auth/google', { body: { idToken: 'mock-google-token-value' } });
      assert.equal(response.status, 200);
      assert.equal(response.body.user.email, 'google@example.com');
      assert.equal(tables.users[0].provider, 'google');
    } finally {
      OAuth2Client.prototype.verifyIdToken = originalVerify;
    }
  });

  it('rejects missing or malformed auth payloads and does not leak provider errors', async () => {
    const missingLogin = await request('POST', '/api/auth/login', { body: {} });
    const missingGoogle = await request('POST', '/api/auth/google', { body: {} });

    assert.equal(missingLogin.status, 400);
    assert.equal(missingGoogle.status, 400);
    assert.equal(Object.hasOwn(missingGoogle.body, 'error'), false);
  });

  it('rejects malformed bearer headers and tokens without valid UUID roles', async () => {
    const malformedHeader = await request('GET', '/api/cart', { authorization: 'Basic abc' });
    const wrongRole = await request('GET', '/api/cart', {
      token: jwt.sign({ id: ids.alice, role: 'owner' }, process.env.JWT_SECRET),
    });
    const nonUuid = await request('GET', '/api/cart', {
      token: jwt.sign({ id: '1', role: 'customer', exp: Math.floor(Date.now() / 1000) + 60 }, process.env.JWT_SECRET),
    });
    const noExpiry = await request('GET', '/api/cart', {
      token: jwt.sign({ id: ids.alice, role: 'customer' }, process.env.JWT_SECRET),
    });

    assert.equal(malformedHeader.status, 401);
    assert.equal(wrongRole.status, 401);
    assert.equal(nonUuid.status, 401);
    assert.equal(noExpiry.status, 401);
  });
});

describe('authorization and ownership', () => {
  it('allows public variant reads but requires admin for writes', async () => {
    const publicRead = await request('GET', '/api/variants');
    const anonymousWrite = await request('POST', '/api/variants', {
      body: { price: 3 },
    });
    const customerWrite = await request('POST', '/api/variants', {
      token: tokenFor(ids.alice),
      body: { price: 3 },
    });

    assert.equal(publicRead.status, 200);
    assert.equal(anonymousWrite.status, 401);
    assert.equal(customerWrite.status, 403);

    const adminWrite = await request('POST', '/api/variants', {
      token: tokenFor(ids.alice, 'admin'),
      body: { price: 3 },
    });
    assert.equal(adminWrite.status, 201);

    const exposedStock = await request('POST', '/api/variants', {
      token: tokenFor(ids.alice, 'admin'), body: { price: 3, stock_quantity: 900 },
    });
    assert.equal(exposedStock.status, 400);
  });

  it('exposes only an in-stock flag in public variant data', async () => {
    const response = await request('GET', '/api/variants');
    assert.equal(response.status, 200);
    assert.equal(response.body[0].in_stock, true);
    assert.equal(Object.hasOwn(response.body[0], 'stock_quantity'), false);
  });

  it('rejects malformed UUIDs on cart, address, and variant routes', async () => {
    const cart = await request('DELETE', '/api/cart/1', {
      token: tokenFor(ids.alice),
    });
    const address = await request('DELETE', '/api/addresses/1', {
      token: tokenFor(ids.alice),
    });
    const variant = await request('PUT', '/api/variants/1', {
      token: tokenFor(ids.alice, 'admin'),
      body: { price: 5 },
    });

    assert.equal(cart.status, 400);
    assert.equal(address.status, 400);
    assert.equal(variant.status, 400);
  });
  it('rejects malformed IDs on product, category, and admin user routes', async () => {
    const admin = tokenFor(ids.alice, 'admin');
    const product = await request('PUT', '/api/products/1', { token: admin, body: { name: 'Changed' } });
    const category = await request('DELETE', '/api/categories/1', { token: admin });
    const user = await request('GET', '/api/users/1', { token: admin });

    assert.equal(product.status, 400);
    assert.equal(category.status, 400);
    assert.equal(user.status, 400);
  });
  it('rejects product and category mass assignment and malformed values', async () => {
    const admin = tokenFor(ids.alice, 'admin');
    const product = await request('POST', '/api/products', {
      token: admin, body: { name: 'Product', id: ids.variant, stock_quantity: 500 },
    });
    const category = await request('POST', '/api/categories', {
      token: admin, body: { name: '', created_at: 'forged' },
    });

    assert.equal(product.status, 400);
    assert.equal(category.status, 400);
    assert.equal((tables.products || []).length, 0);
    assert.equal((tables.categories || []).length, 0);
  });
  it('lets admins create, browse, update, and delete products and categories', async () => {
    const admin = tokenFor(ids.alice, 'admin');
    const category = await request('POST', '/api/categories', {
      token: admin, body: { name: 'Accessories', description: 'Daily items' },
    });
    const product = await request('POST', '/api/products', {
      token: admin, body: { name: 'Canvas Bag', category_id: category.body.id, price: 19.5 },
    });
    const products = await request('GET', '/api/products');
    const categories = await request('GET', '/api/categories');
    const updatedProduct = await request('PUT', '/api/products/' + product.body.id, {
      token: admin, body: { name: 'Canvas Tote' },
    });
    const updatedCategory = await request('PUT', '/api/categories/' + category.body.id, {
      token: admin, body: { description: 'Updated description' },
    });
    const deletedProduct = await request('DELETE', '/api/products/' + product.body.id, { token: admin });
    const deletedCategory = await request('DELETE', '/api/categories/' + category.body.id, { token: admin });

    assert.equal(category.status, 201);
    assert.equal(product.status, 201);
    assert.equal(products.status, 200);
    assert.equal(categories.status, 200);
    assert.equal(products.body[0].name, 'Canvas Bag');
    assert.equal(categories.body[0].name, 'Accessories');
    assert.equal(updatedProduct.status, 200);
    assert.equal(updatedCategory.status, 200);
    assert.equal(updatedProduct.body.name, 'Canvas Tote');
    assert.equal(updatedCategory.body.message, 'Updated');
    assert.equal(deletedProduct.status, 200);
    assert.equal(deletedCategory.status, 200);
    assert.equal(tables.products.length, 0);
    assert.equal(tables.categories.length, 0);
  });
  it('does not allow deleting another customer cart item', async () => {
    const response = await request('DELETE', '/api/cart/' + ids.bobItem, {
      token: tokenFor(ids.alice),
    });

    assert.equal(response.status, 404);
    assert.ok(tables.cart_items.some((item) => item.id === ids.bobItem));
  });

  it('scopes address updates and rejects attempts to change ownership', async () => {
    const foreign = await request('PUT', '/api/addresses/' + ids.bobAddress, {
      token: tokenFor(ids.alice),
      body: { city: 'Changed' },
    });
    const forgedOwner = await request('PUT', '/api/addresses/' + ids.aliceAddress, {
      token: tokenFor(ids.alice),
      body: { user_id: ids.bob },
    });

    assert.equal(foreign.status, 404);
    assert.equal(forgedOwner.status, 400);
    const foreignDelete = await request('DELETE', '/api/addresses/' + ids.bobAddress, {
      token: tokenFor(ids.alice),
    });

    assert.equal(foreignDelete.status, 404);
    assert.equal(tables.user_addresses.find((address) => address.id === ids.bobAddress).city, 'Siem Reap');
  });
});

describe('checkout validation', () => {
  it('rejects non-UUID address IDs and invalid quantities', async () => {
    const invalidAddress = await request('POST', '/api/orders', {
      token: tokenFor(ids.alice),
      body: { address_id: '1' },
    });
    const invalidQuantity = await request('POST', '/api/cart', {
      token: tokenFor(ids.alice),
      body: { variant_id: ids.variant, quantity: 0 },
    });

    assert.equal(invalidAddress.status, 400);
    assert.equal(invalidQuantity.status, 400);
  });

  it('rejects a valid-format address owned by another user', async () => {
    const response = await request('POST', '/api/orders', {
      token: tokenFor(ids.alice),
      body: { address_id: ids.bobAddress },
    });

    assert.equal(response.status, 404);
  });

  it('rejects checkout when a cart variant no longer exists', async () => {
    tables.product_variants = [];
    const beforeCount = tables.orders.length;
    const response = await request('POST', '/api/orders', {
      token: tokenFor(ids.alice),
      body: { address_id: ids.aliceAddress },
    });

    assert.equal(response.status, 404);
    assert.equal(tables.orders.length, beforeCount);
  });
  it('rejects an empty cart without creating an order', async () => {
    tables.cart_items = [];
    const beforeCount = tables.orders.length;
    const response = await request('POST', '/api/orders', {
      token: tokenFor(ids.alice),
      body: { address_id: ids.aliceAddress },
    });

    assert.equal(response.status, 400);
    assert.equal(tables.orders.length, beforeCount);
  });

  it('creates an order using current variant prices and clears the cart', async () => {
    tables.product_variants[0].price = 17.25;
    tables.product_variants[0].stock_quantity = 2;
    const response = await request('POST', '/api/orders', {
      token: tokenFor(ids.alice),
      body: { address_id: ids.aliceAddress },
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.total_amount, 17.25);
    assert.equal(response.body.final_amount, 17.25);
    assert.equal(tables.cart_items.some((item) => item.cart_id === ids.aliceCart), false);
    assert.equal(tables.product_variants[0].stock_quantity, 1);
    assert.equal(tables.order_status_history.at(-1).to_status, 'pending');
  });

  it('rejects checkout when stock is insufficient without creating or clearing anything', async () => {
    tables.product_variants[0].stock_quantity = 0;
    const response = await request('POST', '/api/orders', {
      token: tokenFor(ids.alice),
      body: { address_id: ids.aliceAddress },
    });
    assert.equal(response.status, 409);
    assert.equal(tables.orders.length, 2);
    assert.equal(tables.cart_items.some((item) => item.cart_id === ids.aliceCart), true);
  });
});

describe('order cancellation and status management', () => {
  it('lets a customer cancel only their pending order and restores stock once', async () => {
    const first = await request('POST', '/api/orders/' + ids.aliceOrder + '/cancel', {
      token: tokenFor(ids.alice), body: { note: 'Changed my mind' },
    });
    const repeated = await request('POST', '/api/orders/' + ids.aliceOrder + '/cancel', {
      token: tokenFor(ids.alice),
    });
    const foreign = await request('POST', '/api/orders/' + ids.bobOrder + '/cancel', {
      token: tokenFor(ids.alice),
    });

    assert.equal(first.status, 200);
    assert.equal(first.body.status, 'cancelled');
    assert.equal(repeated.status, 409);
    assert.equal(foreign.status, 404);
    assert.equal(tables.product_variants[0].stock_quantity, 3);
    assert.equal(tables.inventory_movements.filter((row) => row.order_id === ids.aliceOrder).length, 1);
    assert.equal(tables.order_status_history.at(-1).note, 'Changed my mind');
  });

  it('rejects customer cancellation after an order enters processing', async () => {
    tables.orders[0].status = 'processing';
    const response = await request('POST', '/api/orders/' + ids.aliceOrder + '/cancel', {
      token: tokenFor(ids.alice),
    });
    assert.equal(response.status, 409);
    assert.equal(tables.product_variants[0].stock_quantity, 2);
    assert.equal(tables.inventory_movements.length, 0);
  });

  it('allows admins to list orders, advance valid states, and read status history', async () => {
    const admin = tokenFor(ids.alice, 'admin');
    tables.payments.push({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', order_id: ids.aliceOrder, payment_status: 'succeeded' });
    const list = await request('GET', '/api/admin/orders?page=1&limit=10&status=pending', { token: admin });
    const advance = await request('PATCH', '/api/admin/orders/' + ids.aliceOrder + '/status', {
      token: admin, body: { status: 'processing', note: 'Packed' },
    });
    const ship = await request('PATCH', '/api/admin/orders/' + ids.aliceOrder + '/status', {
      token: admin, body: { status: 'shipped' },
    });
    const history = await request('GET', '/api/admin/orders/' + ids.aliceOrder + '/status-history', { token: admin });

    assert.equal(list.status, 200);
    assert.equal(list.body.total, 2);
    assert.equal(advance.status, 200);
    assert.equal(advance.body.status, 'processing');
    assert.equal(ship.status, 200);
    assert.equal(ship.body.status, 'shipped');
    assert.equal(history.status, 200);
    assert.equal(history.body.history.length, 2);
  });

  it('rejects invalid transitions and protects admin routes', async () => {
    const invalid = await request('PATCH', '/api/admin/orders/' + ids.aliceOrder + '/status', {
      token: tokenFor(ids.alice, 'admin'), body: { status: 'delivered' },
    });
    const customer = await request('GET', '/api/admin/orders', { token: tokenFor(ids.alice) });
    const invalidStatus = await request('GET', '/api/admin/orders?status=unknown', { token: tokenFor(ids.alice, 'admin') });

    assert.equal(invalid.status, 409);
    assert.equal(customer.status, 403);
    assert.equal(invalidStatus.status, 400);
  });

  it('lets admins cancel processing orders but never shipped orders', async () => {
    const admin = tokenFor(ids.alice, 'admin');
    tables.orders[0].status = 'processing';
    const processing = await request('POST', '/api/admin/orders/' + ids.aliceOrder + '/cancel', { token: admin });
    assert.equal(processing.status, 200);
    assert.equal(tables.product_variants[0].stock_quantity, 3);

    tables.orders[0].status = 'shipped';
    const shipped = await request('POST', '/api/admin/orders/' + ids.aliceOrder + '/cancel', { token: admin });
    assert.equal(shipped.status, 409);
    assert.equal(tables.product_variants[0].stock_quantity, 3);
    assert.equal(tables.inventory_movements.filter((row) => row.order_id === ids.aliceOrder).length, 1);
  });

  it('validates UUIDs and cancellation notes', async () => {
    const admin = tokenFor(ids.alice, 'admin');
    const invalidId = await request('POST', '/api/orders/1/cancel', { token: tokenFor(ids.alice) });
    const invalidNote = await request('POST', '/api/orders/' + ids.aliceOrder + '/cancel', {
      token: admin, body: { note: 'n'.repeat(501) },
    });
    assert.equal(invalidId.status, 400);
    assert.equal(invalidNote.status, 400);
  });
});

describe('Stripe payment flow', () => {
  const sessionKey = 'aaaaaaaa-0000-4000-8000-000000000001';

  it('creates an idempotent USD checkout session from the stored order total', async () => {
    const response = await request('POST', '/api/orders/' + ids.aliceOrder + '/checkout-session', {
      token: tokenFor(ids.alice), idempotencyKey: sessionKey,
    });
    const retry = await request('POST', '/api/orders/' + ids.aliceOrder + '/checkout-session', {
      token: tokenFor(ids.alice), idempotencyKey: sessionKey,
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.checkout_url, 'https://checkout.stripe.test/session/1');
    assert.match(response.body.payment_id, /^[0-9a-f-]{36}$/i);
    assert.equal(stripeState.sessions.length, 1);
    assert.equal(stripeState.sessions[0].params.line_items[0].price_data.unit_amount, 1250);
    assert.equal(stripeState.sessions[0].params.line_items[0].price_data.currency, 'usd');
    assert.equal(retry.body.payment_id, response.body.payment_id);
    assert.equal(retry.body.checkout_url, response.body.checkout_url);
  });

  it('prevents another customer or an unpaid order without a valid idempotency key from opening checkout', async () => {
    const foreign = await request('POST', '/api/orders/' + ids.aliceOrder + '/checkout-session', {
      token: tokenFor(ids.bob), idempotencyKey: sessionKey,
    });
    const missingKey = await request('POST', '/api/orders/' + ids.aliceOrder + '/checkout-session', {
      token: tokenFor(ids.alice),
    });

    assert.equal(foreign.status, 404);
    assert.equal(missingKey.status, 400);
    assert.equal(stripeState.sessions.length, 0);
  });

  it('processes payment webhooks once and only marks a matching paid session successful', async () => {
    const checkout = await request('POST', '/api/orders/' + ids.aliceOrder + '/checkout-session', {
      token: tokenFor(ids.alice), idempotencyKey: sessionKey,
    });
    const session = stripeState.sessions[0];
    const event = {
      id: 'evt_test_paid', type: 'checkout.session.completed',
      data: { object: {
        id: session.id, metadata: session.params.metadata, amount_total: 1250,
        currency: 'usd', payment_status: 'paid', payment_intent: 'pi_test_paid',
      } },
    };
    const webhook = () => request('POST', '/api/payments/stripe/webhook', {
      rawBody: JSON.stringify(event), signature: 'test-signature',
    });
    const first = await webhook();
    const duplicate = await webhook();

    assert.equal(checkout.status, 201);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(duplicate.status, 200);
    assert.equal(tables.payments[0].payment_status, 'succeeded');
    assert.equal(tables.payments[0].stripe_payment_intent_id, 'pi_test_paid');
    assert.equal(tables.stripe_webhook_events.length, 1);
  });

  it('rejects invalid webhook signatures and releases reserved stock once on session expiry', async () => {
    await request('POST', '/api/orders/' + ids.aliceOrder + '/checkout-session', {
      token: tokenFor(ids.alice), idempotencyKey: sessionKey,
    });
    const session = stripeState.sessions[0];
    const event = {
      id: 'evt_test_expired', type: 'checkout.session.expired',
      data: { object: { id: session.id, metadata: session.params.metadata } },
    };
    const invalid = await request('POST', '/api/payments/stripe/webhook', {
      rawBody: JSON.stringify(event), signature: 'invalid-signature',
    });
    const first = await request('POST', '/api/payments/stripe/webhook', {
      rawBody: JSON.stringify(event), signature: 'test-signature',
    });
    const duplicate = await request('POST', '/api/payments/stripe/webhook', {
      rawBody: JSON.stringify(event), signature: 'test-signature',
    });

    assert.equal(invalid.status, 400);
    assert.equal(first.status, 200);
    assert.equal(duplicate.status, 200);
    assert.equal(tables.orders.find((row) => row.id === ids.aliceOrder).status, 'cancelled');
    assert.equal(tables.product_variants[0].stock_quantity, 3);
    assert.equal(tables.inventory_movements.filter((row) => row.order_id === ids.aliceOrder).length, 1);
  });

  it('expires an open Stripe session before customer cancellation restores stock', async () => {
    await request('POST', '/api/orders/' + ids.aliceOrder + '/checkout-session', {
      token: tokenFor(ids.alice), idempotencyKey: sessionKey,
    });
    const response = await request('POST', '/api/orders/' + ids.aliceOrder + '/cancel', {
      token: tokenFor(ids.alice), body: { note: 'Changed my mind' },
    });

    assert.equal(response.status, 200);
    assert.equal(stripeState.sessions[0].status, 'expired');
    assert.equal(tables.orders[0].status, 'cancelled');
    assert.equal(tables.product_variants[0].stock_quantity, 3);
  });

  it('lets admins issue bounded partial and full refunds and blocks customer refund access', async () => {
    tables.payments.push({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', order_id: ids.aliceOrder,
      amount_cents: 1250, currency: 'usd', payment_status: 'succeeded',
      stripe_payment_intent_id: 'pi_test_paid',
    });
    const paymentId = tables.payments[0].id;
    const customer = await request('POST', '/api/admin/payments/' + paymentId + '/refunds', {
      token: tokenFor(ids.alice), idempotencyKey: 'aaaaaaaa-0000-4000-8000-000000000002', body: { amount_cents: 500 },
    });
    const partial = await request('POST', '/api/admin/payments/' + paymentId + '/refunds', {
      token: tokenFor(ids.alice, 'admin'), idempotencyKey: 'aaaaaaaa-0000-4000-8000-000000000003', body: { amount_cents: 500 },
    });
    const fullRemainder = await request('POST', '/api/admin/payments/' + paymentId + '/refunds', {
      token: tokenFor(ids.alice, 'admin'), idempotencyKey: 'aaaaaaaa-0000-4000-8000-000000000004', body: {},
    });

    assert.equal(customer.status, 403);
    assert.equal(partial.status, 201);
    assert.equal(partial.body.payment_status, 'partially_refunded');
    assert.equal(fullRemainder.status, 201);
    assert.equal(fullRemainder.body.payment_status, 'refunded');
    assert.deepEqual(stripeState.refunds.map((refund) => refund.amount), [500, 750]);

    const latePendingEvent = {
      id: 'evt_refund_pending_late', type: 'refund.updated',
      data: { object: {
        id: stripeState.refunds[0].id, status: 'pending',
        metadata: { payment_refund_id: tables.payment_refunds[0].id },
      } },
    };
    const webhook = await request('POST', '/api/payments/stripe/webhook', {
      rawBody: JSON.stringify(latePendingEvent), signature: 'test-signature',
    });
    assert.equal(webhook.status, 200);
    assert.equal(tables.payment_refunds[0].refund_status, 'succeeded');
    assert.equal(tables.payments[0].payment_status, 'refunded');
  });

  it('allows admins to list and inspect payments without exposing payments to customers', async () => {
    tables.payments.push({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', order_id: ids.aliceOrder, amount_cents: 1250, currency: 'usd', payment_status: 'succeeded' });
    const customer = await request('GET', '/api/admin/payments', { token: tokenFor(ids.alice) });
    const list = await request('GET', '/api/admin/payments?page=1&limit=10', { token: tokenFor(ids.alice, 'admin') });
    const detail = await request('GET', '/api/admin/payments/' + tables.payments[0].id, { token: tokenFor(ids.alice, 'admin') });

    assert.equal(customer.status, 403);
    assert.equal(list.status, 200);
    assert.equal(list.body.total, 1);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.payment.order_id, ids.aliceOrder);
  });

  it('blocks admin order processing until a payment is confirmed', async () => {
    const response = await request('PATCH', '/api/admin/orders/' + ids.aliceOrder + '/status', {
      token: tokenFor(ids.alice, 'admin'), body: { status: 'processing' },
    });

    assert.equal(response.status, 409);
    assert.equal(tables.orders[0].status, 'pending');
  });
});

describe('admin inventory management', () => {
  it('requires admin access and validates adjustment payloads', async () => {
    const anonymous = await request('GET', '/api/inventory');
    const customer = await request('GET', '/api/inventory', { token: tokenFor(ids.alice) });
    const invalid = await request('POST', '/api/inventory/not-a-uuid/adjustments', {
      token: tokenFor(ids.alice, 'admin'), body: { change_type: 'add', quantity: 2 },
    });
    assert.equal(anonymous.status, 401);
    assert.equal(customer.status, 403);
    assert.equal(invalid.status, 400);
  });

  it('allows admin to add stock and records the actor in movement history', async () => {
    const response = await request('POST', '/api/inventory/' + ids.variant + '/adjustments', {
      token: tokenFor(ids.alice, 'admin'),
      body: { change_type: 'add', quantity: 5, note: 'Restock' },
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.stock_quantity, 7);
    assert.equal(tables.inventory_movements[0].actor_id, ids.alice);
  });

  it('lets admins view exact inventory and paginated adjustment history', async () => {
    const admin = tokenFor(ids.alice, 'admin');
    const inventory = await request('GET', '/api/inventory?page=1&limit=10', { token: admin });
    assert.equal(inventory.status, 200);
    assert.equal(inventory.body.inventory[0].stock_quantity, 2);
    tables.inventory_movements = [{ id: crypto.randomUUID(), variant_id: ids.variant, change_type: 'add', quantity: 2, actor_id: ids.alice, created_at: new Date().toISOString() }];
    const history = await request('GET', '/api/inventory/' + ids.variant + '/adjustments', { token: admin });
    assert.equal(history.status, 200);
    assert.equal(history.body.movements.length, 1);
  });
});
