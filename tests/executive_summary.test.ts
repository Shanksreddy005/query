import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateEvidenceBasedSummary } from '../src/services/summaryEngine';
import { getDeterministicCuratedQuery, processNaturalLanguageQuery } from '../src/services/aiService';
import { SAAS_CUSTOMERS_DATA, inferDatasetSchema } from '../src/services/sampleData';
import { profileDatasetSchema } from '../src/services/schemaProfiler';
import { checkMetricAvailability } from '../src/services/validators';

const saasDataset = inferDatasetSchema(SAAS_CUSTOMERS_DATA, 'customers', 'SaaS Customer Retention & MRR');
const saasSchema = profileDatasetSchema(saasDataset);

const BANNED_BOILERPLATES = [
  'Audit downstream data pipelines',
  'Review commercial thresholds prior to capital deployment',
  'Review variance thresholds against historical quarterly trends',
  'All verified metrics conform to expected baseline constraints',
  'Data scope is bounded to active table filters',
];

function assertNoBannedBoilerplate(summary: any) {
  const combined = JSON.stringify(summary);
  for (const phrase of BANNED_BOILERPLATES) {
    assert.strictEqual(
      combined.includes(phrase),
      false,
      `Banned boilerplate detected: "${phrase}"`
    );
  }
}

describe('Executive Analysis Summary — Evidence-First Intelligence Suite', () => {
  // ------------------------------------------------------------------------
  // Test Group A: Basic Analytical Questions
  // ------------------------------------------------------------------------
  describe('Test Group A: Basic Analytical Questions', () => {
    it('A1: "How many customers are in the dataset?" — correct count, no generic recommendations or anomalies', () => {
      const q = 'How many customers are in the dataset?';
      const curated = getDeterministicCuratedQuery(q, saasDataset);
      assert.ok(curated, 'Curated match expected');

      const summary = generateEvidenceBasedSummary({
        question: q,
        sql: curated.sql,
        status: 'verified',
        rows: [{ total_customers: 25 }],
        columns: ['total_customers'],
        rowCount: 1,
        datasetName: saasDataset.name,
        tableName: saasDataset.tableName,
        semanticSchema: saasSchema,
      });

      assert.strictEqual(summary.status, 'verified');
      assert.strictEqual(summary.overview, 'Your dataset contains 25 distinct customers.');
      assert.ok(!summary.overview?.includes('1 record(s) matching the requested criteria'));
      assert.strictEqual((summary.anomalies || []).length, 0, 'No anomalies for valid simple count');
      assert.strictEqual((summary.business_implications || []).length, 0, 'No manufactured implications for simple count');
      assertNoBannedBoilerplate(summary);
    });

    it('A2: "What is the total MRR across all customers?" — correct total, no invented financial trends', () => {
      const q = 'What is the total MRR across all customers?';
      const curated = getDeterministicCuratedQuery(q, saasDataset);
      assert.ok(curated, 'Curated match expected');

      const summary = generateEvidenceBasedSummary({
        question: q,
        sql: curated.sql,
        status: 'verified',
        rows: [{ total_mrr: 158400 }],
        columns: ['total_mrr'],
        rowCount: 1,
        datasetName: saasDataset.name,
        tableName: saasDataset.tableName,
        semanticSchema: saasSchema,
      });

      assert.strictEqual(summary.status, 'verified');
      assert.ok(summary.overview?.includes('$158,400'), 'Overview must report exact verified total $158,400');
      assert.strictEqual((summary.anomalies || []).length, 0);
      assert.strictEqual((summary.business_implications || []).length, 0);
      assert.ok(
        summary.limitations?.some((l) => l.includes('Historical revenue trends or comparisons cannot be established')),
        'Must state snapshot limitation without manufacturing past growth'
      );
      assertNoBannedBoilerplate(summary);
    });

    it('A3: "Show the top 5 customers by MRR." — correct leader, MRR, grounded in displayed results', () => {
      const q = 'Show the top 5 customers by MRR.';
      const curated = getDeterministicCuratedQuery(q, saasDataset);
      assert.ok(curated, 'Curated match expected');

      const top5Rows = [
        { company_name: 'Ironclad Security', plan_tier: 'Enterprise', mrr: 11200, churn_status: 'Active', support_tickets: 3 },
        { company_name: 'Beacon Health Systems', plan_tier: 'Enterprise', mrr: 10400, churn_status: 'Active', support_tickets: 2 },
        { company_name: 'Vortex Global', plan_tier: 'Enterprise', mrr: 9800, churn_status: 'Active', support_tickets: 1 },
        { company_name: 'Hyperion Capital', plan_tier: 'Enterprise', mrr: 8900, churn_status: 'Active', support_tickets: 2 },
        { company_name: 'Acme Cloud Corp', plan_tier: 'Enterprise', mrr: 8400, churn_status: 'Active', support_tickets: 2 },
      ];

      const summary = generateEvidenceBasedSummary({
        question: q,
        sql: curated.sql,
        status: 'verified',
        rows: top5Rows,
        columns: ['company_name', 'plan_tier', 'mrr', 'churn_status', 'support_tickets'],
        rowCount: 5,
        datasetName: saasDataset.name,
        tableName: saasDataset.tableName,
        semanticSchema: saasSchema,
      });

      assert.strictEqual(summary.status, 'verified');
      assert.ok(summary.overview?.includes('Ironclad Security leads with $11,200'), 'Must identify Ironclad Security as leader with $11,200');
      assert.ok(summary.overview?.includes('Beacon Health Systems with $10,400'), 'Must identify Beacon Health Systems as second');
      assert.ok(summary.findings?.some((f) => f.includes('$8,400 to $11,200') || f.includes('Ironclad Security')));
      assertNoBannedBoilerplate(summary);
    });
  });

  // ------------------------------------------------------------------------
  // Test Group B: Grouped Analysis
  // ------------------------------------------------------------------------
  describe('Test Group B: Grouped Analysis', () => {
    it('B1: "What is the average MRR by customer segment?" — correct highest and lowest segments and values', () => {
      const q = 'What is the average MRR by customer segment?';
      const curated = getDeterministicCuratedQuery(q, saasDataset);
      assert.ok(curated, 'Curated match expected');

      const segmentRows = [
        { plan_tier: 'Enterprise', customer_count: 10, avg_mrr: 8330, total_mrr: 83300 },
        { plan_tier: 'Professional', customer_count: 8, avg_mrr: 2431.25, total_mrr: 19450 },
        { plan_tier: 'Starter', customer_count: 7, avg_mrr: 338.57, total_mrr: 2370 },
      ];

      const summary = generateEvidenceBasedSummary({
        question: q,
        sql: curated.sql,
        status: 'verified',
        rows: segmentRows,
        columns: ['plan_tier', 'customer_count', 'avg_mrr', 'total_mrr'],
        rowCount: 3,
        datasetName: saasDataset.name,
        tableName: saasDataset.tableName,
        semanticSchema: saasSchema,
      });

      assert.strictEqual(summary.status, 'verified');
      assert.ok(summary.overview?.includes('Enterprise has the highest average mrr at $8,330'));
      assert.ok(summary.overview?.includes('Starter has the lowest at $338.57'));
      assert.ok(summary.findings?.some((f) => f.includes('Enterprise: mrr is $8,330')));
      assert.ok(summary.findings?.some((f) => f.includes('Starter: mrr is $338.57')));
      assertNoBannedBoilerplate(summary);
    });

    it('B2: "Calculate active customer percentages by segment." — correct percentages and denominators', () => {
      const q = 'Calculate active customer percentages by segment.';
      const curated = getDeterministicCuratedQuery(q, saasDataset);
      assert.ok(curated, 'Curated match expected');

      const pctRows = [
        { plan_tier: 'Starter', total_customers: 7, active_customers: 6, active_percentage: 85.7 },
        { plan_tier: 'Enterprise', total_customers: 10, active_customers: 7, active_percentage: 70.0 },
        { plan_tier: 'Professional', total_customers: 8, active_customers: 5, active_percentage: 62.5 },
      ];

      const summary = generateEvidenceBasedSummary({
        question: q,
        sql: curated.sql,
        status: 'verified',
        rows: pctRows,
        columns: ['plan_tier', 'total_customers', 'active_customers', 'active_percentage'],
        rowCount: 3,
        datasetName: saasDataset.name,
        tableName: saasDataset.tableName,
        semanticSchema: saasSchema,
      });

      assert.strictEqual(summary.status, 'verified');
      assert.ok(curated.insight?.summary?.includes('Starter at 85.7% (6 of 7)'));
      assert.ok(curated.insight?.summary?.includes('Enterprise at 70.0% (7 of 10)'));
      assert.ok(curated.insight?.summary?.includes('Professional at 62.5% (5 of 8)'));
      assertNoBannedBoilerplate(summary);
    });

    it('B3: "For each segment, calculate active customer count and active MRR." — accurate leading segment and no generic recommendations', () => {
      const q = 'For each segment, calculate active customer count and active MRR.';
      const curated = getDeterministicCuratedQuery(q, saasDataset);
      assert.ok(curated, 'Curated match expected');

      const multiMetricRows = [
        { plan_tier: 'Enterprise', active_customer_count: 7, active_mrr: 58300, total_mrr: 83300 },
        { plan_tier: 'Professional', active_customer_count: 5, active_mrr: 12300, total_mrr: 19450 },
        { plan_tier: 'Starter', active_customer_count: 6, active_mrr: 2030, total_mrr: 2370 },
      ];

      const summary = generateEvidenceBasedSummary({
        question: q,
        sql: curated.sql,
        status: 'verified',
        rows: multiMetricRows,
        columns: ['plan_tier', 'active_customer_count', 'active_mrr', 'total_mrr'],
        rowCount: 3,
        datasetName: saasDataset.name,
        tableName: saasDataset.tableName,
        semanticSchema: saasSchema,
      });

      assert.strictEqual(summary.status, 'verified');
      assert.ok(summary.findings?.some((f) => f.includes('Enterprise leads in active mrr with $58,300')));
      assert.ok(summary.business_implications?.some((i) => (typeof i === 'string' ? i : i.implication).includes('Customer volume does not directly scale with revenue')));
      assertNoBannedBoilerplate(summary);
    });
  });

  // ------------------------------------------------------------------------
  // Test Group C: Advanced Analysis
  // ------------------------------------------------------------------------
  describe('Test Group C: Advanced Analysis', () => {
    it('C1: "Show the top two customers by MRR in each segment." — correct ranking and tie handling', () => {
      const q = 'Show the top two customers by MRR in each segment.';
      const curated = getDeterministicCuratedQuery(q, saasDataset);
      assert.ok(curated, 'Curated match expected');

      const top2Rows = [
        { company_name: 'Ironclad Security', plan_tier: 'Enterprise', mrr: 11200, churn_status: 'Active', rank: 1 },
        { company_name: 'Beacon Health Systems', plan_tier: 'Enterprise', mrr: 10400, churn_status: 'Active', rank: 2 },
        { company_name: 'Zenith Biotech', plan_tier: 'Professional', mrr: 3200, churn_status: 'Active', rank: 1 },
        { company_name: 'Starlight Retail', plan_tier: 'Professional', mrr: 2800, churn_status: 'Active', rank: 2 },
        { company_name: 'CloudForge Labs', plan_tier: 'Starter', mrr: 450, churn_status: 'Active', rank: 1 },
        { company_name: 'CargoWave Express', plan_tier: 'Starter', mrr: 390, churn_status: 'Churned', rank: 2 },
      ];

      const summary = generateEvidenceBasedSummary({
        question: q,
        sql: curated.sql,
        status: 'verified',
        rows: top2Rows,
        columns: ['company_name', 'plan_tier', 'mrr', 'churn_status', 'rank'],
        rowCount: 6,
        datasetName: saasDataset.name,
        tableName: saasDataset.tableName,
        semanticSchema: saasSchema,
      });

      assert.strictEqual(summary.status, 'verified');
      assert.ok(summary.overview?.includes('6 customers were ranked'));
      assert.ok(summary.findings?.some((f) => f.includes('Ironclad Security leads')));
      assertNoBannedBoilerplate(summary);
    });

    it('C2: "Which cities have more than three active customers?" — identifies qualifying cities and grouped metrics', () => {
      const cityRows = [
        { city: 'San Francisco', active_customer_count: 5 },
        { city: 'New York', active_customer_count: 4 },
      ];

      const summary = generateEvidenceBasedSummary({
        question: 'Which cities have more than three active customers?',
        sql: `SELECT city, COUNT(*) AS active_customer_count FROM customers WHERE churn_status = 'Active' GROUP BY city HAVING COUNT(*) > 3 ORDER BY active_customer_count DESC`,
        status: 'verified',
        rows: cityRows,
        columns: ['city', 'active_customer_count'],
        rowCount: 2,
        datasetName: 'Customers with Geography',
        tableName: 'customers',
      });

      assert.strictEqual(summary.status, 'verified');
      assert.ok(summary.overview?.includes('San Francisco has the highest'));
      assert.ok(summary.findings?.some((f) => f.includes('San Francisco: active customer count is 5')));
      assert.ok(summary.findings?.some((f) => f.includes('New York: active customer count is 4')));
      assertNoBannedBoilerplate(summary);
    });

    it('C3: "Find Enterprise customers with more than three support tickets." — recommendations related to support tickets', () => {
      const q = 'Find Enterprise customers with more than 3 support tickets.';
      const curated = getDeterministicCuratedQuery(q, saasDataset);
      assert.ok(curated, 'Curated match expected');

      const highTicketRows = [
        { company_name: 'AeroFleet Mobility', plan_tier: 'Enterprise', mrr: 6700, churn_status: 'Churned', support_tickets: 15, nps_score: 4 },
        { company_name: 'Apex Analytics', plan_tier: 'Enterprise', mrr: 6200, churn_status: 'Churned', support_tickets: 14, nps_score: 4 },
        { company_name: 'Aura Commerce', plan_tier: 'Enterprise', mrr: 6800, churn_status: 'At-Risk', support_tickets: 13, nps_score: 5 },
        { company_name: 'Nexus Dynamics', plan_tier: 'Enterprise', mrr: 5900, churn_status: 'At-Risk', support_tickets: 11, nps_score: 6 },
      ];

      const summary = generateEvidenceBasedSummary({
        question: q,
        sql: curated.sql,
        status: 'verified',
        rows: highTicketRows,
        columns: ['company_name', 'plan_tier', 'mrr', 'churn_status', 'support_tickets', 'nps_score'],
        rowCount: 4,
        datasetName: saasDataset.name,
        tableName: saasDataset.tableName,
        semanticSchema: saasSchema,
      });

      assert.strictEqual(summary.status, 'verified');
      assert.ok(summary.overview?.includes('Found 4 customers matching'));
      assert.ok(
        summary.recommended_actions?.some((a) =>
          a.action.toLowerCase().includes('support') || a.action.toLowerCase().includes('ticket')
        ),
        'Recommendations must directly relate to support tickets'
      );
      assertNoBannedBoilerplate(summary);
    });
  });

  // ------------------------------------------------------------------------
  // Test Group D: Unsupported and Insufficient-Data Scenarios
  // ------------------------------------------------------------------------
  describe('Test Group D: Unsupported and Insufficient-Data Scenarios', () => {
    it('D1: "Calculate churn probability for every customer." — identifies insufficient info, no invented numbers', () => {
      const check = checkMetricAvailability('Calculate churn probability for every customer.', saasSchema);
      assert.strictEqual(check.isAvailable, false);
      assert.strictEqual(check.missingMetric, 'churn probability');
      assert.ok(check.clarification?.includes('predictive models'));

      const summary = generateEvidenceBasedSummary({
        question: 'Calculate churn probability for every customer.',
        sql: '',
        status: 'needs_clarification',
        rows: [],
        columns: [],
        rowCount: 0,
        datasetName: saasDataset.name,
        tableName: saasDataset.tableName,
      });

      assert.strictEqual(summary.status, 'needs_clarification');
      assert.ok(summary.overview?.includes('predictive analysis cannot be calculated'));
      assert.ok(summary.limitations?.some((l) => l.includes('predictive models')));
      assertNoBannedBoilerplate(summary);
    });

    it('D2: "Predict next year\'s revenue." — does not invent forecast without historical time-series model', () => {
      const check = checkMetricAvailability("Predict next year's revenue.", saasSchema);
      assert.strictEqual(check.isAvailable, false);
      assert.strictEqual(check.missingMetric, 'revenue forecast');

      const summary = generateEvidenceBasedSummary({
        question: "Predict next year's revenue.",
        sql: '',
        status: 'needs_clarification',
        rows: [],
        columns: [],
        rowCount: 0,
        datasetName: saasDataset.name,
        tableName: saasDataset.tableName,
      });

      assert.strictEqual(summary.status, 'needs_clarification');
      assert.ok(summary.overview?.includes('predictive analysis cannot be calculated'));
      assertNoBannedBoilerplate(summary);
    });

    it('D3: "Identify which customers will cancel next month." — does not fabricate predictive conclusions', () => {
      const check = checkMetricAvailability('Identify which customers will cancel next month.', saasSchema);
      assert.strictEqual(check.isAvailable, false);
      assert.strictEqual(check.missingMetric, 'predictive cancellation');

      const summary = generateEvidenceBasedSummary({
        question: 'Identify which customers will cancel next month.',
        sql: '',
        status: 'needs_clarification',
        rows: [],
        columns: [],
        rowCount: 0,
        datasetName: saasDataset.name,
        tableName: saasDataset.tableName,
      });

      assert.strictEqual(summary.status, 'needs_clarification');
      assert.ok(summary.overview?.includes('predictive analysis cannot be calculated'));
      assertNoBannedBoilerplate(summary);
    });
  });

  // ------------------------------------------------------------------------
  // Test Group E: Execution Failures and Edge Cases
  // ------------------------------------------------------------------------
  describe('Test Group E: Execution Failures and Edge Cases', () => {
    it('E1: SQL execution failure — clear error state, zero fabricated findings or recommendations', () => {
      const summary = generateEvidenceBasedSummary({
        question: 'SELECT * FROM nonexistent_table',
        sql: 'SELECT * FROM nonexistent_table',
        status: 'error',
        error: 'Table with name nonexistent_table does not exist!',
        rows: [],
        columns: [],
        rowCount: 0,
        datasetName: saasDataset.name,
        tableName: saasDataset.tableName,
      });

      assert.strictEqual(summary.status, 'error');
      assert.ok(summary.overview?.includes('Execution was unsuccessful'));
      assert.strictEqual(summary.findings?.length, 0);
      assert.strictEqual(summary.anomalies?.length, 0);
      assert.strictEqual(summary.recommended_actions?.length, 0);
      assertNoBannedBoilerplate(summary);
    });

    it('E2: Empty result set — communicates 0 records matched without false business crisis', () => {
      const summary = generateEvidenceBasedSummary({
        question: 'Find customers with MRR > 100000',
        sql: 'SELECT * FROM customers WHERE mrr > 100000',
        status: 'empty',
        rows: [],
        columns: ['company_name', 'mrr'],
        rowCount: 0,
        datasetName: saasDataset.name,
        tableName: saasDataset.tableName,
      });

      assert.strictEqual(summary.status, 'empty');
      assert.ok(summary.overview?.includes('No records matched the specified criteria'));
      assert.strictEqual(summary.anomalies?.length, 0, 'Must NOT treat 0 rows as a critical anomaly');
      assert.strictEqual(summary.business_implications?.length, 0);
      assertNoBannedBoilerplate(summary);
    });

    it('E3: Single-row result — does not confuse one returned row with one underlying customer', () => {
      const summary = generateEvidenceBasedSummary({
        question: 'How many customers are in the dataset?',
        sql: 'SELECT COUNT(*) AS total_customers FROM customers',
        status: 'verified',
        rows: [{ total_customers: 25 }],
        columns: ['total_customers'],
        rowCount: 1,
        datasetName: saasDataset.name,
        tableName: saasDataset.tableName,
      });

      assert.ok(!summary.overview?.includes('1 customer'));
      assert.ok(!summary.overview?.includes('1 record(s) matching'));
      assert.ok(summary.overview?.includes('25 distinct customers'));
      assertNoBannedBoilerplate(summary);
    });

    it('E4: Missing optional fields — graceful degradation, no null or undefined in rendered summary', () => {
      const summary = generateEvidenceBasedSummary({
        question: 'Show sample data',
        sql: 'SELECT * FROM customers LIMIT 1',
        status: 'verified',
        rows: [{ colA: null, colB: undefined, colC: 'Value' }],
        columns: ['colA', 'colB', 'colC'],
        rowCount: 1,
        datasetName: 'Test Dataset',
        tableName: 'test_table',
      });

      const serialized = JSON.stringify(summary);
      assert.ok(!serialized.includes('undefined'), 'Must not serialize raw undefined string');
      assert.ok(!serialized.includes('null record'), 'Must not serialize null record text');
      assertNoBannedBoilerplate(summary);
    });

    it('E6: Malformed LLM output — safely falls back to deterministic summary without broken state', () => {
      const summary = generateEvidenceBasedSummary({
        question: 'Show top customer',
        sql: 'SELECT company_name, mrr FROM customers ORDER BY mrr DESC LIMIT 1',
        status: 'verified',
        rows: [{ company_name: 'Ironclad Security', mrr: 11200 }],
        columns: ['company_name', 'mrr'],
        rowCount: 1,
        datasetName: saasDataset.name,
        tableName: saasDataset.tableName,
        llmInsight: {
          summary: undefined,
          highlights: ['{MALFORMED_JSON_STRING}'],
        },
      });

      assert.strictEqual(summary.status, 'verified');
      assert.ok(summary.overview?.includes('Ironclad Security leads with $11,200'));
      assertNoBannedBoilerplate(summary);
    });

    it('E7: Query result containing unusually large values, nulls, or negative numbers', () => {
      const rows = [
        { product: 'Desk Chair', profit: -80, sales: 720 },
        { product: 'Studio Monitor', profit: 340, sales: 1250 },
      ];

      const summary = generateEvidenceBasedSummary({
        question: 'Show profit by product',
        sql: 'SELECT product, profit, sales FROM orders',
        status: 'verified',
        rows,
        columns: ['product', 'profit', 'sales'],
        rowCount: 2,
        datasetName: 'Orders',
        tableName: 'orders',
      });

      assert.strictEqual(summary.status, 'verified');
      assert.ok(summary.overview?.length! > 0);
      assertNoBannedBoilerplate(summary);
    });
  });

  describe('Phase 10 — Advanced Evidence-Backed Business Intelligence Narrative Verification', () => {
    it('Scenario 1: Customer segment comparison — Enterprise share %, 9.2x ratio, SMB activation, and volume vs revenue contrast', () => {
      const q = 'Multi-metric analysis compares total_customers, active_customers, active_customer_percentage, total_mrr, average_mrr across 4 segment groups';
      const segmentRows = [
        { segment: 'Enterprise', total_customers: 7, active_customers: 7, active_customer_percentage: 100, total_mrr: 14000, average_mrr: 2000 },
        { segment: 'Mid-Market', total_customers: 4, active_customers: 3, active_customer_percentage: 75, total_mrr: 5950, average_mrr: 1487.5 },
        { segment: 'SMB', total_customers: 9, active_customers: 8, active_customer_percentage: 88.9, total_mrr: 1950, average_mrr: 216.67 },
        { segment: 'Startup', total_customers: 8, active_customers: 6, active_customer_percentage: 75, total_mrr: 1100, average_mrr: 137.50 },
      ];

      const summary = generateEvidenceBasedSummary({
        question: q,
        sql: 'SELECT segment, COUNT(*) AS total_customers, SUM(CASE WHEN status="Active" THEN 1 ELSE 0 END) AS active_customers, ROUND(SUM(CASE WHEN status="Active" THEN 1 ELSE 0 END)*100.0/COUNT(*), 1) AS active_customer_percentage, SUM(mrr) AS total_mrr, ROUND(AVG(mrr), 2) AS average_mrr FROM customers GROUP BY segment ORDER BY total_mrr DESC',
        status: 'verified',
        rows: segmentRows,
        columns: ['segment', 'total_customers', 'active_customers', 'active_customer_percentage', 'total_mrr', 'average_mrr'],
        rowCount: 4,
        datasetName: 'SaaS Customers',
        tableName: 'customers',
      });

      assert.strictEqual(summary.status, 'verified');
      // Overview identifies Enterprise as strongest revenue generator with average
      assert.ok(summary.overview?.includes('Enterprise'));
      assert.ok(summary.overview?.includes('$14,000'));
      assert.ok(summary.overview?.includes('$2,000'));
      // Key findings: 60.9% share, 9.2x SMB ratio, SMB 88.9% activation
      assert.ok(summary.findings?.some((f) => f.includes('60.9%') && f.includes('Enterprise')));
      assert.ok(summary.findings?.some((f) => f.includes('9.2 times') && f.includes('Enterprise')));
      assert.ok(summary.findings?.some((f) => f.includes('SMB') && f.includes('88.9%')));
      // Performance comparison section populated
      assert.ok(summary.performance_comparison && summary.performance_comparison.length >= 3);
      assert.ok(summary.performance_comparison.some((p) => p.includes('Revenue Leadership: Enterprise')));
      assert.ok(summary.performance_comparison.some((p) => p.includes('SMB')));
      // Business implications: volume vs revenue scaling
      assert.ok(summary.business_implications?.some((i) => (typeof i === 'string' ? i : i.implication).includes('Customer volume does not directly scale with revenue')));
      // Actions: Enterprise retention and SMB upselling
      assert.ok(summary.recommended_actions?.some((a) => a.action.includes('Enterprise') && a.action.includes('retention')));
      assert.ok(summary.recommended_actions?.some((a) => a.action.includes('SMB') && a.action.includes('average revenue')));
      assertNoBannedBoilerplate(summary);
    });

    it('Scenario 2: Acquisition channels — Referral total revenue, Partner average value, Outbound 25% outlier, and CAC limitation', () => {
      const q = 'Compare acquisition channels across total MRR, average MRR, and active customer percentage';
      const channelRows = [
        { channel: 'Referral', total_customers: 8, total_mrr: 7300, average_mrr: 912.50, active_customer_percentage: 100 },
        { channel: 'Partner', total_customers: 5, total_mrr: 6050, average_mrr: 1210, active_customer_percentage: 100 },
        { channel: 'Organic Search', total_customers: 6, total_mrr: 3450, average_mrr: 575, active_customer_percentage: 83.3 },
        { channel: 'Paid Ads', total_customers: 5, total_mrr: 1650, average_mrr: 330, active_customer_percentage: 60 },
        { channel: 'Outbound', total_customers: 4, total_mrr: 800, average_mrr: 200, active_customer_percentage: 25 },
      ];

      const summary = generateEvidenceBasedSummary({
        question: q,
        sql: 'SELECT channel, COUNT(*) as total_customers, SUM(mrr) as total_mrr, AVG(mrr) as average_mrr, active_customer_percentage FROM customers GROUP BY channel ORDER BY total_mrr DESC',
        status: 'verified',
        rows: channelRows,
        columns: ['channel', 'total_customers', 'total_mrr', 'average_mrr', 'active_customer_percentage'],
        rowCount: 5,
        datasetName: 'Marketing Attribution',
        tableName: 'customers',
      });

      assert.strictEqual(summary.status, 'verified');
      // Overview distinguishes Referral total vs Partner average
      assert.ok(summary.overview?.includes('Referral is the largest'));
      assert.ok(summary.overview?.includes('Partner delivers the highest average'));
      // Key findings: Partner ~33% higher average than Referral ($1,210 vs $912.50), Outbound lowest activation
      assert.ok(summary.findings?.some((f) => f.includes('Partner') && f.includes('33% higher')));
      assert.ok(summary.findings?.some((f) => f.includes('Outbound') && f.includes('25%')));
      // Performance comparison contains both revenue leader and average value leader
      assert.ok(summary.performance_comparison?.some((p) => p.includes('Revenue Leadership: Referral')));
      assert.ok(summary.performance_comparison?.some((p) => p.includes('Average Value Leadership: Partner')));
      assert.ok(summary.performance_comparison?.some((p) => p.includes('Lowest Activation: Outbound')));
      // Limitations explicitly states CAC / LTV absence
      assert.ok(summary.limitations?.some((l) => l.includes('Acquisition costs') && l.includes('CAC')));
      assertNoBannedBoilerplate(summary);
    });

    it('Scenario 3: City-level performance — Chennai leader, Delhi low outlier with 1 of 3 active, Mumbai/Bangalore cohorts', () => {
      const q = 'Compare city performance across total MRR, active customers, and active customer percentage';
      const cityRows = [
        { city: 'Chennai', total_customers: 4, active_customers: 4, active_customer_percentage: 100, total_mrr: 5700 },
        { city: 'Mumbai', total_customers: 4, active_customers: 4, active_customer_percentage: 100, total_mrr: 4800 },
        { city: 'Bangalore', total_customers: 3, active_customers: 3, active_customer_percentage: 100, total_mrr: 1050 },
        { city: 'Delhi', total_customers: 3, active_customers: 1, active_customer_percentage: 33.3, total_mrr: 350 },
      ];

      const summary = generateEvidenceBasedSummary({
        question: q,
        sql: 'SELECT city, COUNT(*) as total_customers, SUM(CASE WHEN active THEN 1 ELSE 0 END) as active_customers, active_customer_percentage, SUM(mrr) as total_mrr FROM customers GROUP BY city ORDER BY total_mrr DESC',
        status: 'verified',
        rows: cityRows,
        columns: ['city', 'total_customers', 'active_customers', 'active_customer_percentage', 'total_mrr'],
        rowCount: 4,
        datasetName: 'Geographic Customers',
        tableName: 'customers',
      });

      assert.strictEqual(summary.status, 'verified');
      // Overview highlights Chennai lead and Delhi outlier
      assert.ok(summary.overview?.includes('Chennai leads'));
      assert.ok(summary.overview?.includes('Delhi is a significant outlier'));
      assert.ok(summary.overview?.includes('1 of its 3 customers active'));
      // Key findings: 100% active cohort in Chennai, Mumbai, Bangalore; Delhi 93.9% lower than Chennai
      assert.ok(summary.findings?.some((f) => f.includes('Chennai, Mumbai, Bangalore') && f.includes('100% active customer rate')));
      assert.ok(summary.findings?.some((f) => f.includes('Delhi') && f.includes('93.9% lower')));
      // Geographic limitation
      assert.ok(summary.limitations?.some((l) => l.includes('causes of geographic performance differences')));
      assertNoBannedBoilerplate(summary);
    });

    it('Scenario 4: Customer risk & attention analysis — multi-flag accounts, cancelled separation, actionable reviews', () => {
      const q = 'Identify customer accounts with high support tickets or abnormal usage for risk review';
      const riskRows = [
        { customer_name: 'Evergreen Logistics', support_tickets: 5, usage_percentage: 85, status: 'Active', mrr: 14000 },
        { customer_name: 'Orion Systems', support_tickets: 4, usage_percentage: 120, status: 'Active', mrr: 8200 },
        { customer_name: 'Zenith Labs', support_tickets: 6, usage_percentage: 115, status: 'Cancelled', mrr: 1200 },
        { customer_name: 'Delta Technologies', support_tickets: 4, usage_percentage: 95, status: 'Cancelled', mrr: 6500 },
      ];

      const summary = generateEvidenceBasedSummary({
        question: q,
        sql: 'SELECT customer_name, support_tickets, usage_percentage, status, mrr FROM customers WHERE support_tickets > 3 OR usage_percentage > 100',
        status: 'verified',
        rows: riskRows,
        columns: ['customer_name', 'support_tickets', 'usage_percentage', 'status', 'mrr'],
        rowCount: 4,
        datasetName: 'Customer Risk Review',
        tableName: 'customers',
      });

      assert.strictEqual(summary.status, 'verified');
      // Multi-flag detection (Zenith Labs has 6 tickets and 115% usage)
      assert.ok(summary.findings?.some((f) => f.includes('Zenith Labs') && f.includes('6 support tickets') && f.includes('115% usage')));
      // High MRR with high tickets (Evergreen Logistics: $14,000 MRR, 5 tickets)
      assert.ok(summary.findings?.some((f) => f.includes('Evergreen Logistics') && f.includes('$14,000') && f.includes('5 support tickets')));
      // Cancelled status separation
      assert.ok(summary.findings?.some((f) => f.includes('Delta Technologies') && f.includes('Cancelled')));
      // Actions: separate cancelled accounts from active customer follow-up
      assert.ok(summary.recommended_actions?.some((a) => a.action.includes('Separate cancelled accounts')));
      assert.ok(summary.recommended_actions?.some((a) => a.action.includes('Prioritize account reviews for high-MRR customers')));
      assertNoBannedBoilerplate(summary);
    });

    it('Scenario 5: Ranking and top-N analysis with exact tie handling — detects ties, prevents false discrimination', () => {
      const q = 'Top SMB customers ranked by MRR';
      const tieRows = [
        { company_name: 'Nexus Dynamics', segment: 'SMB', mrr: 450, rank: 1 },
        { company_name: 'Meridian Works', segment: 'SMB', mrr: 300, rank: 2 },
        { company_name: 'Orion Group', segment: 'SMB', mrr: 300, rank: 2 },
        { company_name: 'Solaris Cloud', segment: 'SMB', mrr: 200, rank: 4 },
      ];

      const summary = generateEvidenceBasedSummary({
        question: q,
        sql: 'SELECT company_name, segment, mrr, RANK() OVER(ORDER BY mrr DESC) as rank FROM customers WHERE segment = "SMB" LIMIT 4',
        status: 'verified',
        rows: tieRows,
        columns: ['company_name', 'segment', 'mrr', 'rank'],
        rowCount: 4,
        datasetName: 'SMB Customers',
        tableName: 'customers',
      });

      assert.strictEqual(summary.status, 'verified');
      // Overview notes tie handling
      assert.ok(summary.overview?.includes('Nexus Dynamics leads'));
      assert.ok(summary.overview?.includes('importance of correctly handling ties'));
      // Key findings: Meridian Works and Orion Group tied at $300
      assert.ok(summary.findings?.some((f) => f.includes('Meridian Works and Orion Group are tied at $300')));
      // Recommends documented tie-breaking rules
      assert.ok(summary.recommended_actions?.some((a) => a.action.includes('Use a documented tie-breaking rule')));
      assertNoBannedBoilerplate(summary);
    });
  });
});
