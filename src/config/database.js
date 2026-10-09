const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('Missing DATABASE_URL for PostgreSQL connection.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ...(process.env.PGSSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
});

const quoteIdentifier = (value) => {
  if (typeof value !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error('Invalid SQL identifier');
  }
  return `"${value}"`;
};

class QueryBuilder {
  constructor(table) {
    this.table = `public.${quoteIdentifier(table)}`;
    this.operation = 'select';
    this.columns = '*';
    this.payload = null;
    this.filters = [];
    this.orderBy = null;
    this.window = null;
    this.returning = false;
    this.countRequested = false;
    this.cardinality = null;
  }

  select(columns = '*', options = {}) {
    this.columns = columns === '*' ? '*' : columns.split(',').map((item) => quoteIdentifier(item.trim())).join(', ');
    this.returning = true;
    this.countRequested = options.count === 'exact';
    return this;
  }

  insert(rows) {
    this.operation = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
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
    this.filters.push([quoteIdentifier(column), value]);
    return this;
  }

  order(column, options = {}) {
    this.orderBy = `${quoteIdentifier(column)} ${options.ascending === false ? 'DESC' : 'ASC'}`;
    return this;
  }

  range(from, to) {
    this.window = [from, to];
    return this;
  }

  single() { this.cardinality = 'single'; return this; }
  maybeSingle() { this.cardinality = 'maybeSingle'; return this; }

  whereSql(values) {
    if (!this.filters.length) return '';
    return ' WHERE ' + this.filters.map(([column, value]) => {
      values.push(value);
      return `${column} = $${values.length}`;
    }).join(' AND ');
  }

  async run() {
    try {
      const values = [];
      let sql;
      let count = null;

      if (this.operation === 'select') {
        const where = this.whereSql(values);
        if (this.countRequested) {
          const countResult = await pool.query(`SELECT COUNT(*)::integer AS count FROM ${this.table}${where}`, values);
          count = countResult.rows[0]?.count || 0;
        }
        sql = `SELECT ${this.columns} FROM ${this.table}${where}`;
        if (this.orderBy) sql += ` ORDER BY ${this.orderBy}`;
        if (this.window) {
          values.push(this.window[1] - this.window[0] + 1, this.window[0]);
          sql += ` LIMIT $${values.length - 1} OFFSET $${values.length}`;
        }
      } else if (this.operation === 'insert') {
        if (!this.payload.length) return { data: [], error: null, count };
        const keys = Object.keys(this.payload[0]);
        if (!keys.length || this.payload.some((row) => Object.keys(row).some((key) => !keys.includes(key)))) {
          throw new Error('Insert rows must have matching columns');
        }
        const columns = keys.map(quoteIdentifier).join(', ');
        const tuples = this.payload.map((row) => `(${keys.map((key) => {
          values.push(row[key]);
          return `$${values.length}`;
        }).join(', ')})`).join(', ');
        sql = `INSERT INTO ${this.table} (${columns}) VALUES ${tuples}`;
        if (this.returning) sql += ` RETURNING ${this.columns}`;
      } else if (this.operation === 'update') {
        if (!this.filters.length) throw new Error('Update queries require at least one filter');
        const entries = Object.entries(this.payload || {});
        if (!entries.length) throw new Error('Update payload must not be empty');
        const assignments = entries.map(([key, value]) => {
          values.push(value);
          return `${quoteIdentifier(key)} = $${values.length}`;
        }).join(', ');
        sql = `UPDATE ${this.table} SET ${assignments}${this.whereSql(values)}`;
        if (this.returning) sql += ` RETURNING ${this.columns}`;
      } else {
        if (!this.filters.length) throw new Error('Delete queries require at least one filter');
        sql = `DELETE FROM ${this.table}${this.whereSql(values)}`;
        if (this.returning) sql += ` RETURNING ${this.columns}`;
      }

      const result = await pool.query(sql, values);
      let data = this.operation === 'select' || this.returning ? result.rows : null;
      if (this.cardinality === 'single') {
        if (!data || data.length !== 1) throw new Error('Expected exactly one row');
        data = data[0];
      } else if (this.cardinality === 'maybeSingle') {
        if (data && data.length > 1) throw new Error('Expected at most one row');
        data = data?.[0] || null;
      }
      return { data, error: null, count: this.countRequested ? count : null };
    } catch (error) {
      return { data: null, error, count: null };
    }
  }

  then(resolve, reject) { return this.run().then(resolve, reject); }
}

exports.from = (table) => new QueryBuilder(table);
exports.query = (text, values = []) => pool.query(text, values);
exports.connect = () => pool.connect();
exports.rpc = async (name, args = {}) => {
  try {
    const functionName = quoteIdentifier(name);
    const values = Object.values(args);
    const parameters = values.map((_, index) => `$${index + 1}`).join(', ');
    const result = await pool.query(`SELECT public.${functionName}(${parameters}) AS data`, values);
    return { data: result.rows[0]?.data ?? null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};
exports.checkConnection = async () => {
  await pool.query('SELECT 1');
  return true;
};
exports.end = () => pool.end();
