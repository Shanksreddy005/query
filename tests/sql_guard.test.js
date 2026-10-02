import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateSql, FORBIDDEN_COMMANDS } from '../src/security/sql_guard.js';

describe('SQL Guard & SELECT-Only Validator', () => {
  test('permits valid analytical SELECT queries', () => {
    const q1 = 'SELECT name, plan, mrr FROM customers WHERE status = "active" ORDER BY mrr DESC LIMIT 5;';
    const res1 = validateSql(q1);
    assert.equal(res1.valid, true);

    const q2 = `
      -- Top 5 customers by revenue
      SELECT customer_name, SUM(amount) AS total
      FROM orders
      GROUP BY customer_name
      HAVING SUM(amount) > 1000;
    `;
    const res2 = validateSql(q2);
    assert.equal(res2.valid, true);
  });

  test('permits complex WITH CTE queries', () => {
    const cte = `
      WITH churn_summary AS (
        SELECT plan, COUNT(*) AS churn_count
        FROM customers
        WHERE cancelled_at IS NOT NULL
        GROUP BY plan
      )
      SELECT plan, churn_count
      FROM churn_summary
      ORDER BY churn_count DESC;
    `;
    const res = validateSql(cte);
    assert.equal(res.valid, true);
  });

  test('rejects destructive SQL statements (DROP, DELETE, TRUNCATE, ALTER, INSERT, UPDATE, CREATE)', () => {
    const badQueries = [
      'DROP TABLE customers;',
      'DELETE FROM customers WHERE id = 1;',
      'TRUNCATE customers;',
      'ALTER TABLE customers DROP COLUMN mrr;',
      'INSERT INTO customers (id, name) VALUES (999, "Hacker");',
      'UPDATE customers SET mrr = 0;',
      'CREATE TABLE hacked (id INT);'
    ];

    for (const q of badQueries) {
      const res = validateSql(q);
      assert.equal(res.valid, false, `Should reject: ${q}`);
      assert.match(res.error, /Security violation|Only SELECT queries are permitted/);
    }
  });

  test('rejects DuckDB administrative and filesystem operations (COPY, EXPORT, INSTALL, LOAD, PRAGMA, ATTACH)', () => {
    const adminQueries = [
      'COPY customers TO "out.csv";',
      'EXPORT DATABASE "dump";',
      'INSTALL spatial;',
      'LOAD spatial;',
      'PRAGMA show_tables;',
      'ATTACH "other.db";',
      'CALL system_info();'
    ];

    for (const q of adminQueries) {
      const res = validateSql(q);
      assert.equal(res.valid, false, `Should reject admin command: ${q}`);
      assert.match(res.error, /Security violation/);
    }
  });

  test('rejects statement chaining and SQL injection attempts', () => {
    const chained = [
      'SELECT 1; DROP TABLE customers;',
      'SELECT * FROM customers; DELETE FROM customers;',
      'SELECT id FROM customers; UPDATE customers SET mrr = 999999;'
    ];

    for (const q of chained) {
      const res = validateSql(q);
      assert.equal(res.valid, false, `Should reject chained statement: ${q}`);
      assert.match(res.error, /Multiple SQL statements detected|Security violation/);
    }
  });

  test('rejects empty or null inputs gracefully', () => {
    assert.equal(validateSql('').valid, false);
    assert.equal(validateSql(null).valid, false);
    assert.equal(validateSql('   ').valid, false);
    assert.equal(validateSql(undefined).valid, false);
  });
});
