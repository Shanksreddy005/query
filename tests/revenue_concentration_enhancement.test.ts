import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  generateEvidenceBasedSummary,
  calculateRevenueConcentrationBreakdown,
  synthesizeRevenueConcentration,
} from '../src/services/summaryEngine';
import {
  getDeterministicCuratedQuery,
} from '../src/services/aiService';
import {
  EXECUTIVE_SAAS_30_DATA,
  inferDatasetSchema,
} from '../src/services/sampleData';
import { profileDatasetSchema } from '../src/services/schemaProfiler';

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

describe('QueryMind — Revenue Concentration Analysis Enhancement Verification Suite', () => {
  const nlQuery =
    'Analyse revenue concentration across customer segments and acquisition channels. Identify the largest revenue contributors, compare their customer counts and average MRR, and explain whether revenue is concentrated among a small number of customers or channels. Support every conclusion with calculated values.';

  // 9-row UNION output from actual SQL aggregation
  const unionRows = [
    { group_name: 'Enterprise', group_type: 'segment', customer_count: 7, total_mrr: 14000, avg_mrr: 2000.0 },
    { group_name: 'Referral', group_type: 'acquisition_channel', customer_count: 7, total_mrr: 7300, avg_mrr: 1042.86 },
    { group_name: 'Mid-Market', group_type: 'segment', customer_count: 6, total_mrr: 6150, avg_mrr: 1025.0 },
    { group_name: 'Partner', group_type: 'acquisition_channel', customer_count: 5, total_mrr: 6050, avg_mrr: 1210.0 },
    { group_name: 'Organic', group_type: 'acquisition_channel', customer_count: 7, total_mrr: 4400, avg_mrr: 628.57 },
    { group_name: 'Paid Search', group_type: 'acquisition_channel', customer_count: 7, total_mrr: 3600, avg_mrr: 514.29 },
    { group_name: 'SMB', group_type: 'segment', customer_count: 9, total_mrr: 1950, avg_mrr: 216.67 },
    { group_name: 'Outbound', group_type: 'acquisition_channel', customer_count: 4, total_mrr: 1850, avg_mrr: 462.5 },
    { group_name: 'Startup', group_type: 'segment', customer_count: 8, total_mrr: 1100, avg_mrr: 137.5 },
  ];

  // Customer-level query execution results (30 customers, sorted mrr_usd DESC, customer_id ASC)
  const customerRows = [
    { customer_id: 'C005', customer_name: 'Evergreen Group', segment: 'Enterprise', acquisition_channel: 'Partner', mrr_usd: 2500, rank: 1, revenue_share_pct: 10.78 },
    { customer_id: 'C003', customer_name: 'Cedar Works', segment: 'Enterprise', acquisition_channel: 'Referral', mrr_usd: 2200, rank: 2, revenue_share_pct: 9.48 },
    { customer_id: 'C026', customer_name: 'Zenith Labs', segment: 'Enterprise', acquisition_channel: 'Referral', mrr_usd: 2100, rank: 3, revenue_share_pct: 9.05 },
    { customer_id: 'C001', customer_name: 'Aster Labs', segment: 'Enterprise', acquisition_channel: 'Organic', mrr_usd: 2000, rank: 4, revenue_share_pct: 8.62 },
    { customer_id: 'C030', customer_name: 'Dynamo Group', segment: 'Enterprise', acquisition_channel: 'Paid Search', mrr_usd: 1900, rank: 5, revenue_share_pct: 8.19 },
    { customer_id: 'C002', customer_name: 'Apex Global', segment: 'Enterprise', acquisition_channel: 'Referral', mrr_usd: 1700, rank: 6, revenue_share_pct: 7.33 },
    { customer_id: 'C004', customer_name: 'Beacon Health', segment: 'Enterprise', acquisition_channel: 'Partner', mrr_usd: 1600, rank: 7, revenue_share_pct: 6.90 },
    { customer_id: 'C006', customer_name: 'Quantum Systems', segment: 'Mid-Market', acquisition_channel: 'Partner', mrr_usd: 1500, rank: 8, revenue_share_pct: 6.47 },
    { customer_id: 'C007', customer_name: 'Hyperion Corp', segment: 'Mid-Market', acquisition_channel: 'Organic', mrr_usd: 1100, rank: 9, revenue_share_pct: 4.74 },
    { customer_id: 'C008', customer_name: 'Vortex Data', segment: 'Mid-Market', acquisition_channel: 'Outbound', mrr_usd: 1100, rank: 10, revenue_share_pct: 4.74 },
    { customer_id: 'C009', customer_name: 'Starlight Media', segment: 'Mid-Market', acquisition_channel: 'Referral', mrr_usd: 900, rank: 11, revenue_share_pct: 3.88 },
    { customer_id: 'C010', customer_name: 'BlueSky Retail', segment: 'Mid-Market', acquisition_channel: 'Organic', mrr_usd: 800, rank: 12, revenue_share_pct: 3.45 },
    { customer_id: 'C011', customer_name: 'PrimeCommerce', segment: 'Mid-Market', acquisition_channel: 'Paid Search', mrr_usd: 750, rank: 13, revenue_share_pct: 3.23 },
    { customer_id: 'C012', customer_name: 'Nova Retail', segment: 'SMB', acquisition_channel: 'Outbound', mrr_usd: 350, rank: 14, revenue_share_pct: 1.51 },
    { customer_id: 'C013', customer_name: 'SwiftFlow', segment: 'SMB', acquisition_channel: 'Partner', mrr_usd: 300, rank: 15, revenue_share_pct: 1.29 },
    { customer_id: 'C014', customer_name: 'DataSync Pro', segment: 'SMB', acquisition_channel: 'Referral', mrr_usd: 250, rank: 16, revenue_share_pct: 1.08 },
    { customer_id: 'C015', customer_name: 'OrbitScale', segment: 'SMB', acquisition_channel: 'Paid Search', mrr_usd: 250, rank: 17, revenue_share_pct: 1.08 },
    { customer_id: 'C021', customer_name: 'SparkCloud', segment: 'Startup', acquisition_channel: 'Outbound', mrr_usd: 250, rank: 18, revenue_share_pct: 1.08 },
    { customer_id: 'C022', customer_name: 'Krypton AI', segment: 'Startup', acquisition_channel: 'Paid Search', mrr_usd: 250, rank: 19, revenue_share_pct: 1.08 },
    { customer_id: 'C016', customer_name: 'AlphaStream', segment: 'SMB', acquisition_channel: 'Organic', mrr_usd: 200, rank: 20, revenue_share_pct: 0.86 },
    { customer_id: 'C017', customer_name: 'PulseMetrics', segment: 'SMB', acquisition_channel: 'Paid Search', mrr_usd: 200, rank: 21, revenue_share_pct: 0.86 },
    { customer_id: 'C018', customer_name: 'Ironclad Tech', segment: 'SMB', acquisition_channel: 'Outbound', mrr_usd: 150, rank: 22, revenue_share_pct: 0.65 },
    { customer_id: 'C019', customer_name: 'FreshScale', segment: 'SMB', acquisition_channel: 'Organic', mrr_usd: 150, rank: 23, revenue_share_pct: 0.65 },
    { customer_id: 'C023', customer_name: 'NexusLogix', segment: 'Startup', acquisition_channel: 'Paid Search', mrr_usd: 150, rank: 24, revenue_share_pct: 0.65 },
    { customer_id: 'C024', customer_name: 'CloudCraft', segment: 'Startup', acquisition_channel: 'Partner', mrr_usd: 150, rank: 25, revenue_share_pct: 0.65 },
    { customer_id: 'C020', customer_name: 'CargoNet', segment: 'SMB', acquisition_channel: 'Paid Search', mrr_usd: 100, rank: 26, revenue_share_pct: 0.43 },
    { customer_id: 'C025', customer_name: 'BlueSky Labs', segment: 'Startup', acquisition_channel: 'Referral', mrr_usd: 100, rank: 27, revenue_share_pct: 0.43 },
    { customer_id: 'C027', customer_name: 'TrendLogic', segment: 'Startup', acquisition_channel: 'Organic', mrr_usd: 80, rank: 28, revenue_share_pct: 0.34 },
    { customer_id: 'C028', customer_name: 'AeroWave', segment: 'Startup', acquisition_channel: 'Organic', mrr_usd: 70, rank: 29, revenue_share_pct: 0.30 },
    { customer_id: 'C029', customer_name: 'InnoTech', segment: 'Startup', acquisition_channel: 'Referral', mrr_usd: 50, rank: 30, revenue_share_pct: 0.22 },
  ];

  // --------------------------------------------------------------------------
  // 1. Dataset Sanity & Aggregation Integrity
  // --------------------------------------------------------------------------
  it('verifies dataset baseline: 30 customers, $23,200 total MRR, 25 active, 5 cancelled', () => {
    assert.strictEqual(EXECUTIVE_SAAS_30_DATA.length, 30);
    const totalMrr = EXECUTIVE_SAAS_30_DATA.reduce((s, r) => s + r.mrr_usd, 0);
    assert.strictEqual(totalMrr, 23200);

    const activeCount = EXECUTIVE_SAAS_30_DATA.filter((r) => r.subscription_status === 'Active').length;
    const cancelledCount = EXECUTIVE_SAAS_30_DATA.filter((r) => r.subscription_status === 'Cancelled').length;
    assert.strictEqual(activeCount, 25);
    assert.strictEqual(cancelledCount, 5);
  });

  // --------------------------------------------------------------------------
  // 2. Curated Query Matching & Blueprint Precision
  // --------------------------------------------------------------------------
  it('identifies curated deterministic revenue concentration query and outputs UNION SQL', () => {
    const curated = getDeterministicCuratedQuery(nlQuery, execDataset);
    assert.ok(curated, 'Curated match expected for revenue concentration query');
    assert.ok(curated.sql.includes('segment_agg'), 'Must define segment_agg CTE');
    assert.ok(curated.sql.includes('channel_agg'), 'Must define channel_agg CTE');
    assert.ok(curated.sql.includes('UNION ALL'), 'Must combine with UNION ALL');
    assert.ok(curated.sql.includes('ORDER BY total_mrr DESC'), 'Must order by total_mrr descending');
  });

  // --------------------------------------------------------------------------
  // 3. Mathematical Reconciliation of All 15 Expected Result Table Rows
  // --------------------------------------------------------------------------
  it('verifies exact mathematical breakdown across segments, channels, and accounts', () => {
    const breakdown = calculateRevenueConcentrationBreakdown(
      unionRows,
      ['group_name', 'group_type', 'customer_count', 'total_mrr', 'avg_mrr'],
      customerRows,
      23200
    );

    // Total Portfolio
    assert.strictEqual(breakdown.totalMrr, 23200);
    assert.strictEqual(breakdown.totalCustomers, 30);
    assert.strictEqual(Number(breakdown.avgPortfolioMrr.toFixed(2)), 773.33);

    // Segments reconciliation
    const ent = breakdown.segments.find((s) => s.segment === 'Enterprise')!;
    assert.strictEqual(ent.customerCount, 7);
    assert.strictEqual(ent.totalMrr, 14000);
    assert.strictEqual(ent.avgMrr, 2000.0);
    assert.strictEqual(ent.sharePct, 60.34);
    assert.strictEqual(ent.cumulativeSharePct, 60.34);
    assert.strictEqual(ent.rankByTotal, 1);

    const mid = breakdown.segments.find((s) => s.segment === 'Mid-Market')!;
    assert.strictEqual(mid.customerCount, 6);
    assert.strictEqual(mid.totalMrr, 6150);
    assert.strictEqual(mid.avgMrr, 1025.0);
    assert.strictEqual(mid.sharePct, 26.51);
    assert.strictEqual(mid.cumulativeSharePct, 86.85);
    assert.strictEqual(mid.rankByTotal, 2);

    const smb = breakdown.segments.find((s) => s.segment === 'SMB')!;
    assert.strictEqual(smb.customerCount, 9);
    assert.strictEqual(smb.totalMrr, 1950);
    assert.strictEqual(Number(smb.avgMrr.toFixed(2)), 216.67);
    assert.strictEqual(smb.sharePct, 8.41);
    assert.strictEqual(smb.cumulativeSharePct, 95.26);
    assert.strictEqual(smb.rankByTotal, 3);

    const st = breakdown.segments.find((s) => s.segment === 'Startup')!;
    assert.strictEqual(st.customerCount, 8);
    assert.strictEqual(st.totalMrr, 1100);
    assert.strictEqual(st.avgMrr, 137.5);
    assert.strictEqual(st.sharePct, 4.74);
    assert.strictEqual(st.cumulativeSharePct, 100.0);
    assert.strictEqual(st.rankByTotal, 4);

    // Segment share sum reconciles to 100%
    const segShareSum = Number(breakdown.segments.reduce((s, x) => s + x.sharePct, 0).toFixed(2));
    assert.strictEqual(segShareSum, 100.0);

    // Channels reconciliation
    const ref = breakdown.channels.find((c) => c.channel === 'Referral')!;
    assert.strictEqual(ref.customerCount, 7);
    assert.strictEqual(ref.totalMrr, 7300);
    assert.strictEqual(Number(ref.avgMrr.toFixed(2)), 1042.86);
    assert.strictEqual(ref.sharePct, 31.47);
    assert.strictEqual(ref.cumulativeSharePct, 31.47);
    assert.strictEqual(ref.rankByTotal, 1);
    assert.strictEqual(ref.rankByAvg, 2); // Rank 2 by avg MRR

    const part = breakdown.channels.find((c) => c.channel === 'Partner')!;
    assert.strictEqual(part.customerCount, 5);
    assert.strictEqual(part.totalMrr, 6050);
    assert.strictEqual(part.avgMrr, 1210.0);
    assert.strictEqual(part.sharePct, 26.08);
    assert.strictEqual(part.cumulativeSharePct, 57.54);
    assert.strictEqual(part.rankByTotal, 2);
    assert.strictEqual(part.rankByAvg, 1); // Rank 1 by avg MRR

    const org = breakdown.channels.find((c) => c.channel === 'Organic')!;
    assert.strictEqual(org.customerCount, 7);
    assert.strictEqual(org.totalMrr, 4400);
    assert.strictEqual(Number(org.avgMrr.toFixed(2)), 628.57);
    assert.strictEqual(org.sharePct, 18.97);
    assert.strictEqual(org.cumulativeSharePct, 76.51);

    const paid = breakdown.channels.find((c) => c.channel === 'Paid Search')!;
    assert.strictEqual(paid.customerCount, 7);
    assert.strictEqual(paid.totalMrr, 3600);
    assert.strictEqual(Number(paid.avgMrr.toFixed(2)), 514.29);
    assert.strictEqual(paid.sharePct, 15.52);
    assert.strictEqual(paid.cumulativeSharePct, 92.03);

    const outb = breakdown.channels.find((c) => c.channel === 'Outbound')!;
    assert.strictEqual(outb.customerCount, 4);
    assert.strictEqual(outb.totalMrr, 1850);
    assert.strictEqual(outb.avgMrr, 462.5);
    assert.strictEqual(outb.sharePct, 7.97);
    assert.strictEqual(outb.cumulativeSharePct, 100.0);

    // Channel share sum reconciles to 100%
    const chanMrrSum = breakdown.channels.reduce((s, x) => s + x.totalMrr, 0);
    assert.strictEqual(chanMrrSum, 23200);

    // Customer Concentration Reconciliation
    assert.ok(breakdown.customers, 'Customers breakdown expected');
    const custs = breakdown.customers!;
    assert.strictEqual(custs.top1.customerId, 'C005');
    assert.strictEqual(custs.top1.customerName, 'Evergreen Group');
    assert.strictEqual(custs.top1.mrr, 2500);
    assert.strictEqual(custs.top1.sharePct, 10.78);

    assert.strictEqual(custs.top3CombinedMrr, 6800);
    assert.strictEqual(custs.top3SharePct, 29.31);

    assert.strictEqual(custs.top5CombinedMrr, 10700);
    assert.strictEqual(custs.top5SharePct, 46.12);

    assert.strictEqual(custs.remaining25CombinedMrr, 12500);
    assert.strictEqual(custs.remaining25SharePct, 53.88);
  });

  // --------------------------------------------------------------------------
  // 4. Executive Summary Synthesis with All 8 Required Sections (A to H)
  // --------------------------------------------------------------------------
  it('synthesizes complete executive summary with sections A to H', () => {
    const summary = synthesizeRevenueConcentration({
      rows: unionRows,
      columns: ['group_name', 'group_type', 'customer_count', 'total_mrr', 'avg_mrr'],
      customerRows,
      totalDatasetMrr: 23200,
      datasetName: execDataset.name,
      tableName: execDataset.tableName,
    });

    assert.strictEqual(summary.status, 'verified');
    assert.strictEqual(summary.category, 'revenue_concentration');

    // Section A: Executive Overview
    assert.ok(summary.overview?.includes('$23,200 in MRR'));
    assert.ok(summary.overview?.includes('averaging $773.33'));
    assert.ok(summary.overview?.includes('Enterprise segment ($14,000, 60.34% share'));
    assert.ok(summary.overview?.includes('Referral leads in total revenue ($7,300, 31.47% share'));
    assert.ok(summary.overview?.includes('Partner delivers the highest contract efficiency ($1,210.00 average MRR'));
    assert.ok(summary.overview?.includes('top 5 accounts represent 46.12% ($10,700)'));
    assert.ok(summary.overview?.includes('Evergreen Group (C005, $2,500, 10.78% share)'));

    // Section B: Three Most Important Findings
    assert.ok(summary.findings?.some((f) => f.includes('Segment Skew:') && f.includes('Enterprise accounts for 60.34%') && f.includes('13.15%')));
    assert.ok(summary.findings?.some((f) => f.includes('Channel Performance Divergence:') && f.includes('Referral leads in total revenue') && f.includes('Partner produces the highest contract efficiency')));
    assert.ok(summary.findings?.some((f) => f.includes('Account-Level Concentration:') && f.includes('Top 3 accounts generate 29.31%') && f.includes('Top 5 accounts generate 46.12%')));

    // Section C: Segment Revenue Concentration
    assert.ok(summary.findings?.some((f) => f.includes('Segment Concentration — Enterprise:') && f.includes('$14,000 total MRR') && f.includes('60.34% revenue share') && f.includes('60.34% cumulative share')));
    assert.ok(summary.findings?.some((f) => f.includes('Segment Concentration — Mid-Market:') && f.includes('$6,150 total MRR') && f.includes('26.51% revenue share') && f.includes('86.85% cumulative share')));
    assert.ok(summary.findings?.some((f) => f.includes('Segment Concentration — SMB:') && f.includes('$1,950 total MRR') && f.includes('8.41% revenue share') && f.includes('95.26% cumulative share')));
    assert.ok(summary.findings?.some((f) => f.includes('Segment Concentration — Startup:') && f.includes('$1,100 total MRR') && f.includes('4.74% revenue share') && f.includes('100% cumulative share')));

    // Section D: Acquisition Channel Performance
    assert.ok(summary.findings?.some((f) => f.includes('Channel Performance — Referral:') && f.includes('$7,300 total MRR') && f.includes('Rank 1 by total MRR, Rank 2 by average MRR')));
    assert.ok(summary.findings?.some((f) => f.includes('Channel Performance — Partner:') && f.includes('$6,050 total MRR') && f.includes('$1,210') && f.includes('Rank 2 by total MRR, Rank 1 by average MRR')));
    assert.ok(summary.findings?.some((f) => f.includes('Channel Performance — Outbound:') && f.includes('$1,850 total MRR') && f.includes('$462.5')));

    // Section E: Customer-Level Revenue Concentration
    assert.ok(summary.findings?.some((f) => f.includes('Customer Concentration — Rank 1:') && f.includes('Evergreen Group (C005)') && f.includes('$2,500 MRR') && f.includes('10.78% share')));
    assert.ok(summary.findings?.some((f) => f.includes('Customer Concentration — Rank 2:') && f.includes('Cedar Works (C003)') && f.includes('$2,200 MRR')));
    assert.ok(summary.findings?.some((f) => f.includes('Customer Concentration — Rank 3:') && f.includes('Zenith Labs (C026)') && f.includes('$2,100 MRR')));
    assert.ok(summary.findings?.some((f) => f.includes('Customer Concentration — Rank 4:') && f.includes('Aster Labs (C001)') && f.includes('$2,000 MRR')));
    assert.ok(summary.findings?.some((f) => f.includes('Customer Concentration — Rank 5:') && f.includes('Dynamo Group (C030)') && f.includes('$1,900 MRR')));
    assert.ok(summary.findings?.some((f) => f.includes('Customer Concentration — Remaining 25 Accounts:') && f.includes('$12,500 MRR') && f.includes('53.88% share')));

    // Section F: Business Implications
    assert.ok(summary.business_implications?.some((i) =>
      (typeof i === 'string' ? i : i.implication).includes('46.12% of total portfolio MRR rests in just 5 enterprise accounts')
    ));
    assert.ok(summary.business_implications?.some((i) =>
      (typeof i === 'string' ? i : i.implication).includes('SMB and Startup) account for 56.7% of all accounts (17 customers) but produce only 13.15%')
    ));

    // Section G: Three Recommended Actions
    assert.strictEqual(summary.recommended_actions?.length, 3);
    assert.ok(summary.recommended_actions?.some((a) => a.action.includes('Dedicated executive sponsorship for the Top 5 accounts')));
    assert.ok(summary.recommended_actions?.some((a) => a.action.includes('Reallocate acquisition marketing capital toward high-yield Partner and Referral')));
    assert.ok(summary.recommended_actions?.some((a) => a.action.includes('Transition SMB and Startup onboarding to automated self-serve workflows')));

    // Section H: Limitations
    assert.ok(summary.limitations?.some((l) => l.includes('Customer Acquisition Cost (CAC)')));
    assert.ok(summary.limitations?.some((l) => l.includes('predictive churn probabilities')));

    assertNoBannedBoilerplate(summary);
  });

  // --------------------------------------------------------------------------
  // 5. Missing Customer Query Guard: Strict Refusal to Invent Extrapolations
  // --------------------------------------------------------------------------
  it('strictly suppresses customer concentration claims when customer subquery was not executed', () => {
    // Calling without customerRows
    const summary = synthesizeRevenueConcentration({
      rows: unionRows,
      columns: ['group_name', 'group_type', 'customer_count', 'total_mrr', 'avg_mrr'],
      totalDatasetMrr: 23200,
      datasetName: execDataset.name,
      tableName: execDataset.tableName,
    });

    // Overview explicitly states customer concentration requires individual account records
    assert.ok(summary.overview?.includes('Customer-level concentration analysis requires individual account records'));

    // Does NOT claim Evergreen Group or top 5 numbers
    assert.strictEqual(summary.overview?.includes('Evergreen Group'), false);
    assert.strictEqual(summary.findings?.some((f) => f.includes('Evergreen Group')), false);
    assert.strictEqual(summary.findings?.some((f) => f.includes('Rank 1: Evergreen Group')), false);

    // Section B finding explicitly states requirement
    assert.ok(summary.findings?.some((f) => f.includes('Customer-level concentration analysis requires individual account records')));
    assertNoBannedBoilerplate(summary);
  });

  // --------------------------------------------------------------------------
  // 6. Metric Ranking Precision: Distinguishing Total MRR Leader from Avg MRR Leader
  // --------------------------------------------------------------------------
  it('explicitly distinguishes Referral (#1 total MRR) from Partner (#1 avg MRR)', () => {
    const summary = generateEvidenceBasedSummary({
      question: nlQuery,
      sql: 'WITH segment_agg AS ... UNION ALL ...',
      status: 'verified',
      rows: unionRows,
      columns: ['group_name', 'group_type', 'customer_count', 'total_mrr', 'avg_mrr'],
      rowCount: 9,
      datasetName: execDataset.name,
      tableName: execDataset.tableName,
      semanticSchema: execSchema,
      multiQueryOutputs: {
        concentration: { rows: customerRows, columns: Object.keys(customerRows[0]) },
      },
    });

    assert.strictEqual(summary.category, 'revenue_concentration');

    // Partner is #1 in average MRR ($1,210.00), Referral is #1 in total MRR ($7,300)
    assert.ok(summary.findings?.some((f) => f.includes('Referral') && f.includes('Rank 1 by total MRR, Rank 2 by average MRR')));
    assert.ok(summary.findings?.some((f) => f.includes('Partner') && f.includes('Rank 2 by total MRR, Rank 1 by average MRR')));

    // Segments and channels are distinct dimensions: Enterprise total MRR $14,000 vs Referral $7,300
    // Referral should never be stated as #1 over Enterprise
    assert.ok(!summary.overview?.includes('Referral ranks first with $7,300 while Enterprise'));
    assertNoBannedBoilerplate(summary);
  });

  // --------------------------------------------------------------------------
  // 7. Deterministic Tie-Breaking Verification
  // --------------------------------------------------------------------------
  it('applies deterministic tie-breaking (mrr_usd DESC, customer_id ASC)', () => {
    // Customers with tied MRR ($1,100): C007 and C008
    const breakdown = calculateRevenueConcentrationBreakdown(
      unionRows,
      ['group_name', 'group_type', 'customer_count', 'total_mrr', 'avg_mrr'],
      customerRows,
      23200
    );

    const c007 = breakdown.customers?.topList.find((c) => c.customerId === 'C007')!;
    const c008 = breakdown.customers?.topList.find((c) => c.customerId === 'C008')!;

    assert.ok(c007 && c008);
    assert.strictEqual(c007.mrr, c008.mrr);
    // C007 must rank ahead of C008 due to customer_id ASC
    assert.ok(c007.rank < c008.rank, `C007 (rank ${c007.rank}) must precede C008 (rank ${c008.rank})`);
  });
});
