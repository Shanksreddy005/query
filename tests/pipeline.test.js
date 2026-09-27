const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildIntentPrompt, parseIntentResponse } = require('../src/pipeline/step1_intent');
const { buildSchemaMapperPrompt, parseSchemaMapperResponse } = require('../src/pipeline/step2_schema');
const { buildJoinPlannerPrompt, parseJoinPlannerResponse } = require('../src/pipeline/step3_planner');
const { buildSqlGenPrompt, cleanSqlResponse } = require('../src/pipeline/step4_sqlgen');
const { buildVerifierPrompt, deterministicVerify, parseVerifierResponse } = require('../src/pipeline/step5_verifier');
const { buildInsightPrompt, cleanInsightResponse } = require('../src/pipeline/step6_insight');
const { runPipeline } = require('../src/pipeline/router');

describe('6-Step Reasoning Pipeline Unit Tests', () => {
  it('Step 1 (Intent Parser): builds schema prompt and parses JSON accurately', () => {
    const prompt = buildIntentPrompt('Show active customers with MRR > 1000');
    assert.ok(prompt.systemPrompt.includes('SaaS Demo DB'));
    assert.ok(prompt.userPrompt.includes('active customers'));

    const sampleJson = JSON.stringify({
      entity: 'customers',
      metric: 'mrr',
      filters: ['status = active', 'mrr > 1000'],
      time_range: null,
      sort: 'mrr DESC',
      limit: 10
    });
    const parsed = parseIntentResponse(sampleJson);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.entity, 'customers');
    assert.equal(parsed.data.limit, 10);
  });

  it('Step 1 (Intent Parser): handles malformed model output gracefully', () => {
    const brokenJson = '```json\n{ "entity": "customers", invalid json...\n```';
    const parsed = parseIntentResponse(brokenJson);
    assert.equal(parsed.success, false);
    assert.equal(parsed.data.entity, 'customers'); // Default safe entity provided
  });

  it('Step 2 (Schema Mapper): maps intent to tables and joins', () => {
    const prompt = buildSchemaMapperPrompt({ entity: 'orders' });
    assert.ok(prompt.systemPrompt.includes('Foreign keys'));

    const mockResponse = JSON.stringify({
      tables: ['orders', 'customers'],
      joins: ['JOIN customers ON customers.id = orders.customer_id'],
      reason_for_each_join: 'Order to customer lookup'
    });
    const parsed = parseSchemaMapperResponse(mockResponse);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.tables.length, 2);
  });

  it('Step 3 (Join Planner): produces concise operational plan without chain-of-thought', () => {
    const prompt = buildJoinPlannerPrompt({
      tables: ['orders', 'customers'],
      joins: ['orders.customer_id = customers.id'],
      question: 'Revenue per customer'
    });
    assert.ok(prompt.systemPrompt.includes('1 to 2 sentences maximum'));
    assert.ok(prompt.systemPrompt.includes('Do NOT expose internal reasoning'));

    const plan = parseJoinPlannerResponse('I will join orders to customers on customer_id and calculate total revenue.');
    assert.ok(plan.includes('join orders to customers'));
  });

  it('Step 4 (SQL Generator): enforces SELECT-only and cleans markdown fences', () => {
    const prompt = buildSqlGenPrompt({ question: 'List customers', joinPlan: 'Query customers table' });
    assert.ok(prompt.systemPrompt.includes('SELECT only'));

    const fenced = '```sql\nSELECT name, plan FROM customers;\n```';
    const cleaned = cleanSqlResponse(fenced);
    assert.equal(cleaned, 'SELECT name, plan FROM customers;');
  });

  it('Step 5 (Query Verifier): performs deterministic checks and verifies schema safety', () => {
    const safeSql = 'SELECT id, name FROM customers WHERE status = \'active\';';
    const verifySafe = deterministicVerify(safeSql);
    assert.equal(verifySafe.valid, true);

    const destructiveSql = 'DROP TABLE customers;';
    const verifyDangerous = deterministicVerify(destructiveSql);
    assert.equal(verifyDangerous.valid, false);
  });

  it('Step 6 (Insight Narrator): prompts for 2-sentence business insight with concrete numbers', () => {
    const prompt = buildInsightPrompt({
      question: 'Top revenue',
      columns: ['Rank', 'Customer', 'Revenue'],
      rows: [['1', 'Acme Corp', '$100,000']],
      rowCount: 1
    });
    assert.ok(prompt.systemPrompt.includes('exactly 2 sentences'));
    assert.ok(prompt.systemPrompt.includes('concrete numbers'));

    const insight = cleanInsightResponse('Insight: Top tier customers drove 80% of revenue. Conversion should focus on starter accounts.');
    assert.ok(!insight.startsWith('Insight:'));
  });

  it('Pipeline rejects empty queries with friendly message', async () => {
    const res = await runPipeline('');
    assert.equal(res.success, false);
    assert.match(res.error, /empty/i);
  });
});
