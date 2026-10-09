require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const database = require('../src/config/database');

const migrationDirectory = path.resolve(__dirname, '../database/migrations');

async function migrate() {
  await database.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await fs.readdir(migrationDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const name of files) {
    const { rows } = await database.query(
      'SELECT 1 FROM public.schema_migrations WHERE name = $1',
      [name],
    );
    if (rows.length) continue;

    const sql = await fs.readFile(path.join(migrationDirectory, name), 'utf8');
    const client = await database.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO public.schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  console.log('PostgreSQL migrations are up to date.');
}

migrate()
  .catch((error) => {
    console.error('PostgreSQL migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => database.end());
