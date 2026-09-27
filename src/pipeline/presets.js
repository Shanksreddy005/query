/**
 * Authoritative Golden Presets for the 5 Example Queries
 * Source: QueryMind-Antigravity.docx (Section 6)
 */

const PRESETS = [
  {
    id: 'revenue',
    title: 'Top 5 by revenue last quarter',
    question: 'Show me the top 5 customers by total revenue last quarter',
    keywords: ['revenue', 'top 5', 'quarter', 'total revenue', 'top 5 customers'],
    intent: {
      entity: 'customers',
      metric: 'total revenue (SUM(orders.amount))',
      filters: ['orders.ordered_at BETWEEN 2024-07-01 AND 2024-09-30'],
      time_range: 'last quarter (Q3 2024)',
      sort: 'total_revenue DESC',
      limit: 5
    },
    schemaMapping: {
      tables: ['customers', 'orders'],
      joins: ['JOIN customers c ON c.id = o.customer_id'],
      reason_for_each_join: 'orders contains order amount and dates, customers contains customer details (name, plan, mrr)'
    },
    joinPlan: 'Join orders to customers on customer_id, filter to Q3 2024 (2024-07-01 to 2024-09-30), compute total revenue and order count, and rank top 5 customers by revenue.',
    sql: `-- Top 5 customers by revenue in Q3 2024
-- Joins orders -> customers, filters date range, aggregates by customer

SELECT
  RANK() OVER (ORDER BY SUM(o.amount) DESC) AS rank,
  c.name,
  c.plan,
  SUM(o.amount)   AS total_revenue,
  COUNT(o.id)     AS order_count,
  c.mrr
FROM   orders o
JOIN   customers c ON c.id = o.customer_id
WHERE  o.ordered_at BETWEEN '2024-07-01' AND '2024-09-30'
GROUP BY c.id, c.name, c.plan, c.mrr
ORDER BY total_revenue DESC
LIMIT  5;`,
    steps: [
      { l: 'Parsing intent', d: 'Identified: entity=customers · metric=total revenue · time filter=Q3 last quarter · limit=top 5' },
      { l: 'Schema analysis', d: 'Relevant tables: orders (amount, ordered_at), customers (name, plan, mrr) · Relationship: orders.customer_id → customers.id' },
      { l: 'Planning the join', d: 'Strategy: JOIN customers ON orders.customer_id · aggregate SUM(amount) · filter ordered_at to 2024-07-01 – 2024-09-30' },
      { l: 'Generating SQL', d: 'Using RANK() window function for ranking · GROUP BY customer · ORDER BY revenue DESC · LIMIT 5' },
      { l: 'Verifying query', d: 'Checked: all columns exist in schema · date range is syntactically valid · no ambiguous references · SELECT-only (safe)' },
      { l: 'Reading results', d: 'Surfacing the key business signal from the returned data' }
    ],
    results: {
      columns: ['Rank', 'Customer', 'Plan', 'Total Revenue', 'Orders', 'MRR'],
      rows: [
        ['1', 'Acme Corp', 'enterprise', '$142,500', '23', '$8,200'],
        ['2', 'TechFlow Inc', 'enterprise', '$98,750', '18', '$5,400'],
        ['3', 'DataSync Ltd', 'professional', '$67,200', '31', '$2,100'],
        ['4', 'CloudBase', 'professional', '$54,300', '14', '$1,800'],
        ['5', 'Nexus Systems', 'enterprise', '$48,900', '9', '$3,600']
      ],
      rowCount: 5,
      isSample: true
    },
    insight: '3 of your top 5 revenue customers are Enterprise — generating 73% of the top-5 total. DataSync Ltd stands out: highest order count (31) but mid-tier MRR, suggesting frequent small purchases rather than high-value subscriptions.'
  },

  {
    id: 'churn',
    title: 'Churned Enterprise customers',
    question: 'Which Enterprise customers have churned in the last 30 days?',
    keywords: ['churn', 'enterprise', '30 days', 'churned', 'last 30 days'],
    intent: {
      entity: 'customers',
      metric: 'mrr lost & tenure',
      filters: ["subscriptions.churned = true", "customers.plan = 'enterprise'", "subscriptions.cancelled_at >= NOW() - INTERVAL '30 days'"],
      time_range: 'last 30 days',
      sort: 'customers.mrr DESC',
      limit: null
    },
    schemaMapping: {
      tables: ['customers', 'subscriptions'],
      joins: ['JOIN subscriptions s ON s.customer_id = c.id'],
      reason_for_each_join: 'customers contains name, plan, mrr; subscriptions contains churned flag and cancellation date'
    },
    joinPlan: 'Join subscriptions to customers on customer_id, filter for churned enterprise subscriptions cancelled within 30 days, calculate tenure using AGE(), and sort by MRR lost.',
    sql: `-- Enterprise customers who churned in the last 30 days
-- churned flag lives on subscriptions; JOIN for plan + tenure

SELECT
  c.name,
  c.plan,
  c.mrr                          AS mrr_lost,
  s.cancelled_at,
  DATE_PART('month', AGE(s.cancelled_at, c.created_at))
                                 AS tenure_months
FROM   customers c
JOIN   subscriptions s ON s.customer_id = c.id
WHERE  s.churned = true
  AND  c.plan = 'enterprise'
  AND  s.cancelled_at >= NOW() - INTERVAL '30 days'
ORDER BY c.mrr DESC;`,
    steps: [
      { l: 'Parsing intent', d: 'Identified: entity=customers · filter=plan:enterprise AND churned=true · time window=30 days' },
      { l: 'Schema analysis', d: 'Churn flag: subscriptions.churned (boolean) · cancellation date: subscriptions.cancelled_at · plan filter on customers.plan' },
      { l: 'Planning the join', d: 'JOIN subscriptions ON customer_id · filter churned=true, plan=enterprise, cancelled_at >= NOW()-30d' },
      { l: 'Generating SQL', d: 'INTERVAL \'30 days\' with NOW() · AGE() for tenure calculation · ORDER BY mrr DESC for impact ranking' },
      { l: 'Verifying query', d: 'Confirmed: boolean filter syntax correct · INTERVAL valid PostgreSQL · join cardinality is one-to-many (acceptable here)' },
      { l: 'Reading results', d: 'Calculating MRR impact and identifying churn patterns by tenure and plan' }
    ],
    results: {
      columns: ['Customer', 'Plan', 'MRR Lost', 'Cancelled', 'Tenure'],
      rows: [
        ['BuildRight', 'enterprise', '$4,200', '2024-11-28', '18 months'],
        ['StreamCo', 'professional', '$1,800', '2024-11-22', '7 months'],
        ['Pinnacle AI', 'enterprise', '$6,100', '2024-11-19', '24 months'],
        ['DevHouse', 'professional', '$900', '2024-11-15', '3 months']
      ],
      rowCount: 4,
      isSample: true
    },
    insight: '2 of 4 churned customers were Enterprise, representing $10,300 in lost MRR. Pinnacle AI (24-month tenure, $6,100 MRR) is the highest-value churn — long-term customers rarely leave without a trigger worth investigating.'
  },

  {
    id: 'mrr',
    title: 'Avg MRR by plan tier',
    question: 'What is the average MRR by plan tier?',
    keywords: ['mrr', 'plan', 'average', 'avg mrr', 'plan tier', 'revenue share'],
    intent: {
      entity: 'customers',
      metric: 'average MRR, total MRR, revenue share %',
      filters: ["status = 'active'"],
      time_range: null,
      sort: 'avg_mrr DESC',
      limit: null
    },
    schemaMapping: {
      tables: ['customers'],
      joins: [],
      reason_for_each_join: 'All required attributes (plan, mrr, status) reside in customers table'
    },
    joinPlan: 'Group active customers by plan tier, compute customer count, average MRR, total MRR, and calculate revenue share percentage via window function SUM OVER().',
    sql: `-- Average MRR by plan tier, with window-function revenue share
-- SUM OVER () gives the denominator without a subquery

SELECT
  c.plan,
  COUNT(*)                        AS customer_count,
  ROUND(AVG(c.mrr), 0)           AS avg_mrr,
  SUM(c.mrr)                      AS total_mrr,
  ROUND(100.0 * SUM(c.mrr) /
    SUM(SUM(c.mrr)) OVER (), 1)  AS revenue_share_pct
FROM   customers c
WHERE  c.status = 'active'
GROUP BY c.plan
ORDER BY avg_mrr DESC;`,
    steps: [
      { l: 'Parsing intent', d: 'Metric: average MRR · dimension: plan tier · implicit filter: active customers only' },
      { l: 'Schema analysis', d: 'MRR field: customers.mrr · plan grouping: customers.plan · status filter: customers.status = active' },
      { l: 'Planning aggregation', d: 'AVG(mrr) for average · SUM(mrr) for total · window function SUM OVER() for revenue share %' },
      { l: 'Generating SQL', d: 'Using SUM(SUM(mrr)) OVER() window for total denominator · ROUND to 1 decimal for % · active filter in WHERE' },
      { l: 'Verifying query', d: 'No division-by-zero risk (SUM OVER() requires at least one active row) · ROUND(... , 1) correct syntax' },
      { l: 'Reading results', d: 'Calculating revenue concentration and conversion opportunity across tiers' }
    ],
    results: {
      columns: ['Plan', 'Customers', 'Avg MRR', 'Total MRR', 'Share'],
      rows: [
        ['enterprise', '42', '$5,240', '$220,080', '61.2%'],
        ['professional', '118', '$1,820', '$214,760', '29.8%'],
        ['starter', '234', '$290', '$67,860', '9.0%'],
        ['trial', '89', '$0', '$0', '0%']
      ],
      rowCount: 4,
      isSample: true
    },
    insight: 'Enterprise (42 customers) generates 61% of MRR — nearly equal to Professional (118 customers). Your 89 trial accounts generate zero revenue; converting even 20% to Starter adds ~$5,200/month.'
  },

  {
    id: 'trial',
    title: 'Trial customers with 3+ orders',
    question: 'List customers with more than 3 orders still on a trial plan',
    keywords: ['trial', '3 orders', '3+', 'more than 3', 'still on a trial plan', 'trial plan'],
    intent: {
      entity: 'customers',
      metric: 'order count and total spent',
      filters: ["customers.plan = 'trial'", "COUNT(orders.id) > 3"],
      time_range: null,
      sort: 'order_count DESC',
      limit: null
    },
    schemaMapping: {
      tables: ['customers', 'orders'],
      joins: ['JOIN orders o ON o.customer_id = c.id'],
      reason_for_each_join: 'customers provides plan and account age, orders provides transaction count and total spend'
    },
    joinPlan: 'Join orders to customers, filter where plan is trial, group by customer, filter grouped results using HAVING COUNT(o.id) > 3, and compute trial tenure.',
    sql: `-- Trial customers with 3+ orders — HAVING filters after aggregation
-- These are high-intent conversion targets

SELECT
  c.name,
  COUNT(o.id)                     AS order_count,
  SUM(o.amount)                   AS total_spent,
  c.plan,
  CONCAT(DATE_PART('day', NOW() - c.created_at), ' days')
                                  AS on_trial_since
FROM   customers c
JOIN   orders o ON o.customer_id = c.id
WHERE  c.plan = 'trial'
GROUP BY c.id, c.name, c.plan, c.created_at
HAVING COUNT(o.id) > 3
ORDER BY order_count DESC;`,
    steps: [
      { l: 'Parsing intent', d: 'Filter: plan=trial · condition: order_count > 3 · goal: identify high-engagement trial accounts' },
      { l: 'Schema analysis', d: 'Order count from COUNT(orders.id) · requires JOIN to orders table · HAVING filter (post-aggregation) not WHERE' },
      { l: 'Planning the join', d: 'JOIN orders ON customer_id · GROUP BY customer · HAVING COUNT > 3 · compute trial age from created_at' },
      { l: 'Generating SQL', d: 'HAVING COUNT(o.id) > 3 (not WHERE) · CONCAT + DATE_PART for readable tenure · ORDER BY order_count DESC' },
      { l: 'Verifying query', d: 'HAVING is correct here — WHERE can\'t reference aggregates · GROUP BY includes all non-aggregated SELECT columns' },
      { l: 'Reading results', d: 'Identifying conversion candidates and upsell urgency signals' }
    ],
    results: {
      columns: ['Customer', 'Orders', 'Total Spent', 'Plan', 'On Trial Since'],
      rows: [
        ['RapidBuild', '5', '$4,200', 'trial', '47 days'],
        ['FlowStack', '4', '$2,100', 'trial', '38 days'],
        ['NodeCraft', '3', '$890', 'trial', '62 days'],
        ['Synapse Co', '3', '$1,450', 'trial', '29 days']
      ],
      rowCount: 4,
      isSample: true
    },
    insight: 'These 4 customers have paid $8,640 in orders while on trial plans — clear value signal. RapidBuild (47 days, 5 orders) and FlowStack are prime upsell targets for Starter or Professional.'
  },

  {
    id: 'growth',
    title: 'Monthly revenue growth',
    question: 'Show monthly revenue growth for the past 6 months',
    keywords: ['monthly', 'growth', '6 months', 'revenue growth', 'monthly revenue growth'],
    intent: {
      entity: 'orders & subscriptions',
      metric: 'monthly new revenue, churned MRR, net MRR, growth %',
      filters: ["ordered_at >= NOW() - INTERVAL '6 months'", "cancelled_at >= NOW() - INTERVAL '6 months'"],
      time_range: 'past 6 months',
      sort: 'm.mo ASC',
      limit: null
    },
    schemaMapping: {
      tables: ['orders', 'subscriptions', 'customers'],
      joins: ['subscriptions JOIN customers ON customers.id = subscriptions.customer_id'],
      reason_for_each_join: 'orders aggregated by month for new revenue, subscriptions joined to customers for churned MRR'
    },
    joinPlan: 'Define two CTEs: monthly new revenue from orders and churned MRR from subscriptions. Left join on month, compute net MRR, and calculate growth percentage with LAG().',
    sql: `-- Monthly net MRR with growth % using LAG window function
-- Two CTEs: new revenue from orders, churned MRR from subscriptions

WITH monthly AS (
  SELECT DATE_TRUNC('month', o.ordered_at) AS mo,
         SUM(o.amount) AS new_rev
  FROM   orders o
  WHERE  o.ordered_at >= NOW() - INTERVAL '6 months'
  GROUP BY 1
), churned AS (
  SELECT DATE_TRUNC('month', s.cancelled_at) AS mo,
         -SUM(c.mrr) AS churned_mrr
  FROM   subscriptions s
  JOIN   customers c ON c.id = s.customer_id
  WHERE  s.churned = true
    AND  s.cancelled_at >= NOW() - INTERVAL '6 months'
  GROUP BY 1
)
SELECT
  TO_CHAR(m.mo, 'Mon YYYY')      AS month,
  m.new_rev,
  COALESCE(ch.churned_mrr, 0)   AS churned_mrr,
  m.new_rev + COALESCE(ch.churned_mrr, 0) AS net_mrr,
  ROUND(100.0 * (m.new_rev - LAG(m.new_rev) OVER (ORDER BY m.mo))
    / NULLIF(LAG(m.new_rev) OVER (ORDER BY m.mo), 0), 1)
                                 AS growth_pct
FROM   monthly m
LEFT JOIN churned ch ON ch.mo = m.mo
ORDER BY m.mo;`,
    steps: [
      { l: 'Parsing intent', d: 'Metric: monthly net revenue · time: 6 months · include: new revenue, churned MRR, growth rate' },
      { l: 'Schema analysis', d: 'New revenue: SUM(orders.amount) by month · Churned MRR: subscriptions.churned JOIN customers.mrr · Two CTEs for clarity' },
      { l: 'Planning CTEs', d: 'CTE 1 (monthly): new revenue per month from orders · CTE 2 (churned): lost MRR · Final: LEFT JOIN + LAG window' },
      { l: 'Generating SQL', d: 'DATE_TRUNC(month) for grouping · LAG() for prior-month value · NULLIF prevents division by zero in growth calc' },
      { l: 'Verifying query', d: 'NULLIF(LAG(...), 0) guards against div/0 · LEFT JOIN preserves months with no churn · CTE names are unambiguous' },
      { l: 'Reading results', d: 'Identifying growth trends, churn spikes, and acceleration patterns across the 6-month window' }
    ],
    results: {
      columns: ['Month', 'New Revenue', 'Churned MRR', 'Net MRR', 'Growth'],
      rows: [
        ['Jun 2024', '$28,400', '-$3,200', '$25,200', '—'],
        ['Jul 2024', '$31,200', '-$4,100', '$27,100', '+7.5%'],
        ['Aug 2024', '$29,800', '-$2,800', '$27,000', '-0.4%'],
        ['Sep 2024', '$34,500', '-$3,600', '$30,900', '+14.4%'],
        ['Oct 2024', '$36,100', '-$5,200', '$30,900', '+0%'],
        ['Nov 2024', '$38,800', '-$4,400', '$34,400', '+11.3%']
      ],
      rowCount: 6,
      isSample: true
    },
    insight: 'Net MRR grew 36% over 6 months, but October stalled at +0% despite $36K in new revenue — churn spiked to $5,200. Solving the October churn pattern alone would have yielded ~17% more cumulative growth.'
  }
];

function findPreset(question) {
  if (!question || typeof question !== 'string') return null;
  const q = question.toLowerCase().trim();

  // If question is already a direct SQL query, treat as custom query
  if (q.startsWith('select') || q.startsWith('with')) {
    return null;
  }

  // 1. Direct exact or normalized match
  for (const preset of PRESETS) {
    if (q === preset.question.toLowerCase().trim()) {
      return preset;
    }
  }

  // 2. High-precision rule matching for the 5 golden queries
  if ((q.includes('top 5') || q.includes('top five')) && (q.includes('revenue') || q.includes('quarter'))) {
    return PRESETS.find(p => p.id === 'revenue');
  }
  if (q.includes('churn') && (q.includes('enterprise') || q.includes('30 day') || q.includes('30-day'))) {
    return PRESETS.find(p => p.id === 'churn');
  }
  if ((q.includes('avg mrr') || q.includes('average mrr')) || (q.includes('mrr') && (q.includes('plan tier') || q.includes('by plan') || q.includes('by tier')))) {
    return PRESETS.find(p => p.id === 'mrr');
  }
  if (q.includes('trial') && (q.includes('3 order') || q.includes('3+') || q.includes('more than 3'))) {
    return PRESETS.find(p => p.id === 'trial');
  }
  if (q.includes('growth') && (q.includes('6 month') || q.includes('revenue growth') || q.includes('monthly'))) {
    return PRESETS.find(p => p.id === 'growth');
  }

  return null;
}

module.exports = {
  PRESETS,
  findPreset
};
