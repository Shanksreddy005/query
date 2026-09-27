const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateSql, FORBIDDEN_COMMANDS } = require('../src/security/sql_guard');

describe('SQL Guard & Security Validator', () => {
  it('permits valid SELECT queries', () => {
    const query = 'SELECT id, name, plan FROM customers WHERE status = \'active\' ORDER BY mrr DESC LIMIT 5;';
    const res = validateSql(query);
    assert.equal(res.valid, true);
    assert.ok(res.sanitizedSql.includes('SELECT'));
  });

  it('permits valid WITH CTE queries', () => {
    const query = `
      WITH active_subs AS (
        SELECT customer_id FROM subscriptions WHERE churned = false
      )
      SELECT c.name FROM customers c JOIN active_subs a ON a.customer_id = c.id;
    `;
    const res = validateSql(query);
    assert.equal(res.valid, true);
  });

  it('rejects destructive SQL statements (DROP, DELETE, TRUNCATE, ALTER, INSERT, UPDATE)', () => {
    const destructiveQueries = [
      'DROP TABLE customers;',
      'DELETE FROM orders WHERE id = 1;',
      'TRUNCATE TABLE subscriptions;',
      'ALTER TABLE customers DROP COLUMN mrr;',
      'INSERT INTO customers (name) VALUES (\'Hacked\');',
      'UPDATE customers SET mrr = 999999;'
    ];

    for (const q of destructiveQueries) {
      const res = validateSql(q);
      assert.equal(res.valid, false, `Expected query to be rejected: ${q}`);
      assert.match(res.error, /Security violation|Only SELECT/i);
    }
  });

  it('rejects forbidden administrative and privilege commands', () => {
    const adminQueries = [
      'GRANT ALL ON customers TO public;',
      'REVOKE SELECT ON customers FROM analyst;',
      'EXEC sp_executesql N\'SELECT 1\';',
      'CALL some_stored_procedure();',
      'CREATE TABLE backdoors (id int);'
    ];

    for (const q of adminQueries) {
      const res = validateSql(q);
      assert.equal(res.valid, false, `Expected admin command to be rejected: ${q}`);
    }
  });

  it('rejects chained SQL statements (SQL injection attempt)', () => {
    const chained = 'SELECT * FROM customers; DROP TABLE orders;';
    const res = validateSql(chained);
    assert.equal(res.valid, false);
    assert.match(res.error, /Multiple SQL statements detected|Security violation/i);
  });

  it('rejects queries referencing unauthorized tables outside SaaS Demo DB', () => {
    const unauthorized = 'SELECT * FROM users WHERE is_admin = true;';
    const res = validateSql(unauthorized);
    assert.equal(res.valid, false);
    assert.match(res.error, /unauthorized table/i);
  });

  it('rejects empty or null queries safely', () => {
    assert.equal(validateSql('').valid, false);
    assert.equal(validateSql(null).valid, false);
    assert.equal(validateSql('   ').valid, false);
  });
});
