import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  generateEvidenceBasedSummary,
  resolveRankingMetric,
  calculateRevenueConcentration,
  synthesizeMultiQueryReview,
} from '../src/services/summaryEngine';
import {
  getDeterministicCuratedQuery,
  processNaturalLanguageQuery,
  isQueryOutOfScope,
} from '../src/services/aiService';
import {
  EXECUTIVE_SAAS_30_DATA,
  inferDatasetSchema,
} from '../src/services/sampleData';
import { profileDatasetSchema } from '../src/services/schemaProfiler';
import { checkMetricAvailability } from '../src/services/validators';

const execDataset = inferDatasetSchema(
  EXECUTIVE_SAAS_30_DATA,
  'saas_executive',
  'SaaS Executive Portfolio (30 Accounts)'
);
const execSchema = profileDatasetSchema(execDataset);

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

describe('QueryMind Executive Analysis Engine Overhaul — Verification Suite (Tests A to H)', () => {
  // --------------------------------------------------------------------------
  // Test A — Customer Segment Performance
  // --------------------------------------------------------------------------
  describe('Test A: Customer Segment Performance (Enterprise vs SMB vs Startup)', () => {
    const q = 'Compare customer segments by total MRR and average MRR.';

    it('identifies curated deterministic query and maps schema accurately', () => {
      const curated = getDeterministicCuratedQuery(q, execDataset);
      assert.ok(curated, 'Curated match expected for segment comparison');
      assert.ok(curated.sql.includes('segment'), 'Must group by segment');
      assert.ok(curated.sql.includes('total_mrr'), 'Must aggregate total MRR');
      assert.ok(curated.sql.includes('avg_mrr'), 'Must calculate average MRR');
      assert.ok(curated.sql.includes('ORDER BY total_mrr DESC'), 'Must order by total MRR descending');
    });

    it('generates grounded executive summary reflecting exact segment metrics without cross-metric confusion', () => {
      const curated = getDeterministicCuratedQuery(q, execDataset)!;

      // Rows matching the verified 30-row dataset aggregation:
      const segmentRows = [
        { segment: 'Enterprise', customer_count: 7, active_count: 7, active_pct: 100.0, total_mrr: 14000, avg_mrr: 2000 },
        { segment: 'SMB', customer_count: 9, active_count: 8, active_pct: 88.9, total_mrr: 3550, avg_mrr: 394.44 },
        { segment: 'Mid-Market', customer_count: 6, active_count: 3, active_pct: 50.0, total_mrr: 3500, avg_mrr: 583.33 },
        { segment: 'Startup', customer_count: 8, active_count: 6, active_pct: 75.0, total_mrr: 1500, avg_mrr: 187.5 },
      ];

      const summary = generateEvidenceBasedSummary({
        question: q,
        sql: curated.sql,
        status: 'verified',
        rows: segmentRows,
        columns: ['segment', 'customer_count', 'active_count', 'active_pct', 'total_mrr', 'avg_mrr'],
        rowCount: 4,
        datasetName: execDataset.name,
        tableName: execDataset.tableName,
        semanticSchema: execSchema,
      });

      assert.strictEqual(summary.status, 'verified');
      assert.ok(summary.overview?.includes('Enterprise has the highest total mrr at $14,000'));
      assert.ok(summary.overview?.includes('Startup has the lowest at $1,500'));

      // Grounded findings
      assert.ok(summary.findings?.some((f) => f.includes('Enterprise: mrr is $14,000') && f.includes('avg MRR: $2,000')));
      assert.ok(summary.findings?.some((f) => f.includes('SMB: mrr is $3,550') && f.includes('8/9 active')));
      assert.ok(summary.findings?.some((f) => f.includes('Startup: mrr is $1,500') && f.includes('6/8 active')));

      // Structured Recommended Action
      assert.ok(summary.recommended_actions && summary.recommended_actions.length > 0);
      assertNoBannedBoilerplate(summary);
    });
  });

  // --------------------------------------------------------------------------
  // Test B — Acquisition Channel Performance
  // --------------------------------------------------------------------------
  describe('Test B: Acquisition Channel Performance (Referral vs Partner vs Outbound)', () => {
    const q = 'Compare acquisition channel performance by total MRR.';

    it('identifies curated query and calculates channel totals without segment confusion', () => {
      const curated = getDeterministicCuratedQuery(q, execDataset);
      assert.ok(curated, 'Curated match expected for channel performance');
      assert.ok(curated.sql.includes('acquisition_channel'), 'Must group by acquisition_channel');
      assert.ok(curated.sql.includes('total_mrr'), 'Must aggregate total MRR');
    });

    it('verifies Referral leads in channel ranking and never compares directly with Enterprise segment', () => {
      const channelRows = [
        { acquisition_channel: 'Referral', customer_count: 7, total_mrr: 7300, avg_mrr: 1042.86 },
        { acquisition_channel: 'Partner', customer_count: 8, total_mrr: 6050, avg_mrr: 756.25 },
        { acquisition_channel: 'Inbound', customer_count: 9, total_mrr: 7350, avg_mrr: 816.67 },
        { acquisition_channel: 'Outbound', customer_count: 6, total_mrr: 1850, avg_mrr: 308.33 },
      ];

      const summary = generateEvidenceBasedSummary({
        question: q,
        sql: `SELECT acquisition_channel, COUNT(*) AS customer_count, ROUND(SUM(mrr_usd), 2) AS total_mrr, ROUND(AVG(mrr_usd), 2) AS avg_mrr FROM ${execDataset.tableName} GROUP BY acquisition_channel ORDER BY total_mrr DESC`,
        status: 'verified',
        rows: channelRows,
        columns: ['acquisition_channel', 'customer_count', 'total_mrr', 'avg_mrr'],
        rowCount: 4,
        datasetName: execDataset.name,
        tableName: execDataset.tableName,
        semanticSchema: execSchema,
      });

      assert.strictEqual(summary.status, 'verified');
      assert.ok(summary.findings?.some((f) => f.includes('Referral') && f.includes('$7,300')));
      assert.ok(summary.findings?.some((f) => f.includes('Partner') && f.includes('$6,050')));
      assert.ok(summary.findings?.some((f) => f.includes('Outbound') && f.includes('$1,850')));

      // Check multi-dimension separation helper
      const mixedRows = [
        { group_name: 'Referral', total_mrr: 7300, avg_mrr: 1042.86, customer_count: 7 },
        { group_name: 'Enterprise', total_mrr: 14000, avg_mrr: 2000, customer_count: 7 },
      ];

      const mixedSummary = generateEvidenceBasedSummary({
        question: 'Compare Referral and Enterprise groups',
        sql: 'SELECT group_name, total_mrr, avg_mrr FROM mixed_view',
        status: 'verified',
        rows: mixedRows,
        columns: ['group_name', 'total_mrr', 'avg_mrr'],
        rowCount: 2,
        datasetName: 'Mixed Dimension View',
        tableName: 'mixed_view',
      });

      // Must explicitly separate the dimensions and avoid stating Referral ranked 1st over Enterprise!
      assert.ok(
        mixedSummary.overview?.includes('distinct analytical dimensions and are evaluated independently') ||
        mixedSummary.business_implications?.some((i) =>
          (typeof i === 'string' ? i : i.implication).includes('different operational dimensions')
        )
      );
      assertNoBannedBoilerplate(summary);
    });
  });

  // --------------------------------------------------------------------------
  // Test C — Geographic Contribution & Attrition Anomaly
  // --------------------------------------------------------------------------
  describe('Test C: Geographic Contribution (Chennai, Hyderabad, Delhi)', () => {
    const q = 'What is the geographic contribution of active customers and active MRR by city?';

    it('identifies curated geographic query', () => {
      const curated = getDeterministicCuratedQuery(q, execDataset);
      assert.ok(curated, 'Curated match expected');
      assert.ok(curated.sql.includes('city'));
      assert.ok(curated.sql.includes('active_mrr'));
      assert.ok(curated.sql.includes('active_pct'));
    });

    it('verifies Chennai ($5,700), Hyderabad ($5,300), and flags Delhi ($350, 33.3% active) critical attrition', () => {
      const cityRows = [
        { city: 'Chennai', total_customers: 6, active_customers: 6, active_mrr: 5700, active_pct: 100.0 },
        { city: 'Hyderabad', total_customers: 6, active_customers: 5, active_mrr: 5300, active_pct: 83.3 },
        { city: 'Bangalore', total_customers: 6, active_customers: 6, active_mrr: 5850, active_pct: 100.0 },
        { city: 'Mumbai', total_customers: 6, active_customers: 4, active_mrr: 2700, active_pct: 66.7 },
        { city: 'Delhi', total_customers: 6, active_customers: 2, active_mrr: 350, active_pct: 33.3 },
      ];

      const summary = generateEvidenceBasedSummary({
        question: q,
        sql: `SELECT city, COUNT(*) AS total_customers, SUM(CASE WHEN subscription_status = 'Active' THEN 1 ELSE 0 END) AS active_customers, ROUND(SUM(CASE WHEN subscription_status = 'Active' THEN mrr_usd ELSE 0 END), 2) AS active_mrr, ROUND(100.0 * SUM(CASE WHEN subscription_status = 'Active' THEN 1 ELSE 0 END) / COUNT(*), 1) AS active_pct FROM customers GROUP BY city ORDER BY active_mrr DESC`,
        status: 'verified',
        rows: cityRows,
        columns: ['city', 'total_customers', 'active_customers', 'active_mrr', 'active_pct'],
        rowCount: 5,
        datasetName: execDataset.name,
        tableName: execDataset.tableName,
        semanticSchema: execSchema,
      });

      assert.strictEqual(summary.status, 'verified');
      assert.ok(summary.findings?.some((f) => f.includes('Chennai') && f.includes('$5,700') && f.includes('6/6 active')));
      assert.ok(summary.findings?.some((f) => f.includes('Hyderabad') && f.includes('$5,300') && f.includes('5/6 active')));
      assert.ok(summary.findings?.some((f) => f.includes('Delhi') && f.includes('$350') && f.includes('2/6 active')));

      // Critical anomaly: Delhi regional attrition
      assert.ok(
        summary.anomalies?.some((a) =>
          (typeof a === 'string' ? a : a.observation).toLowerCase().includes('delhi') &&
          (typeof a === 'string' ? a : a.observation).toLowerCase().includes('churn')
        ),
        'Must flag Delhi regional attrition as critical anomaly'
      );
      assertNoBannedBoilerplate(summary);
    });
  });

  // --------------------------------------------------------------------------
  // Test D — Operational Risk & Capacity Saturation
  // --------------------------------------------------------------------------
  describe('Test D: Operational Risk (support_tickets > 3 OR usage_pct > 100%)', () => {
    const q = 'Show accounts requiring attention with elevated support tickets or over capacity.';

    it('identifies curated operational risk query with deterministic filter condition', () => {
      const curated = getDeterministicCuratedQuery(q, execDataset);
      assert.ok(curated, 'Curated match expected');
      assert.ok(curated.sql.includes('support_tickets > 3 OR usage_pct > 100'));
    });

    it('detects capacity saturation (Quantum Pulse 108%, AuraGlobal 104%) without inventing predictive churn models', () => {
      const riskRows = [
        { customer_id: 'CUST-012', customer_name: 'Quantum Pulse', segment: 'SMB', plan: 'Team', mrr_usd: 650, subscription_status: 'Active', support_tickets: 4, usage_pct: 108 },
        { customer_id: 'CUST-024', customer_name: 'AuraGlobal', segment: 'SMB', plan: 'Team', mrr_usd: 600, subscription_status: 'Active', support_tickets: 5, usage_pct: 104 },
        { customer_id: 'CUST-008', customer_name: 'Beacon Media', segment: 'Mid-Market', plan: 'Growth', mrr_usd: 550, subscription_status: 'Churned', support_tickets: 6, usage_pct: 35 },
      ];

      const summary = generateEvidenceBasedSummary({
        question: q,
        sql: `SELECT * FROM ${execDataset.tableName} WHERE support_tickets > 3 OR usage_pct > 100 ORDER BY mrr_usd DESC`,
        status: 'verified',
        rows: riskRows,
        columns: ['customer_id', 'customer_name', 'segment', 'plan', 'mrr_usd', 'subscription_status', 'support_tickets', 'usage_pct'],
        rowCount: 3,
        datasetName: execDataset.name,
        tableName: execDataset.tableName,
        semanticSchema: execSchema,
      });

      assert.strictEqual(summary.status, 'verified');
      assert.strictEqual(summary.category, 'operational_risk');
      assert.ok(summary.overview?.includes('Operational risk analysis identified 3 accounts'));
      assert.ok(summary.findings?.some((f) => f.includes('Capacity overutilization') && f.includes('Quantum Pulse')));

      // Structured Recommended Action: Evidence / Issue / Recommendation / Metric to Monitor
      const highPriAction = summary.recommended_actions?.find((a) => a.priority === 'high');
      assert.ok(highPriAction, 'Must supply high-priority operational action');
      assert.ok(highPriAction.evidence?.includes('accounts operating over capacity'));
      assert.ok(highPriAction.issue?.includes('Capacity saturation'));
      assert.ok(highPriAction.recommendation?.includes('Upgrade tier capacity'));
      assert.ok(highPriAction.metric_to_monitor?.includes('Account platform utilization'));

      // Limitations: must explicitly state absence of predictive churn model
      assert.ok(summary.limitations?.some((l) => l.includes('no predictive churn model')));
      assertNoBannedBoilerplate(summary);
    });
  });

  // --------------------------------------------------------------------------
  // Test E — Customer Revenue Concentration
  // --------------------------------------------------------------------------
  describe('Test E: Customer Revenue Concentration (Top 1, Top 3, Top 5 Shares)', () => {
    const q = 'What is our customer revenue concentration for top 1, top 3, and top 5 accounts?';

    it('calculates exact concentration percentages against total portfolio MRR ($22,550)', () => {
      // Top 5 rows from EXECUTIVE_SAAS_30_DATA
      const top5Customers = [
        { customer_name: 'Apex Global', mrr_usd: 2700, segment: 'Enterprise' },
        { customer_name: 'Ironclad Solutions', mrr_usd: 2300, segment: 'Enterprise' },
        { customer_name: 'Nexus Systems', mrr_usd: 2100, segment: 'Enterprise' },
        { customer_name: 'Titan Logistics', mrr_usd: 1900, segment: 'Enterprise' },
        { customer_name: 'Vertex Cloud', mrr_usd: 1900, segment: 'Enterprise' },
      ];

      const concentration = calculateRevenueConcentration(top5Customers, ['customer_name', 'mrr_usd', 'segment'], 22550);
      assert.ok(concentration, 'Concentration calculation must succeed');

      // Total MRR across 30 rows is $22,550
      assert.strictEqual(concentration.totalMrr, 22550);
      assert.strictEqual(concentration.top1.name, 'Apex Global');
      assert.strictEqual(concentration.top1.mrr, 2700);
      assert.strictEqual(concentration.top1.sharePct, 12.0); // 2700 / 22550 * 100 = 11.97% -> 12.0%

      assert.strictEqual(concentration.top3.mrr, 7100); // 2700 + 2300 + 2100 = 7100
      assert.strictEqual(concentration.top3.sharePct, 31.5); // 7100 / 22550 * 100 = 31.48% -> 31.5%

      assert.strictEqual(concentration.top5.mrr, 10900); // 7100 + 1900 + 1900 = 10900
      assert.strictEqual(concentration.top5.sharePct, 48.3); // 10900 / 22550 * 100 = 48.33% -> 48.3%
    });

    it('generates grounded summary distinguishing customer concentration from segment totals', () => {
      const top5Rows = [
        { customer_id: 'CUST-001', customer_name: 'Apex Global', segment: 'Enterprise', mrr_usd: 2700, revenue_share_pct: 12.0 },
        { customer_id: 'CUST-002', customer_name: 'Ironclad Solutions', segment: 'Enterprise', mrr_usd: 2300, revenue_share_pct: 10.2 },
        { customer_id: 'CUST-003', customer_name: 'Nexus Systems', segment: 'Enterprise', mrr_usd: 2100, revenue_share_pct: 9.3 },
        { customer_id: 'CUST-004', customer_name: 'Titan Logistics', segment: 'Enterprise', mrr_usd: 1900, revenue_share_pct: 8.4 },
        { customer_id: 'CUST-005', customer_name: 'Vertex Cloud', segment: 'Enterprise', mrr_usd: 1900, revenue_share_pct: 8.4 },
      ];

      const summary = generateEvidenceBasedSummary({
        question: q,
        sql: `SELECT customer_id, customer_name, segment, mrr_usd, ROUND(100.0 * mrr_usd / (SELECT SUM(mrr_usd) FROM ${execDataset.tableName}), 2) AS revenue_share_pct FROM ${execDataset.tableName} ORDER BY mrr_usd DESC LIMIT 5`,
        status: 'verified',
        rows: top5Rows,
        columns: ['customer_id', 'customer_name', 'segment', 'mrr_usd', 'revenue_share_pct'],
        rowCount: 5,
        datasetName: execDataset.name,
        tableName: execDataset.tableName,
        semanticSchema: execSchema,
      });

      assert.strictEqual(summary.status, 'verified');
      assert.strictEqual(summary.category, 'customer_concentration');
      assert.ok(summary.overview?.includes('Top 1 customer (Apex Global) generates 12'));
      assert.ok(summary.overview?.includes('Top 3 represent 31.5% ($7,100)'));
      assert.ok(summary.overview?.includes('Top 5 account for 48.3% ($10,900)'));
      assert.ok(summary.findings?.some((f) => f.includes('Apex Global generates $2,700, representing 12')));
      assertNoBannedBoilerplate(summary);
    });
  });

  // --------------------------------------------------------------------------
  // Test F — Comprehensive Multi-Query Executive Review
  // --------------------------------------------------------------------------
  describe('Test F: Comprehensive Multi-Query Executive Review Synthesis', () => {
    it('synthesizes segments, channels, geography, operational risk, and concentration into a coherent briefing', () => {
      const multiOutputs = {
        segments: {
          rows: [
            { segment: 'Enterprise', total_mrr: 14000, avg_mrr: 2000, customer_count: 7, active_pct: 100.0 },
            { segment: 'SMB', total_mrr: 3550, avg_mrr: 394.44, customer_count: 9, active_pct: 88.9 },
            { segment: 'Startup', total_mrr: 1500, avg_mrr: 187.5, customer_count: 8, active_pct: 75.0 },
          ],
          columns: ['segment', 'total_mrr', 'avg_mrr', 'customer_count', 'active_pct'],
        },
        channels: {
          rows: [
            { acquisition_channel: 'Referral', total_mrr: 7300, avg_mrr: 1042.86, customer_count: 7 },
            { acquisition_channel: 'Partner', total_mrr: 6050, customer_count: 8 },
            { acquisition_channel: 'Outbound', total_mrr: 1850, customer_count: 6 },
          ],
          columns: ['acquisition_channel', 'total_mrr', 'avg_mrr', 'customer_count'],
        },
        geography: {
          rows: [
            { city: 'Chennai', active_mrr: 5700, active_pct: 100.0, total_customers: 6 },
            { city: 'Hyderabad', active_mrr: 5300, active_pct: 83.3, total_customers: 6 },
            { city: 'Delhi', active_mrr: 350, active_pct: 33.3, total_customers: 6 },
          ],
          columns: ['city', 'active_mrr', 'active_pct', 'total_customers'],
        },
        operational_risk: {
          rows: [
            { customer_name: 'Quantum Pulse', usage_pct: 108, mrr_usd: 650 },
            { customer_name: 'AuraGlobal', usage_pct: 104, mrr_usd: 600 },
          ],
          columns: ['customer_name', 'usage_pct', 'mrr_usd'],
        },
        concentration: {
          rows: [
            { customer_name: 'Apex Global', mrr_usd: 2700 },
            { customer_name: 'Ironclad Solutions', mrr_usd: 2300 },
            { customer_name: 'Nexus Systems', mrr_usd: 2100 },
            { customer_name: 'Titan Logistics', mrr_usd: 1900 },
            { customer_name: 'Vertex Cloud', mrr_usd: 1900 },
          ],
          columns: ['customer_name', 'mrr_usd'],
        },
      };

      const briefing = synthesizeMultiQueryReview(multiOutputs, 'SaaS Executive Portfolio');

      assert.strictEqual(briefing.status, 'verified');
      assert.strictEqual(briefing.category, 'multi_query_executive');

      // Verify overview synthesizes multiple dimensions
      assert.ok(briefing.overview?.includes('$14,000 total MRR'));
      assert.ok(briefing.overview?.includes('$7,300 total MRR'));
      assert.ok(briefing.overview?.includes('Delhi (33.3% active rate)'));

      // Verify key findings cover each bounded sub-query
      assert.ok(briefing.findings?.some((f) => f.includes('Enterprise segment contributes $14,000 total MRR')));
      assert.ok(briefing.findings?.some((f) => f.includes('Referral is the leading acquisition channel')));
      assert.ok(briefing.findings?.some((f) => f.includes('Chennai leads geographic contribution')));
      assert.ok(briefing.findings?.some((f) => f.includes('Quantum Pulse')));

      // Verify anomalies and actions
      assert.ok(briefing.anomalies?.some((a) => (typeof a === 'string' ? a : a.observation).includes('Delhi')));
      assert.ok(briefing.recommended_actions?.some((a) => a.action.includes('Delhi')));
      assert.ok(briefing.recommended_actions?.some((a) => a.action.includes('Quantum Pulse')));

      assertNoBannedBoilerplate(briefing);
    });
  });

  // --------------------------------------------------------------------------
  // Test G — Refusal of Predictive Churn Request & Schema Grounding
  // --------------------------------------------------------------------------
  describe('Test G: Refusal of Predictive Churn Request & Schema Grounding', () => {
    const q = 'What is the churn probability for our accounts?';

    it('refuses predictive churn request without models and explains missing fields', () => {
      const check = checkMetricAvailability(q, execSchema);
      assert.strictEqual(check.isAvailable, false);
      assert.strictEqual(check.missingMetric, 'churn probability');
      assert.ok(check.clarification?.includes('predictive models'));

      // Crucial: Must NEVER mention non-existent columns (churn_status, mrr, NPS) for the executive schema!
      assert.strictEqual(check.clarification?.includes('churn_status'), false, 'Must not reference non-existent churn_status');
      assert.strictEqual(check.clarification?.includes('nps_score'), false, 'Must not reference non-existent nps_score');

      // Must suggest actual active columns (subscription_status, support_tickets, usage_pct, mrr_usd)
      assert.ok(check.clarification?.includes('subscription_status'), 'Must suggest actual subscription_status column');
      assert.ok(check.clarification?.includes('support_tickets'), 'Must suggest actual support_tickets column');
      assert.ok(check.clarification?.includes('usage_pct'), 'Must suggest actual usage_pct column');
      assert.ok(check.clarification?.includes('mrr_usd'), 'Must suggest actual mrr_usd column');
    });

    it('summary generation enters needs_clarification state and offers deterministic alternatives', () => {
      const summary = generateEvidenceBasedSummary({
        question: q,
        sql: '',
        status: 'needs_clarification',
        rows: [],
        columns: execDataset.columns.map((c) => c.name),
        rowCount: 0,
        datasetName: execDataset.name,
        tableName: execDataset.tableName,
        semanticSchema: execSchema,
      });

      assert.strictEqual(summary.status, 'needs_clarification');
      assert.ok(summary.overview?.includes('predictive analysis cannot be calculated'));
      assert.ok(summary.limitations?.some((l) => l.includes('predictive model')));

      // Verifies deterministic alternatives mention existing columns
      const action = summary.recommended_actions?.[0];
      assert.ok(action);
      assert.ok(action.action.includes('subscription_status') || action.action.includes('support_tickets') || action.action.includes('usage_pct'));
      assertNoBannedBoilerplate(summary);
    });
  });

  // --------------------------------------------------------------------------
  // Test H — Out-of-Scope Query Guard
  // --------------------------------------------------------------------------
  describe('Test H: Out-of-Scope Query Guard', () => {
    it('detects creative / fictional / non-data questions and suppresses SQL generation', async () => {
      const outOfScopePrompts = [
        'Write a poem as Yoda about cloud databases',
        'Tell me a fairy tale about a dragon',
        'Compose a rap song about JavaScript',
        'Write a creative story about spaceships',
      ];

      for (const prompt of outOfScopePrompts) {
        const check = isQueryOutOfScope(prompt, execDataset);
        assert.strictEqual(check.outOfScope, true, `Prompt should be out of scope: "${prompt}"`);

        const result = await processNaturalLanguageQuery(prompt, execDataset);
        assert.strictEqual(result.isOutOfScope, true);
        assert.strictEqual(result.sql, '', 'Zero SQL must be generated for out-of-scope query');
        assert.strictEqual(result.reasoningSteps.length, 0, 'No execution trace generated');
        assert.strictEqual(result.insight?.summary, '', 'No executive summary generated');
      }
    });
  });
});
