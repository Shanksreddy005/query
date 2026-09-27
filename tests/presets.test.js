const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { PRESETS, findPreset } = require('../src/pipeline/presets');
const { runPipeline } = require('../src/pipeline/router');

describe('Five DOCX Golden Queries (Acceptance Criteria)', () => {
  it('contains all 5 predefined example queries with complete metadata', () => {
    assert.equal(PRESETS.length, 5);
    const ids = PRESETS.map(p => p.id);
    assert.deepEqual(ids, ['revenue', 'churn', 'mrr', 'trial', 'growth']);
  });

  it('Golden Query 1: Top 5 customers by total revenue last quarter', async () => {
    const q = 'Show me the top 5 customers by total revenue last quarter';
    const preset = findPreset(q);
    assert.ok(preset, 'Should match Query 1 preset');
    assert.equal(preset.id, 'revenue');

    const res = await runPipeline(q);
    assert.equal(res.success, true);
    assert.ok(res.sql.includes('RANK() OVER (ORDER BY SUM(o.amount) DESC)'));
    assert.ok(res.sql.includes('GROUP BY c.id, c.name, c.plan, c.mrr'));
    assert.ok(res.sql.includes('LIMIT  5'));
    assert.equal(res.results.rows.length, 5);
    assert.equal(res.results.columns.length, 6);
    assert.match(res.insight, /Enterprise/i);
    assert.equal(res.steps.length, 6);
  });

  it('Golden Query 2: Churned Enterprise customers in the last 30 days', async () => {
    const q = 'Which Enterprise customers have churned in the last 30 days?';
    const preset = findPreset(q);
    assert.ok(preset, 'Should match Query 2 preset');
    assert.equal(preset.id, 'churn');

    const res = await runPipeline(q);
    assert.equal(res.success, true);
    assert.ok(res.sql.includes('s.churned = true'));
    assert.ok(res.sql.includes("c.plan = 'enterprise'"));
    assert.ok(res.sql.includes("INTERVAL '30 days'"));
    assert.equal(res.results.rows.length, 4);
    assert.match(res.insight, /lost MRR/i);
    assert.equal(res.steps.length, 6);
  });

  it('Golden Query 3: Average MRR by plan tier', async () => {
    const q = 'What is the average MRR by plan tier?';
    const preset = findPreset(q);
    assert.ok(preset, 'Should match Query 3 preset');
    assert.equal(preset.id, 'mrr');

    const res = await runPipeline(q);
    assert.equal(res.success, true);
    assert.ok(res.sql.includes('ROUND(AVG(c.mrr), 0)'));
    assert.ok(res.sql.includes('SUM(SUM(c.mrr)) OVER ()'));
    assert.ok(res.sql.includes("status = 'active'"));
    assert.equal(res.results.rows.length, 4);
    assert.match(res.insight, /Enterprise/i);
    assert.equal(res.steps.length, 6);
  });

  it('Golden Query 4: Trial customers with more than 3 orders', async () => {
    const q = 'List customers with more than 3 orders still on a trial plan';
    const preset = findPreset(q);
    assert.ok(preset, 'Should match Query 4 preset');
    assert.equal(preset.id, 'trial');

    const res = await runPipeline(q);
    assert.equal(res.success, true);
    assert.ok(res.sql.includes("c.plan = 'trial'"));
    assert.ok(res.sql.includes('HAVING COUNT(o.id) > 3'));
    assert.equal(res.results.rows.length, 4);
    assert.match(res.insight, /trial plans/i);
    assert.equal(res.steps.length, 6);
  });

  it('Golden Query 5: Monthly revenue growth for the past 6 months', async () => {
    const q = 'Show monthly revenue growth for the past 6 months';
    const preset = findPreset(q);
    assert.ok(preset, 'Should match Query 5 preset');
    assert.equal(preset.id, 'growth');

    const res = await runPipeline(q);
    assert.equal(res.success, true);
    assert.ok(res.sql.includes('WITH monthly AS'));
    assert.ok(res.sql.includes('churned AS'));
    assert.ok(res.sql.includes('LAG(m.new_rev) OVER (ORDER BY m.mo)'));
    assert.ok(res.sql.includes('NULLIF'));
    assert.equal(res.results.rows.length, 6);
    assert.match(res.insight, /Net MRR/i);
    assert.equal(res.steps.length, 6);
  });
});
