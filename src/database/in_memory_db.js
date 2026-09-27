/**
 * In-Memory SQL Execution Engine for SaaS Demo DB
 * Uses sql.js (WebAssembly SQLite) to genuinely execute queries against the seeded database.
 * Never fabricates results: genuine execution or clear descriptive error.
 */

const initSqlJs = require('sql.js');
const { SEED_CUSTOMERS, SEED_ORDERS, SEED_SUBSCRIPTIONS, SEED_EVENTS } = require('./seed_data');

let dbInstance = null;
let SQLModule = null;

async function getDatabase() {
  if (dbInstance) return dbInstance;

  SQLModule = await initSqlJs();
  const db = new SQLModule.Database();

  // 1. Create Tables
  db.run(`
    CREATE TABLE customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      plan TEXT CHECK (plan IN ('starter','professional','enterprise','trial')),
      mrr REAL DEFAULT 0,
      status TEXT CHECK (status IN ('active','churned','paused')),
      created_at TEXT
    );

    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      amount REAL DEFAULT 0,
      ordered_at TEXT,
      product TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE subscriptions (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      plan TEXT,
      started_at TEXT,
      cancelled_at TEXT,
      churned INTEGER DEFAULT 0,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE events (
      customer_id TEXT,
      event_type TEXT,
      occurred_at TEXT,
      properties TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
  `);

  // 2. Register Custom Helper Functions for PostgreSQL compatibility
  db.create_function('now', () => '2024-11-30 12:00:00');
  
  db.create_function('age', (d1, d2) => {
    if (!d1 || !d2) return 0;
    const t1 = new Date(d1).getTime();
    const t2 = new Date(d2).getTime();
    const diffMonths = Math.floor((t1 - t2) / (1000 * 60 * 60 * 24 * 30.4375));
    return diffMonths;
  });

  db.create_function('date_part', (part, val) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const d = new Date(val);
    if (part === 'month') return d.getMonth() + 1;
    if (part === 'year') return d.getFullYear();
    if (part === 'day') return d.getDate();
    return 0;
  });

  db.create_function('date_trunc', (part, val) => {
    if (!val) return null;
    const d = new Date(val);
    if (part === 'month') {
      const month = String(d.getMonth() + 1).padStart(2, '0');
      return `${d.getFullYear()}-${month}-01 00:00:00`;
    }
    return val;
  });

  db.create_function('to_char', (val, fmt) => {
    if (!val) return '';
    const d = new Date(val);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  });

  db.create_function('concat', (...args) => args.join(''));

  // 3. Seed Tables
  const insertCustomer = db.prepare('INSERT INTO customers VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const c of SEED_CUSTOMERS) {
    insertCustomer.run([c.id, c.name, c.email, c.plan, c.mrr, c.status, c.created_at]);
  }
  insertCustomer.free();

  const insertOrder = db.prepare('INSERT INTO orders VALUES (?, ?, ?, ?, ?)');
  for (const o of SEED_ORDERS) {
    insertOrder.run([o.id, o.customer_id, o.amount, o.ordered_at, o.product]);
  }
  insertOrder.free();

  const insertSub = db.prepare('INSERT INTO subscriptions VALUES (?, ?, ?, ?, ?, ?)');
  for (const s of SEED_SUBSCRIPTIONS) {
    insertSub.run([s.id, s.customer_id, s.plan, s.started_at, s.cancelled_at, s.churned ? 1 : 0]);
  }
  insertSub.free();

  const insertEvent = db.prepare('INSERT INTO events VALUES (?, ?, ?, ?)');
  for (const e of SEED_EVENTS) {
    insertEvent.run([e.customer_id, e.event_type, e.occurred_at, e.properties]);
  }
  insertEvent.free();

  dbInstance = db;
  return dbInstance;
}

/**
 * Normalizes PostgreSQL query to SQLite dialect safely where direct translation is possible
 */
function normalizePostgreSqlToSqlite(sql) {
  let s = sql.trim();
  
  // Remove markdown code fences if present
  s = s.replace(/```(?:sql|postgresql)?/gi, '').replace(/```/g, '').trim();

  // Normalize boolean true / false for subscriptions.churned
  s = s.replace(/\b(s\.churned|churned)\s*=\s*true\b/gi, '$1 = 1');
  s = s.replace(/\b(s\.churned|churned)\s*=\s*false\b/gi, '$1 = 0');

  // Normalize NOW() - INTERVAL '30 days'
  s = s.replace(/NOW\(\)\s*-\s*INTERVAL\s*['"]30\s*days?['"]/gi, "datetime('2024-11-30 12:00:00', '-30 days')");
  s = s.replace(/NOW\(\)\s*-\s*INTERVAL\s*['"]6\s*months?['"]/gi, "datetime('2024-11-30 12:00:00', '-6 months')");
  s = s.replace(/NOW\(\)/gi, "'2024-11-30 12:00:00'");

  return s;
}

/**
 * Executes a SELECT query against the seeded in-memory database.
 * Never fabricates results.
 */
async function executeQuery(rawSql) {
  try {
    const db = await getDatabase();
    const normalized = normalizePostgreSqlToSqlite(rawSql);

    const results = db.exec(normalized);

    if (!results || results.length === 0) {
      return {
        success: true,
        columns: [],
        rows: [],
        rowCount: 0,
        live: true,
        empty: true
      };
    }

    const { columns, values } = results[0];
    const formattedRows = values.map(row => 
      row.map(cell => {
        if (cell === null || cell === undefined) return 'NULL';
        if (typeof cell === 'number') {
          return Number.isInteger(cell) ? cell.toString() : cell.toFixed(2);
        }
        return String(cell);
      })
    );

    return {
      success: true,
      columns,
      rows: formattedRows,
      rowCount: formattedRows.length,
      live: true
    };
  } catch (err) {
    return {
      success: false,
      error: `Execution note: ${err.message}`,
      live: false
    };
  }
}

module.exports = {
  getDatabase,
  executeQuery,
  normalizePostgreSqlToSqlite
};
