import { describe, it } from 'node:test';
import assert from 'node:assert';

import { PREBUILT_DATASETS, inferDatasetSchema } from '../src/services/sampleData';
import { profileDatasetSchema } from '../src/services/schemaProfiler';
import { hasPerGroupRankingLanguage, parseQueryPlan, formatQueryPlanSummary } from '../src/services/queryPlan';
import { constructSqlFromPlan } from '../src/services/sqlBlueprints';
import { validateSqlIntent, validateExecutionResult } from '../src/services/validators';
import {
  isQueryOutOfScope,
  getDeterministicCuratedQuery,
  processNaturalLanguageQuery,
} from '../src/services/aiService';
import {
  MODEL_REGISTRY,
  DEFAULT_MODELS,
  DEFAULT_PROVIDER,
  PROVIDERS_CONFIG,
  getModel,
  getModelById,
  getDefaultModel,
  validateModelCapabilities,
} from '../src/services/modelRegistry';

describe('1. Semantic Schema Profiler', () => {
  it('correctly classifies orders dataset dimensions and measures', () => {
    const ordersDataset = PREBUILT_DATASETS.ecommerce.dataset;
    const schema = profileDatasetSchema(ordersDataset);

    assert.strictEqual(schema.tableName, 'orders');
    assert.strictEqual(schema.rowCount, 15);

    const regionCol = schema.columnByName.get('region');
    assert.ok(regionCol, 'region column must exist');
    assert.strictEqual(regionCol?.role, 'dimension');
    assert.strictEqual(regionCol?.semanticMeaning, 'geographic territory');

    const productCol = schema.columnByName.get('product');
    assert.ok(productCol, 'product column must exist');
    assert.strictEqual(productCol?.role, 'dimension');
    assert.strictEqual(productCol?.semanticMeaning, 'product or item entity');

    const qtyCol = schema.columnByName.get('quantity');
    assert.ok(qtyCol, 'quantity column must exist');
    assert.strictEqual(qtyCol?.role, 'measure');
    assert.strictEqual(qtyCol?.semanticMeaning, 'physical volume / units sold');

    const salesCol = schema.columnByName.get('sales');
    assert.ok(salesCol, 'sales column must exist');
    assert.strictEqual(salesCol?.role, 'measure');

    const profitCol = schema.columnByName.get('profit');
    assert.ok(profitCol, 'profit column must exist');
    assert.strictEqual(profitCol?.role, 'measure');
  });

  it('correctly classifies customers dataset dimensions and measures', () => {
    const customersDataset = PREBUILT_DATASETS.saas.dataset;
    const schema = profileDatasetSchema(customersDataset);

    const planTierCol = schema.columnByName.get('plan_tier');
    assert.ok(planTierCol);
    assert.strictEqual(planTierCol?.role, 'dimension');

    const mrrCol = schema.columnByName.get('mrr');
    assert.ok(mrrCol);
    assert.strictEqual(mrrCol?.role, 'measure');
  });
});

describe('2. Query Plan & Grouped Ranking Intent Understanding', () => {
  it('detects grouped ranking language across various natural phrases', () => {
    const phrases = [
      'What is the most sold product in each region for the ecommerce dataset',
      'Which product sells the most in every territory?',
      'Show the top-selling item by region',
      'Find the highest-volume product for each geography',
      'Which SKU has the greatest unit sales in each area?',
      'Top customer per industry',
    ];

    for (const phrase of phrases) {
      assert.strictEqual(
        hasPerGroupRankingLanguage(phrase),
        true,
        `Expected phrase to be detected as grouped ranking: "${phrase}"`
      );
    }
  });

  it('does NOT trigger grouped ranking for non-grouped questions', () => {
    const nonGrouped = [
      'Show total sales by region',
      'What are the top 5 products by profit overall?',
      'List all orders with discount > 15%',
    ];

    for (const phrase of nonGrouped) {
      assert.strictEqual(
        hasPerGroupRankingLanguage(phrase),
        false,
        `Expected non-grouped phrase to return false: "${phrase}"`
      );
    }
  });

  it('correctly parses and normalizes QueryPlan', () => {
    const raw = {
      intent: 'top_n_per_group',
      partition_by: ['region'],
      item_entity: 'product',
      metric: 'quantity',
      aggregation: 'SUM',
      limit: 1,
      scope: 'each_group',
    };

    const plan = parseQueryPlan(raw);
    assert.strictEqual(plan.intent, 'top_n_per_group');
    assert.deepStrictEqual(plan.partition_by, ['region']);
    assert.strictEqual(plan.item_entity, 'product');
    assert.strictEqual(plan.metric, 'quantity');
    assert.strictEqual(plan.limit, 1);

    const summary = formatQueryPlanSummary(plan);
    assert.ok(summary.includes('Grouped Ranking: Top 1 product in each region'));
  });
});

describe('3. SQL Blueprints & Construction', () => {
  it('generates correct CTE with ROW_NUMBER() and PARTITION BY for top_n_per_group', () => {
    const plan = parseQueryPlan({
      intent: 'top_n_per_group',
      partition_by: ['region'],
      item_entity: 'product',
      metric: 'quantity',
      aggregation: 'SUM',
      ranking_direction: 'DESC',
      limit: 1,
    });

    const sql = constructSqlFromPlan(plan, 'orders');

    assert.ok(sql.includes('WITH ranked_items AS'), 'Must use CTE');
    assert.ok(sql.includes('ROW_NUMBER() OVER (PARTITION BY region ORDER BY SUM(quantity) DESC) AS rank'), 'Must use ROW_NUMBER() with PARTITION BY region');
    assert.ok(sql.includes('GROUP BY region, product'), 'Must group by region and product');
    assert.ok(sql.includes('WHERE rank <= 1'), 'Must filter on rank <= 1');
  });
});

describe('4. Pre-Execution SQL Intent Validator', () => {
  const schema = profileDatasetSchema(PREBUILT_DATASETS.ecommerce.dataset);

  const plan = parseQueryPlan({
    intent: 'top_n_per_group',
    partition_by: ['region'],
    item_entity: 'product',
    metric: 'quantity',
    limit: 1,
  });

  it('rejects SQL that performs a naive GROUP BY without window ranking', () => {
    const badSql = 'SELECT region, SUM(sales) FROM orders GROUP BY region';
    const result = validateSqlIntent(badSql, plan, schema);

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('window function')));
    assert.ok(result.errors.some((e) => e.includes('PARTITION BY')));
    assert.ok(result.errors.some((e) => e.includes('Target item column "product" is missing')));
  });

  it('rejects SQL that forgets the rank = 1 filter in outer query', () => {
    const badSql = `WITH ranked_items AS (
      SELECT region, product, SUM(quantity), ROW_NUMBER() OVER (PARTITION BY region ORDER BY SUM(quantity) DESC) AS rank
      FROM orders
      GROUP BY region, product
    )
    SELECT region, product FROM ranked_items`;

    const result = validateSqlIntent(badSql, plan, schema);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('filter on rank')));
  });

  it('accepts correct CTE window query', () => {
    const goodSql = `WITH ranked_items AS (
      SELECT region, product, SUM(quantity) AS total_units, ROW_NUMBER() OVER (PARTITION BY region ORDER BY SUM(quantity) DESC) AS rank
      FROM orders
      GROUP BY region, product
    )
    SELECT region, product, total_units FROM ranked_items WHERE rank = 1 ORDER BY total_units DESC`;

    const result = validateSqlIntent(goodSql, plan, schema);
    assert.strictEqual(result.valid, true, `Validation failed: ${result.errors.join(', ')}`);
  });

  it('rejects destructive DDL/DML statements', () => {
    const dropSql = 'DROP TABLE orders';
    const result = validateSqlIntent(dropSql, plan, schema);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Security Guard')));
  });
});

describe('5. Post-Execution Result Validator', () => {
  const schema = profileDatasetSchema(PREBUILT_DATASETS.ecommerce.dataset);

  const plan = parseQueryPlan({
    intent: 'top_n_per_group',
    partition_by: ['region'],
    item_entity: 'product',
    metric: 'quantity',
    limit: 1,
  });

  it('rejects results missing the item column', () => {
    const rows = [{ region: 'West', total_sales: 1000 }];
    const cols = ['region', 'total_sales'];

    const result = validateExecutionResult(rows, cols, plan, schema);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('missing target item column "product"')));
  });

  it('rejects results with duplicate partition values when limit = 1', () => {
    const rows = [
      { region: 'West', product: 'UltraBook Pro 15', total_units: 3 },
      { region: 'West', product: 'Laser Printer', total_units: 2 }, // Duplicate West!
      { region: 'East', product: 'Mechanical Keyboard', total_units: 4 },
    ];
    const cols = ['region', 'product', 'total_units'];

    const result = validateExecutionResult(rows, cols, plan, schema);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('duplicate entries for: West')));
  });

  it('accepts valid 1-row-per-region result', () => {
    const rows = [
      { region: 'Central', product: 'Bulk Recycled Copy Paper 10pk', total_units: 5 },
      { region: 'East', product: 'Mechanical Coding Keyboard', total_units: 4 },
      { region: 'South', product: 'Wireless Noise-Canceling ANC', total_units: 4 },
      { region: 'West', product: 'UltraBook Pro 15', total_units: 3 },
    ];
    const cols = ['region', 'product', 'total_units'];

    const result = validateExecutionResult(rows, cols, plan, schema);
    assert.strictEqual(result.valid, true, `Result validation failed: ${result.errors.join(', ')}`);
  });
});

describe('6. Scope Guard & Keyless Safety', () => {
  const ordersDataset = PREBUILT_DATASETS.ecommerce.dataset;

  it('flags irrelevant trivia / memes as out of scope', () => {
    const badQueries = [
      'Who is the president of the United States?',
      'What is the weather in Paris today?',
      'Tell me a skibidi toilet meme',
      'What are the ingredients in pizza?',
    ];

    for (const q of badQueries) {
      const scope = isQueryOutOfScope(q, ordersDataset);
      assert.strictEqual(scope.outOfScope, true, `Expected "${q}" to be out of scope`);
    }
  });

  it('flags analytical queries on dataset as in-scope', () => {
    const inScopeQueries = [
      'What is the most sold product in each region for the ecommerce dataset',
      'Show total sales by category',
      'Find all orders with negative profit',
    ];

    for (const q of inScopeQueries) {
      const scope = isQueryOutOfScope(q, ordersDataset);
      assert.strictEqual(scope.outOfScope, false, `Expected "${q}" to be in scope`);
    }
  });

  it('returns verified blueprint for "most sold product in each region"', () => {
    const result = getDeterministicCuratedQuery(
      'What is the most sold product in each region for the ecommerce dataset',
      ordersDataset
    );

    assert.ok(result, 'Must return curated query match');
    assert.ok(result.sql.includes('WITH ranked_regional_products AS'));
    assert.ok(result.sql.includes('ROW_NUMBER() OVER (PARTITION BY region ORDER BY SUM(quantity) DESC)'));
    assert.ok(result.sql.includes('WHERE rank = 1'));
    assert.strictEqual(result.queryPlan?.intent, 'top_n_per_group');
    assert.deepStrictEqual(result.queryPlan?.partition_by, ['region']);
  });

  it('rejects arbitrary custom queries in keyless mode with informative error', async () => {
    const arbitraryQuery = 'Find which customer bought the highest number of printers on Tuesdays';

    await assert.rejects(
      async () => {
        await processNaturalLanguageQuery(arbitraryQuery, ordersDataset, undefined);
      },
      (err: any) => {
        assert.ok(err.message.includes('An AI API Key'));
        assert.ok(err.message.includes('required to analyze arbitrary natural language queries'));
        return true;
      }
    );
  });
});

describe('7. Arbitrary Uploaded Dataset Generalization', () => {
  const hrRecords = [
    { emp_id: 'E101', name: 'Alice Chen', department: 'Engineering', salary: 140000, hire_date: '2021-03-01' },
    { emp_id: 'E102', name: 'Bob Vance', department: 'Engineering', salary: 160000, hire_date: '2020-06-15' },
    { emp_id: 'E103', name: 'Charlie Day', department: 'Sales', salary: 110000, hire_date: '2022-01-10' },
    { emp_id: 'E104', name: 'Diana Prince', department: 'Sales', salary: 135000, hire_date: '2019-11-20' },
    { emp_id: 'E105', name: 'Evan Wright', department: 'Marketing', salary: 95000, hire_date: '2023-04-05' },
  ];

  const hrDataset = inferDatasetSchema(hrRecords, 'employees', 'Corporate HR Records');

  it('dynamically profiles arbitrary uploaded dataset without hardcoded assumptions', () => {
    const schema = profileDatasetSchema(hrDataset);

    assert.strictEqual(schema.tableName, 'employees');
    assert.strictEqual(schema.rowCount, 5);

    const salaryCol = schema.columnByName.get('salary');
    assert.ok(salaryCol);
    assert.strictEqual(salaryCol?.role, 'measure');

    const deptCol = schema.columnByName.get('department');
    assert.ok(deptCol);
    assert.strictEqual(deptCol?.role, 'dimension');

    const idCol = schema.columnByName.get('emp_id');
    assert.ok(idCol);
    assert.strictEqual(idCol?.role, 'identifier');

    const hireDateCol = schema.columnByName.get('hire_date');
    assert.ok(hireDateCol);
    assert.strictEqual(hireDateCol?.role, 'temporal');
  });

  it('constructs and validates partitioned ranking on uploaded HR dataset', () => {
    const schema = profileDatasetSchema(hrDataset);

    // "Highest paid employee in each department"
    const plan = parseQueryPlan({
      intent: 'top_n_per_group',
      partition_by: ['department'],
      item_entity: 'name',
      metric: 'salary',
      aggregation: 'SUM',
      ranking_direction: 'DESC',
      limit: 1,
    });

    const sql = constructSqlFromPlan(plan, 'employees');
    assert.ok(sql.includes('PARTITION BY department'));
    assert.ok(sql.includes('ORDER BY SUM(salary) DESC'));
    assert.ok(sql.includes('WHERE rank <= 1'));

    const validation = validateSqlIntent(sql, plan, schema);
    assert.strictEqual(validation.valid, true, `Validation failed: ${validation.errors.join(', ')}`);
  });

  it('runs deterministic exploration suggestions on uploaded dataset without API key', () => {
    const query = 'What is the total and average salary grouped by department?';
    const result = getDeterministicCuratedQuery(query, hrDataset);

    assert.ok(result, 'Expected curated match for uploaded dataset suggestion');
    assert.ok(result.sql.includes('GROUP BY "department"'));
    assert.ok(result.sql.includes('SUM("salary")'));
    assert.ok(result.sql.includes('AVG("salary")'));
    assert.strictEqual(result.queryPlan?.intent, 'aggregate_by_dimension');
  });
});

describe('8. AI Model Registry & Catalog SSOT', () => {
  it('contains strictly the current model catalog across Gemini, Groq, and OpenAI', () => {
    // Gemini
    const geminiIds = MODEL_REGISTRY.gemini.map((m) => m.id);
    assert.deepStrictEqual(geminiIds, [
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.1-pro',
    ]);

    // Groq
    const groqIds = MODEL_REGISTRY.groq.map((m) => m.id);
    assert.deepStrictEqual(groqIds, [
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'qwen/qwen3.8-27b',
    ]);

    // OpenAI
    const openAiIds = MODEL_REGISTRY.openai.map((m) => m.id);
    assert.deepStrictEqual(openAiIds, [
      'gpt-6-luna',
      'gpt-6-sol',
      'gpt-6-astra',
    ]);
  });

  it('correctly sets defaults for providers and models', () => {
    assert.strictEqual(DEFAULT_PROVIDER, 'gemini');
    assert.strictEqual(DEFAULT_MODELS.gemini, 'gemini-3.8-flash');
    assert.strictEqual(DEFAULT_MODELS.groq, 'openai/gpt-oss-120b');
    assert.strictEqual(DEFAULT_MODELS.openai, 'gpt-6-luna');

    const defaultGemini = getDefaultModel('gemini');
    assert.strictEqual(defaultGemini.id, 'gemini-3.8-flash');
    assert.strictEqual(defaultGemini.recommended, true);

    const defaultGroq = getDefaultModel('groq');
    assert.strictEqual(defaultGroq.id, 'openai/gpt-oss-120b');
    assert.strictEqual(defaultGroq.recommended, true);

    const defaultOpenAi = getDefaultModel('openai');
    assert.strictEqual(defaultOpenAi.id, 'gpt-6-luna');
    assert.strictEqual(defaultOpenAi.recommended, true);
  });

  it('enforces accurate badges and tiers', () => {
    // Gemini 3.8 Flash is RECOMMENDED Free Tier
    const g38 = getModel('gemini', 'gemini-3.8-flash');
    assert.ok(g38);
    assert.strictEqual(g38?.badge, 'FREE TIER');
    assert.strictEqual(g38?.tier, 'free_and_paid');
    assert.strictEqual(g38?.recommended, true);

    // Gemini 3.1 Pro is Preview and Paid
    const g31 = getModel('gemini', 'gemini-3.1-pro');
    assert.ok(g31);
    assert.strictEqual(g31?.badge, 'PAID · ADVANCED');
    assert.strictEqual(g31?.tier, 'paid');
    assert.strictEqual(g31?.status, 'preview');

    // Groq GPT-OSS 120B is RECOMMENDED Free Tier
    const oss120 = getModel('groq', 'openai/gpt-oss-120b');
    assert.ok(oss120);
    assert.strictEqual(oss120?.badge, 'FREE TIER');
    assert.strictEqual(oss120?.recommended, true);

    // Groq Qwen 3.8 27B is Preview
    const qwen = getModel('groq', 'qwen/qwen3.8-27b');
    assert.ok(qwen);
    assert.strictEqual(qwen?.badge, 'FREE TIER · PREVIEW');
    assert.strictEqual(qwen?.status, 'preview');
    assert.strictEqual(qwen?.recommended, false);

    // OpenAI models are all paid
    for (const m of MODEL_REGISTRY.openai) {
      assert.strictEqual(m.tier, 'paid');
      assert.ok(m.badge.startsWith('PAID'));
    }
  });

  it('purges and rejects obsolete models', () => {
    const obsoleteIds = [
      'gemini-2.0-flash',
      'gemini-2.5-flash',
      'gemini-1.5-flash',
      'gemini-3.8-flash-lite',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'gpt-4o',
      'gpt-4o-mini',
    ];

    for (const id of obsoleteIds) {
      const found = getModelById(id);
      assert.strictEqual(found, undefined, `Obsolete model "${id}" must not exist in registry`);
    }
  });

  it('validates capabilities for all registered models', () => {
    for (const provider of ['gemini', 'groq', 'openai'] as const) {
      for (const m of MODEL_REGISTRY[provider]) {
        const check = validateModelCapabilities(m.id, ['sqlGeneration', 'reasoning']);
        assert.strictEqual(check.valid, true, `Model ${m.id} must support sqlGeneration and reasoning`);
      }
    }
  });

  it('structures provider categories for settings modal UX', () => {
    const freeProviders = PROVIDERS_CONFIG.filter((p) => p.category === 'free_tier_available');
    assert.deepStrictEqual(freeProviders.map((p) => p.id), ['gemini', 'groq']);

    const paidProviders = PROVIDERS_CONFIG.filter((p) => p.category === 'paid');
    assert.deepStrictEqual(paidProviders.map((p) => p.id), ['openai']);
  });
});


