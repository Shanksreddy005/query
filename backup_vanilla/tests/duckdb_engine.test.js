import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getDuckDB, resetDatabase } from '../src/duckdb/init.js';
import { loadCsvIntoDuckDB, clearActiveDataset } from '../src/duckdb/csv_loader.js';
import { extractSchema } from '../src/duckdb/schema.js';
import { executeQuery, MAX_CLAUDE_ROWS, MAX_DISPLAY_ROWS } from '../src/duckdb/executor.js';
import fs from 'node:fs';
import path from 'node:path';

describe('DuckDB Ingestion & Execution Engine', async () => {
  test('initializes DuckDB connection pool successfully', async () => {
    const { db, conn } = await getDuckDB();
    assert.ok(db, 'Database instance should be initialized');
    assert.ok(conn, 'Database connection should be active');
    const res = await conn.query('SELECT 42 AS answer;');
    const rows = res.toArray ? res.toArray() : res;
    assert.equal(rows[0].answer, 42);
  });

  test('loads sample CSV and creates in-memory analytical table', async () => {
    const { db, conn } = await getDuckDB();
    const csvPath = path.resolve('sample-data/customers.csv');
    assert.ok(fs.existsSync(csvPath), 'sample-data/customers.csv must exist');

    const result = await loadCsvIntoDuckDB({
      db,
      conn,
      source: csvPath,
      filename: 'customers.csv'
    });

    assert.equal(result.tableName, 'customers');
    assert.ok(result.rowCount > 50, `Row count should be > 50, got ${result.rowCount}`);
  });

  test('dynamically extracts schema with column names, types, and nullability', async () => {
    const { conn } = await getDuckDB();
    const schema = await extractSchema(conn, 'customers');

    assert.equal(schema.tableName, 'customers');
    assert.ok(schema.columns.length >= 7, 'Should have at least 7 columns');

    const colNames = schema.columns.map(c => c.name);
    assert.ok(colNames.includes('customer_id'), 'Schema must include customer_id');
    assert.ok(colNames.includes('customer_name'), 'Schema must include customer_name');
    assert.ok(colNames.includes('plan'), 'Schema must include plan');
    assert.ok(colNames.includes('status'), 'Schema must include status');
    assert.ok(colNames.includes('mrr'), 'Schema must include mrr');

    // Sample rows inspection
    assert.equal(schema.sampleRows.length, 5, 'Sample rows must contain exactly 5 rows');
    assert.equal(schema.sampleRows[0].customer_id, 'c101');
    assert.equal(schema.sampleRows[0].customer_name, 'Acme Corp');
  });

  test('genuinely executes analytical SQL queries against DuckDB', async () => {
    const { conn } = await getDuckDB();
    const query = `
      SELECT plan, COUNT(*) AS count, ROUND(AVG(mrr), 2) AS avg_mrr
      FROM customers
      WHERE status = 'active'
      GROUP BY plan
      ORDER BY avg_mrr DESC;
    `;

    const res = await executeQuery(conn, query, ['customers']);
    assert.equal(res.success, true);
    assert.ok(res.rows.length > 0, 'Should return aggregated rows');
    assert.ok(res.executionTimeMs >= 0, 'Should measure execution latency');
    assert.deepEqual(res.columns, ['plan', 'count', 'avg_mrr']);
  });

  test('handles empty results and handles NULL values cleanly', async () => {
    const { conn } = await getDuckDB();
    const query = `SELECT * FROM customers WHERE status = 'non_existent_status';`;
    const res = await executeQuery(conn, query, ['customers']);

    assert.equal(res.success, true);
    assert.equal(res.totalRowCount, 0);
    assert.equal(res.rows.length, 0);
  });

  test('replaces active dataset and drops previous table', async () => {
    const { db, conn } = await getDuckDB();

    // Create a mini secondary CSV
    const miniCsv = `id,product,price\n1,Widget,19.99\n2,Gadget,29.99\n`;
    const result = await loadCsvIntoDuckDB({
      db,
      conn,
      source: miniCsv,
      filename: 'inventory.csv'
    });

    assert.equal(result.tableName, 'inventory');
    assert.equal(result.rowCount, 2);

    const schema = await extractSchema(conn, 'inventory');
    assert.equal(schema.tableName, 'inventory');
    assert.equal(schema.columns.length, 3);

    // Clean up
    await clearActiveDataset(conn);
  });
});
