const { after, before, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const jwt = require('jsonwebtoken');

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
      tables.order_items.push(...orderItems.map((item) => ({ id: crypto.randomUUID(), order_id: order.id, variant_id: item.variant_id, quantity: item.quantity, price: item.price })));
      tables.cart_items = tables.cart_items.filter((row) => row.cart_id !== cart.id);
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
const app = require('../src/app');
let server;
let baseUrl;

const tokenFor = (id, role = 'customer') =>
  jwt.sign({ id, role }, process.env.JWT_SECRET);

async function request(method, endpoint, options = {}) {
  const headers = {};
  if (options.token) headers.authorization = 'Bearer ' + options.token;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(baseUrl + endpoint, {
    method,
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
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
