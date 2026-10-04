import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDuckDB } from '../src/duckdb/init.js';
import { loadCsvIntoDuckDB } from '../src/duckdb/csv_loader.js';
import { executeQuery } from '../src/duckdb/executor.js';
import path from 'node:path';

describe('Five Representative Analytical Queries on DuckDB', () => {
  async function ensureDataset() {
    const { db, conn } = await getDuckDB();
    const csvPath = path.resolve('sample-data/customers.csv');
    await loadCsvIntoDuckDB({
      db,
      conn,
      source: csvPath,
      filename: 'customers.csv'
    });
  }

  before(async () => {
    await ensureDataset();
  });

  beforeEach(async () => {
    await ensureDataset();
  });

  test('Query 1: Customers who cancelled their subscription', async () => {
    const { conn } = await getDuckDB();
    const sql = `
      SELECT customer_name, plan, mrr, cancelled_at
      FROM customers
      WHERE cancelled_at IS NOT NULL
      ORDER BY mrr DESC;
    `;
    const res = await executeQuery(conn, sql, ['customers']);
    assert.equal(res.success, true);
    assert.ok(res.rows.length >= 8, 'Should find churned customers with cancellation dates');
    assert.equal(res.rows[0][0], 'Pinnacle AI'); // $6,100 MRR lost
  });

  test('Query 2: Plan with the highest average MRR', async () => {
    const { conn } = await getDuckDB();
    const sql = `
      SELECT plan, COUNT(*) AS customers, ROUND(AVG(mrr), 2) AS avg_mrr, ROUND(SUM(mrr), 2) AS total_mrr
      FROM customers
      WHERE status = 'active'
      GROUP BY plan
      ORDER BY avg_mrr DESC;
    `;
    const res = await executeQuery(conn, sql, ['customers']);
    assert.equal(res.success, true);
    assert.equal(res.rows[0][0], 'enterprise'); // Enterprise has highest average MRR
    assert.ok(Number(res.rows[0][2]) > 5000);
  });

  test('Query 3: Active customer count and distribution by plan', async () => {
    const { conn } = await getDuckDB();
    const sql = `
      SELECT plan, COUNT(*) AS active_count
      FROM customers
      WHERE status = 'active'
      GROUP BY plan
      ORDER BY active_count DESC;
    `;
    const res = await executeQuery(conn, sql, ['customers']);
    assert.equal(res.success, true);
    assert.ok(res.rows.length >= 4, 'Should list enterprise, professional, starter, trial');
  });

  test('Query 4: Active high-value accounts exceeding $5,000 MRR', async () => {
    const { conn } = await getDuckDB();
    const sql = `
      SELECT customer_name, plan, mrr, country
      FROM customers
      WHERE status = 'active' AND mrr > 5000
      ORDER BY mrr DESC;
    `;
    const res = await executeQuery(conn, sql, ['customers']);
    assert.equal(res.success, true);
    assert.ok(res.rows.length >= 5, 'Should identify top accounts (> $5,000)');
    assert.equal(res.rows[0][0], 'Acme Corp');
    assert.equal(res.rows[0][2], '8200');
  });

  test('Query 5: Top countries by total revenue and account volume', async () => {
    const { conn } = await getDuckDB();
    const sql = `
      SELECT country, COUNT(*) AS accounts, ROUND(SUM(mrr), 2) AS total_revenue
      FROM customers
      GROUP BY country
      ORDER BY total_revenue DESC
      LIMIT 5;
    `;
    const res = await executeQuery(conn, sql, ['customers']);
    assert.equal(res.success, true);
    assert.equal(res.rows.length, 5);
    assert.equal(res.rows[0][0], 'US'); // US generates most revenue
  });
});
