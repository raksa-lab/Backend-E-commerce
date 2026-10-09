const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const poolPath = require.resolve('pg');
const databasePath = path.resolve(__dirname, '../src/config/database.js');
const calls = [];
class FakePool {
  constructor(options) { this.options = options; }
  async query(text, values) {
    calls.push({ text, values });
    if (text.startsWith('SELECT public.')) return { rows: [{ data: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } }], rowCount: 1 };
    return { rows: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }], rowCount: 1 };
  }
  async end() {}
}

before(() => {
  process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:5432/testdb';
  require.cache[poolPath] = {
    id: poolPath, filename: poolPath, loaded: true,
    exports: { Pool: FakePool }, children: [], paths: [],
  };
  delete require.cache[databasePath];
});

after(() => {
  delete require.cache[databasePath];
  delete require.cache[poolPath];
  delete process.env.DATABASE_URL;
});

describe('PostgreSQL data access', () => {
  it('runs parameterized CRUD queries through the pg pool', async () => {
    const db = require(databasePath);
    const result = await db.from('user_addresses')
      .update({ city: 'Phnom Penh' }).eq('id', '11111111-1111-4111-8111-111111111111')
      .eq('user_id', '22222222-2222-4222-8222-222222222222').select('*');

    assert.deepEqual(result.data, [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }]);
    assert.equal(calls.at(-1).text, 'UPDATE public."user_addresses" SET "city" = $1 WHERE "id" = $2 AND "user_id" = $3 RETURNING *');
    assert.deepEqual(calls.at(-1).values, ['Phnom Penh', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']);
  });

  it('rejects unsafe table and column identifiers before querying', async () => {
    const db = require(databasePath);
    assert.throws(() => db.from('users; DROP TABLE users'), /Invalid SQL identifier/);
    assert.throws(() => db.from('users').select('*').eq('id = 1 OR 1', 'x'), /Invalid SQL identifier/);
    assert.equal((await db.from('users').update({ role: 'admin' })).error.message, 'Update queries require at least one filter');
    assert.equal((await db.from('users').delete()).error.message, 'Delete queries require at least one filter');
  });

  it('calls Postgres functions using positional parameters', async () => {
    const db = require(databasePath);
    const result = await db.rpc('checkout_order', {
      p_user_id: '11111111-1111-4111-8111-111111111111',
      p_address_id: '22222222-2222-4222-8222-222222222222',
    });
    assert.equal(result.data.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    assert.equal(calls.at(-1).text, 'SELECT public."checkout_order"($1, $2) AS data');
  });

  it('loads the full model registry without Supabase or Sequelize', () => {
    const models = require('../src/models');
    assert.ok(models.User);
    assert.ok(models.InventoryMovement);
    assert.ok(models.Payment);
  });
});
