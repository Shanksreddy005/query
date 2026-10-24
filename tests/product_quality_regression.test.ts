import { describe, it } from 'node:test';
import assert from 'node:assert';

import { PREBUILT_DATASETS } from '../src/services/sampleData';
import { profileDatasetSchema } from '../src/services/schemaProfiler';
import { parseQueryPlan, formatQueryPlanSummary } from '../src/services/queryPlan';
import {
  validateSqlIntent,
  validateExecutionResult,
  checkMetricAvailability,
} from '../src/services/validators';
import {
  selectDeterministicVisualization,
  validateChartSuggestion,
} from '../src/services/visualizationSelector';
import {
  getDeterministicCuratedQuery,
  processNaturalLanguageQuery,
} from '../src/services/aiService';

describe('Phase 8 — Regression Test Suite', () => {
  const saasDataset = PREBUILT_DATASETS.saas.dataset;
  const saasSchema = profileDatasetSchema(saasDataset);
  const ecommerceDataset = PREBUILT_DATASETS.ecommerce.dataset;
  const ecommerceSchema = profileDatasetSchema(ecommerceDataset);

  // -------------------------------------------------------------
  // Test Group A — Customer Filtering
  // -------------------------------------------------------------
  describe('Test Group A — Customer Filtering', () => {
    const question = 'Which customers are At-Risk or Churned with NPS score under 6?';

    it('enforces churn_status in requested set and nps strictly below 6', () => {
      const plan = parseQueryPlan({
        intent: 'filter_lookup',
        dimensions: ['company_name', 'plan_tier'],
        metric: 'mrr',
        filters: [
          { column: 'churn_status', operator: 'IN', value: ['Churned', 'At-Risk'] },
          { column: 'nps_score', operator: '<', value: 6 },
        ],
        explanation: 'Filter customers with churn risk and NPS score strictly under 6',
      });

      const goodSql = `SELECT company_name, plan_tier, mrr, churn_status, nps_score, support_tickets FROM customers WHERE churn_status IN ('Churned', 'At-Risk') AND nps_score < 6 ORDER BY mrr DESC`;
      const validation = validateSqlIntent(goodSql, plan, saasSchema, question);
      assert.strictEqual(validation.valid, true, `Expected valid SQL intent: ${validation.errors.join('; ')}`);
      assert.ok(validation.passedChecks?.some((c) => c.includes('NPS score (< 6)')));
      assert.ok(validation.passedChecks?.some((c) => c.includes('Churn status')));

      // Rejects SQL missing the NPS score < 6 filter
      const badSqlMissingNps = `SELECT company_name, plan_tier, mrr, churn_status, nps_score FROM customers WHERE churn_status IN ('Churned', 'At-Risk')`;
      const badVal1 = validateSqlIntent(badSqlMissingNps, plan, saasSchema, question);
      assert.strictEqual(badVal1.valid, false);
      assert.ok(badVal1.errors.some((e) => e.includes('nps_score')));

      // Rejects SQL with inverted filter (nps_score > 6)
      const badSqlInvertedNps = `SELECT company_name, plan_tier, mrr, churn_status, nps_score FROM customers WHERE churn_status IN ('Churned', 'At-Risk') AND nps_score > 6`;
      const badVal2 = validateSqlIntent(badSqlInvertedNps, plan, saasSchema, question);
      assert.strictEqual(badVal2.valid, false);

      // Rejects SQL missing At-Risk status
      const badSqlOnlyChurned = `SELECT company_name, plan_tier, mrr, churn_status, nps_score FROM customers WHERE churn_status = 'Churned' AND nps_score < 6`;
      const badVal3 = validateSqlIntent(badSqlOnlyChurned, plan, saasSchema, question);
      assert.strictEqual(badVal3.valid, false);
    });

    it('filters rows correctly and excludes Nexus Dynamics (NPS=6)', () => {
      // In the saas dataset, evaluate records:
      const matchingRows = saasDataset.data.filter((r) =>
        (r.churn_status === 'Churned' || r.churn_status === 'At-Risk') && r.nps_score < 6
      );

      // Exactly 7 records match
      assert.strictEqual(matchingRows.length, 7, 'Expected exactly 7 customers to match');

      // Verify Nexus Dynamics (which has nps_score = 6) is strictly excluded
      const nexusFound = matchingRows.some((r) => r.company_name === 'Nexus Dynamics');
      assert.strictEqual(nexusFound, false, 'Nexus Dynamics has NPS 6 and must not appear for NPS < 6');

      // Verify all matching rows have nps_score < 6
      for (const row of matchingRows) {
        assert.ok(row.nps_score < 6, `Row ${row.company_name} has NPS ${row.nps_score} which is not < 6`);
        assert.ok(
          row.churn_status === 'Churned' || row.churn_status === 'At-Risk',
          `Row ${row.company_name} has status ${row.churn_status}`
        );
      }

      // Result validation verifies the output rows
      const plan = parseQueryPlan({
        intent: 'filter_lookup',
        dimensions: ['company_name'],
        filters: [
          { column: 'churn_status', operator: 'IN', value: ['Churned', 'At-Risk'] },
          { column: 'nps_score', operator: '<', value: 6 },
        ],
      });

      const resVal = validateExecutionResult(
        matchingRows,
        ['company_name', 'plan_tier', 'mrr', 'churn_status', 'nps_score'],
        plan,
        saasSchema
      );
      assert.strictEqual(resVal.valid, true, `Result validation failed: ${resVal.errors.join('; ')}`);

      // Reject if an invalid row sneaks in (e.g. Active customer or NPS 7)
      const dirtyRows = [
        ...matchingRows,
        { company_name: 'Imposter Corp', churn_status: 'Active', nps_score: 4 },
      ];
      const badResVal = validateExecutionResult(
        dirtyRows,
        ['company_name', 'churn_status', 'nps_score'],
        plan,
        saasSchema
      );
      assert.strictEqual(badResVal.valid, false);
      assert.ok(badResVal.errors.some((e) => e.includes('Active')));
    });

    it('curated query returns table-first (no misleading donut chart) and verified evidence insight', () => {
      const curated = getDeterministicCuratedQuery(question, saasDataset);
      assert.ok(curated, 'Curated match expected');
      assert.strictEqual(curated.status, 'verified');
      assert.strictEqual(curated.chartSuggestion, undefined, 'Raw customer lookup must have table primary, not donut chart');
      assert.ok(curated.insight?.summary?.includes('Seven customers match'));
      assert.ok(curated.insight?.highlights?.some((h) => h.includes('390 to 6,800')));
    });
  });

  // -------------------------------------------------------------
  // Test Group B — Top-N Filtering
  // -------------------------------------------------------------
  describe('Test Group B — Top-N Filtering', () => {
    const question = 'Show me the top five Enterprise customers by MRR.';

    it('verifies Enterprise filter, ranking metric MRR, ranking direction DESC, and limit 5', () => {
      const plan = parseQueryPlan({
        intent: 'ranking',
        dimensions: ['company_name', 'plan_tier'],
        metric: 'mrr',
        ranking_direction: 'DESC',
        limit: 5,
        filters: [{ column: 'plan_tier', operator: '=', value: 'Enterprise' }],
        explanation: 'Top 5 enterprise customers ranked by MRR',
      });

      const goodSql = `SELECT company_name, plan_tier, mrr FROM customers WHERE plan_tier = 'Enterprise' ORDER BY mrr DESC LIMIT 5`;
      const val = validateSqlIntent(goodSql, plan, saasSchema, question);
      assert.strictEqual(val.valid, true);

      // Rejects SQL with LIMIT 10 when question requested top 5
      const badLimitSql = `SELECT company_name, plan_tier, mrr FROM customers WHERE plan_tier = 'Enterprise' ORDER BY mrr DESC LIMIT 10`;
      const badLimitVal = validateSqlIntent(badLimitSql, plan, saasSchema, question);
      assert.strictEqual(badLimitVal.valid, false);
      assert.ok(badLimitVal.errors.some((e) => e.includes('LIMIT 10')));

      // Rejects SQL ordering ASC when top requested
      const badAscSql = `SELECT company_name, plan_tier, mrr FROM customers WHERE plan_tier = 'Enterprise' ORDER BY mrr ASC LIMIT 5`;
      const badAscVal = validateSqlIntent(badAscSql, plan, saasSchema, question);
      assert.strictEqual(badAscVal.valid, false);
      assert.ok(badAscVal.errors.some((e) => e.includes('DESC order')));

      // Rejects SQL missing Enterprise filter
      const badFilterSql = `SELECT company_name, plan_tier, mrr FROM customers ORDER BY mrr DESC LIMIT 5`;
      const badFilterVal = validateSqlIntent(badFilterSql, plan, saasSchema, question);
      assert.strictEqual(badFilterVal.valid, false);
      assert.ok(badFilterVal.errors.some((e) => e.includes('Enterprise')));
    });

    it('selects appropriate horizontal bar visualization for ranked customers', () => {
      const plan = parseQueryPlan({
        intent: 'ranking',
        dimensions: ['company_name'],
        metric: 'mrr',
        limit: 5,
      });

      const sampleRows = [
        { company_name: 'Ironclad Security', mrr: 11200 },
        { company_name: 'Beacon Health Systems', mrr: 10400 },
        { company_name: 'Vortex Global', mrr: 9800 },
        { company_name: 'Hyperion Capital', mrr: 8900 },
        { company_name: 'Acme Cloud Corp', mrr: 8400 },
      ];

      const chart = selectDeterministicVisualization(
        question,
        plan,
        sampleRows,
        ['company_name', 'mrr'],
        saasSchema
      );

      assert.ok(chart, 'Expected chart suggestion for ranked entities');
      assert.strictEqual(chart?.type, 'horizontal_bar');
      assert.strictEqual(chart?.xAxisKey, 'company_name');
      assert.strictEqual(chart?.yAxisKey, 'mrr');
      assert.ok(chart?.title.includes('Top 5 Company Name by MRR'));
    });
  });

  // -------------------------------------------------------------
  // Test Group C — Undefined Metric
  // -------------------------------------------------------------
  describe('Test Group C — Undefined Metric', () => {
    const question = 'Show the top five customers by lost MRR.';

    it('identifies missing metric and asks for clarification without silent substitution', async () => {
      const check = checkMetricAvailability(question, saasSchema);
      assert.strictEqual(check.isAvailable, false);
      assert.strictEqual(check.missingMetric, 'lost MRR');
      assert.ok(check.clarification?.includes('does not contain a dedicated "lost MRR" measure'));

      // In aiService processNaturalLanguageQuery, it enters needs_clarification state:
      const result = await processNaturalLanguageQuery(question, saasDataset);
      assert.strictEqual(result.status, 'needs_clarification');
      assert.ok(result.clarificationMessage?.includes('lost MRR'));
      assert.strictEqual(result.sql, '', 'Must not execute or generate substitute SQL');
      assert.ok(result.insight?.summary?.includes('Clarification needed'));
    });

    it('identifies undefined net operating margin in e-commerce schema', () => {
      const nomQuestion = 'What is the net operating margin by category?';
      const check = checkMetricAvailability(nomQuestion, ecommerceSchema);
      assert.strictEqual(check.isAvailable, false);
      assert.strictEqual(check.missingMetric, 'net operating margin');
    });
  });

  // -------------------------------------------------------------
  // Test Group D — Aggregation
  // -------------------------------------------------------------
  describe('Test Group D — Aggregation', () => {
    const question = 'Show total MRR by plan tier.';

    it('enforces exactly one row per unique plan tier and verifies totals', () => {
      const plan = parseQueryPlan({
        intent: 'aggregate_by_dimension',
        dimensions: ['plan_tier'],
        metric: 'mrr',
        aggregation: 'SUM',
      });

      const aggregatedRows = [
        { plan_tier: 'Enterprise', total_mrr: 83300, customer_count: 10 },
        { plan_tier: 'Professional', total_mrr: 19250, customer_count: 8 },
        { plan_tier: 'Starter', total_mrr: 25940, customer_count: 7 },
      ];

      const resVal = validateExecutionResult(
        aggregatedRows,
        ['plan_tier', 'total_mrr', 'customer_count'],
        plan,
        saasSchema
      );
      assert.strictEqual(resVal.valid, true);

      // Rejects result if duplicate plan tiers are present (failed GROUP BY)
      const badDuplicateRows = [
        { plan_tier: 'Enterprise', total_mrr: 8400 },
        { plan_tier: 'Enterprise', total_mrr: 6200 }, // Duplicate tier!
        { plan_tier: 'Professional', total_mrr: 2400 },
      ];
      const badVal = validateExecutionResult(
        badDuplicateRows,
        ['plan_tier', 'total_mrr'],
        plan,
        saasSchema
      );
      assert.strictEqual(badVal.valid, false);
      assert.ok(badVal.errors.some((e) => e.includes('Aggregation uniqueness violated')));
    });

    it('generates a valid composition donut chart where categories reconcile with totals', () => {
      const plan = parseQueryPlan({
        intent: 'aggregate_by_dimension',
        dimensions: ['plan_tier'],
        metric: 'mrr',
        aggregation: 'SUM',
      });

      const aggregatedRows = [
        { plan_tier: 'Enterprise', total_mrr: 83300 },
        { plan_tier: 'Professional', total_mrr: 19250 },
        { plan_tier: 'Starter', total_mrr: 25940 },
      ];

      const chart = selectDeterministicVisualization(
        'Show breakdown of total MRR by plan tier',
        plan,
        aggregatedRows,
        ['plan_tier', 'total_mrr'],
        saasSchema
      );

      assert.ok(chart);
      assert.strictEqual(chart?.type, 'donut');
      assert.strictEqual(chart?.xAxisKey, 'plan_tier');
      assert.strictEqual(chart?.yAxisKey, 'total_mrr');
      assert.strictEqual(chart?.isAggregated, true);

      // Verify chart validation passes
      const chartValidation = validateChartSuggestion(
        chart,
        aggregatedRows,
        ['plan_tier', 'total_mrr'],
        plan,
        saasSchema
      );
      assert.strictEqual(chartValidation.valid, true);
    });
  });

  // -------------------------------------------------------------
  // Test Group E — Visualization Consistency
  // -------------------------------------------------------------
  describe('Test Group E — Visualization Consistency', () => {
    it('rejects chart suggestion if axis keys do not exist in result columns', () => {
      const plan = parseQueryPlan({ intent: 'overview', dimensions: [] });
      const rows = [{ region: 'West', sales: 1000 }];
      const cols = ['region', 'sales'];

      const invalidChart = {
        type: 'bar' as const,
        xAxisKey: 'non_existent_col',
        yAxisKey: 'sales',
        title: 'Sales by Non-Existent Column',
      };

      const check = validateChartSuggestion(invalidChart, rows, cols, plan, ecommerceSchema);
      assert.strictEqual(check.valid, false);
      assert.ok(check.reason?.includes('not present in result columns'));
    });

    it('rejects chart suggestion if value axis is non-numeric', () => {
      const plan = parseQueryPlan({ intent: 'overview', dimensions: [] });
      const rows = [{ region: 'West', category: 'Technology' }];
      const cols = ['region', 'category'];

      const invalidChart = {
        type: 'bar' as const,
        xAxisKey: 'region',
        yAxisKey: 'category',
        title: 'Category by Region',
      };

      const check = validateChartSuggestion(invalidChart, rows, cols, plan, ecommerceSchema);
      assert.strictEqual(check.valid, false);
      assert.ok(check.reason?.includes('does not contain numeric data'));
    });

    it('rejects donut chart on raw unaggregated records with duplicate categories', () => {
      const plan = parseQueryPlan({ intent: 'filter_lookup', dimensions: ['plan_tier'] });
      const rawRowsWithDupes = [
        { company_name: 'Acme', plan_tier: 'Enterprise', mrr: 8400 },
        { company_name: 'Apex', plan_tier: 'Enterprise', mrr: 6200 },
        { company_name: 'DataSync', plan_tier: 'Professional', mrr: 2400 },
      ];

      const donutChart = {
        type: 'donut' as const,
        xAxisKey: 'plan_tier',
        yAxisKey: 'mrr',
        title: 'MRR by Plan Tier',
      };

      const check = validateChartSuggestion(
        donutChart,
        rawRowsWithDupes,
        ['company_name', 'plan_tier', 'mrr'],
        plan,
        saasSchema
      );
      assert.strictEqual(check.valid, false);
      assert.ok(check.reason?.includes('unaggregated records with duplicate category labels'));
    });

    it('selects line chart for temporal time trends', () => {
      const plan = parseQueryPlan({
        intent: 'time_trend',
        dimensions: ['order_date'],
        metric: 'sales',
        aggregation: 'SUM',
      });

      const rows = [
        { order_date: '2024-02-12', total_sales: 1899 },
        { order_date: '2024-02-14', total_sales: 450 },
        { order_date: '2024-02-15', total_sales: 280 },
      ];

      const chart = selectDeterministicVisualization(
        'Show sales trend over time',
        plan,
        rows,
        ['order_date', 'total_sales'],
        ecommerceSchema
      );

      assert.ok(chart);
      assert.strictEqual(chart?.type, 'line');
      assert.strictEqual(chart?.xAxisKey, 'order_date');
      assert.strictEqual(chart?.yAxisKey, 'total_sales');
    });
  });

  // -------------------------------------------------------------
  // Test Group F — Paraphrases
  // -------------------------------------------------------------
  describe('Test Group F — Paraphrases', () => {
    it('produces equivalent analytical filters across semantically equivalent phrasing', () => {
      const paraphrases = [
        'Which customers are At-Risk or Churned with NPS score under 6?',
        'Show at-risk and churned accounts with nps less than 6',
        'Find all churned or at-risk customers with an NPS score below 6',
      ];

      const goodSql = `SELECT company_name, plan_tier, mrr, churn_status, nps_score FROM customers WHERE churn_status IN ('Churned', 'At-Risk') AND nps_score < 6 ORDER BY mrr DESC`;

      for (const phrase of paraphrases) {
        const plan = parseQueryPlan({
          intent: 'filter_lookup',
          dimensions: ['company_name'],
          filters: [
            { column: 'churn_status', operator: 'IN', value: ['Churned', 'At-Risk'] },
            { column: 'nps_score', operator: '<', value: 6 },
          ],
        });

        const val = validateSqlIntent(goodSql, plan, saasSchema, phrase);
        assert.strictEqual(val.valid, true, `Paraphrase failed: "${phrase}"`);
      }
    });

    it('produces equivalent ranking and limit across top-5 paraphrases', () => {
      const paraphrases = [
        'Show me the top five Enterprise customers by MRR.',
        'Top 5 Enterprise customers by MRR',
        'List 5 largest Enterprise accounts by MRR',
      ];

      const goodSql = `SELECT company_name, mrr FROM customers WHERE plan_tier = 'Enterprise' ORDER BY mrr DESC LIMIT 5`;

      for (const phrase of paraphrases) {
        const plan = parseQueryPlan({
          intent: 'ranking',
          dimensions: ['company_name'],
          metric: 'mrr',
          limit: 5,
          filters: [{ column: 'plan_tier', operator: '=', value: 'Enterprise' }],
        });

        const val = validateSqlIntent(goodSql, plan, saasSchema, phrase);
        assert.strictEqual(val.valid, true, `Paraphrase failed: "${phrase}"`);
      }
    });
  });

  // -------------------------------------------------------------
  // Test Group G — Failure Handling
  // -------------------------------------------------------------
  describe('Test Group G — Failure Handling', () => {
    it('handles empty results and marks warning/error appropriately', () => {
      const plan = parseQueryPlan({
        intent: 'ranking',
        dimensions: ['company_name'],
        metric: 'mrr',
      });

      const resVal = validateExecutionResult([], ['company_name', 'mrr'], plan, saasSchema);
      assert.strictEqual(resVal.valid, false);
      assert.ok(resVal.errors.some((e) => e.includes('Query returned 0 rows')));
    });

    it('rejects destructive and multi-statement SQL', () => {
      const plan = parseQueryPlan({ intent: 'overview', dimensions: [] });

      const dmlSql = `SELECT * FROM orders; DELETE FROM orders WHERE sales > 0;`;
      const val = validateSqlIntent(dmlSql, plan, ecommerceSchema);
      assert.strictEqual(val.valid, false);
      assert.ok(val.errors.some((e) => e.includes('Security Guard')));
    });

    it('rejects query exceeding requested row limit', () => {
      const plan = parseQueryPlan({
        intent: 'ranking',
        dimensions: ['company_name'],
        limit: 3,
      });

      const rows = [
        { company_name: 'A', mrr: 100 },
        { company_name: 'B', mrr: 90 },
        { company_name: 'C', mrr: 80 },
        { company_name: 'D', mrr: 70 }, // 4th row when limit was 3!
      ];

      const val = validateExecutionResult(rows, ['company_name', 'mrr'], plan, saasSchema);
      assert.strictEqual(val.valid, false);
      assert.ok(val.errors.some((e) => e.includes('exceeding requested limit of 3')));
    });

    it('never produces verified success state when SQL validation fails', () => {
      const plan = parseQueryPlan({
        intent: 'aggregate_by_dimension',
        dimensions: ['region'],
      });

      // Missing GROUP BY
      const invalidSql = `SELECT region, SUM(sales) FROM orders`;
      const val = validateSqlIntent(invalidSql, plan, ecommerceSchema);
      assert.strictEqual(val.valid, false);
      assert.ok(val.errors.length > 0);
    });
  });
});
