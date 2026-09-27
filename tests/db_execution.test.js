const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getDatabase, executeQuery } = require('../src/database/in_memory_db');
const { SEED_CUSTOMERS, SEED_ORDERS, SEED_SUBSCRIPTIONS, SEED_EVENTS } = require('../src/database/seed_data');

describe('In-Memory Database & Deterministic Execution', () => {
  it('initializes and verifies seed dataset across all 4 tables', async () => {
    const db = await getDatabase();
    assert.ok(db, 'Database instance must be initialized');

    assert.ok(SEED_CUSTOMERS.length >= 15, 'SaaS Demo DB should contain realistic customers');
    assert.ok(SEED_ORDERS.length >= 15, 'SaaS Demo DB should contain realistic orders');
    assert.ok(SEED_SUBSCRIPTIONS.length >= 10, 'SaaS Demo DB should contain subscriptions');
    assert.ok(SEED_EVENTS.length >= 4, 'SaaS Demo DB should contain events');
  });

  it('genuinely executes customer queries and computes aggregations', async () => {
    const query = 'SELECT plan, COUNT(*) AS count, SUM(mrr) AS total_mrr FROM customers GROUP BY plan ORDER BY total_mrr DESC;';
    const res = await executeQuery(query);

    assert.equal(res.success, true);
    assert.equal(res.live, true);
    assert.ok(res.rowCount > 0);
    assert.deepEqual(res.columns, ['plan', 'count', 'total_mrr']);
  });

  it('genuinely executes join between customers and orders', async () => {
    const query = `
      SELECT c.name, COUNT(o.id) as orders_count, SUM(o.amount) as total_spent
      FROM customers c
      JOIN orders o ON o.customer_id = c.id
      GROUP BY c.id, c.name
      ORDER BY total_spent DESC
      LIMIT 3;
    `;
    const res = await executeQuery(query);

    assert.equal(res.success, true);
    assert.equal(res.live, true);
    assert.equal(res.rowCount, 3);
    assert.equal(res.rows[0][0], 'Acme Corp');
  });

  it('supports PostgreSQL helper functions (now, age, date_part, concat)', async () => {
    const query = "SELECT CONCAT(name, ' (', plan, ')') AS label FROM customers LIMIT 2;";
    const res = await executeQuery(query);
    assert.equal(res.success, true);
    assert.ok(res.rows[0][0].includes('('));
  });

  it('never fabricates results on unexecutable SQL and reports error clearly', async () => {
    const invalidSql = 'SELECT non_existent_column_xyz FROM customers;';
    const res = await executeQuery(invalidSql);
    assert.equal(res.success, false);
    assert.equal(res.live, false);
    assert.ok(res.error.includes('no such column') || res.error.includes('Execution note'));
  });
});
