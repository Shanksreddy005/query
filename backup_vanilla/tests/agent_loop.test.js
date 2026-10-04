import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_AGENT_ROUNDS } from '../src/agent/agent_loop.js';
import { RUN_SQL_TOOL } from '../src/agent/tools.js';
import { buildSystemPrompt } from '../src/agent/prompts.js';
import { executeQuery } from '../src/duckdb/executor.js';
import { getDuckDB } from '../src/duckdb/init.js';
import { loadCsvIntoDuckDB } from '../src/duckdb/csv_loader.js';
import path from 'node:path';

describe('Client-Side Tool-Based Agent Loop & Error Correction', async () => {
  test('RUN_SQL_TOOL conforms to Anthropic tool use specification', () => {
    assert.equal(RUN_SQL_TOOL.name, 'run_sql');
    assert.equal(RUN_SQL_TOOL.input_schema.type, 'object');
    assert.ok(RUN_SQL_TOOL.input_schema.properties.query);
    assert.deepEqual(RUN_SQL_TOOL.input_schema.required, ['query']);
  });

  test('buildSystemPrompt injects dynamic schema and DuckDB dialect rules', () => {
    const datasetInfo = {
      tableName: 'customers',
      totalRows: 55,
      columns: [
        { name: 'customer_id', type: 'VARCHAR', nullable: false },
        { name: 'mrr', type: 'DOUBLE', nullable: true }
      ],
      sampleRows: [{ customer_id: 'c101', mrr: 8200.0 }]
    };

    const prompt = buildSystemPrompt(datasetInfo);
    assert.match(prompt, /DuckDB-WASM/);
    assert.match(prompt, /Active Table Name: "customers"/);
    assert.match(prompt, /customer_id \(VARCHAR\)/);
    assert.match(prompt, /mrr \(DOUBLE, nullable\)/);
    assert.match(prompt, /c101/);
    assert.match(prompt, /run_sql/);
  });

  test('MAX_AGENT_ROUNDS enforces a hard limit of 5 turns', () => {
    assert.equal(MAX_AGENT_ROUNDS, 5, 'Hard limit must be exactly 5 rounds');
  });

  test('simulates SQL error detection and error response payload for correction', async () => {
    const { db, conn } = await getDuckDB();
    await loadCsvIntoDuckDB({
      db,
      conn,
      source: path.resolve('sample-data/customers.csv'),
      filename: 'customers.csv'
    });

    // Erroneous SQL (referencing a non-existent column "non_existent_column")
    const badSql = 'SELECT non_existent_column FROM customers;';
    const errRes = await executeQuery(conn, badSql, ['customers']);

    assert.equal(errRes.success, false);
    assert.ok(errRes.error, 'Must report error message for Claude to self-correct');

    // Simulate corrected SQL
    const correctedSql = 'SELECT customer_name, mrr FROM customers ORDER BY mrr DESC LIMIT 1;';
    const fixRes = await executeQuery(conn, correctedSql, ['customers']);

    assert.equal(fixRes.success, true);
    assert.equal(fixRes.rows.length, 1);
    assert.equal(fixRes.rows[0][0], 'Acme Corp');
  });
});
