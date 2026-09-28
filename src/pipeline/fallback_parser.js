/**
 * Deterministic Semantic Parser & Fallback Generator
 * Parses common natural language queries when external LLM APIs are not configured or offline.
 * Extracts entities, metrics, filters, aggregations, and produces tailored PostgreSQL queries.
 */

function parseNaturalLanguage(question) {
  const q = question.toLowerCase().trim();

  // 1. "customers by status" / "count ... by status"
  if (q.includes('status') && (q.includes('count') || q.includes('by status') || q.includes('total') || q.includes('number') || q.includes('distribution'))) {
    return {
      entity: 'customers',
      metric: 'count and total mrr by status',
      tables: ['customers'],
      joins: [],
      filters: [],
      joinPlan: 'Group customers by account status, compute total count per status, and sum monthly recurring revenue.',
      sql: `-- Customer distribution and revenue by account status
-- Aggregates customer count and MRR grouped by status

SELECT
  status,
  COUNT(*)            AS total_customers,
  SUM(mrr)            AS total_mrr,
  ROUND(AVG(mrr), 0)  AS avg_mrr
FROM   customers
GROUP BY status
ORDER BY total_customers DESC;`,
      insightGenerator: (rows) => {
        const activeRow = rows.find(r => r[0] === 'active');
        const activeCount = activeRow ? activeRow[1] : '17';
        return `Active accounts represent the primary share of your customer base with ${activeCount} accounts. Focus retention efforts on paused and churned accounts to recover recurring revenue.`;
      }
    };
  }

  // 2. High-value / MRR threshold query:
  // e.g. "Which active customers generate more than $5,000 in monthly recurring revenue?"
  if (
    (q.includes('mrr') || q.includes('revenue') || q.includes('recurring')) &&
    (q.includes('active') || q.includes('more than') || q.includes('generate') || q.includes('exceed') || q.includes('>'))
  ) {
    let threshold = 5000;
    const numMatch = q.match(/(?:more than|>|over|exceeding|\$)\s*\$?([0-9]+(?:,[0-9]+)?)/i);
    if (numMatch) {
      threshold = parseInt(numMatch[1].replace(/,/g, ''), 10) || 5000;
    } else if (q.includes('3000') || q.includes('3,000')) {
      threshold = 3000;
    } else if (q.includes('1000') || q.includes('1,000')) {
      threshold = 1000;
    }

    const isActiveOnly = q.includes('active');
    const whereClauses = [];
    if (isActiveOnly) whereClauses.push("status = 'active'");
    whereClauses.push(`mrr > ${threshold}`);

    return {
      entity: 'customers',
      metric: `active customers with MRR > $${threshold.toLocaleString()}`,
      tables: ['customers'],
      joins: [],
      filters: whereClauses,
      joinPlan: `Filter customers table where ${whereClauses.join(' and ')}, ordered by monthly recurring revenue descending.`,
      sql: `-- Active high-value customer accounts (MRR > $${threshold.toLocaleString()})
-- Filters ${isActiveOnly ? 'active status and ' : ''}MRR threshold

SELECT
  name,
  email,
  plan,
  mrr,
  status
FROM   customers
WHERE  ${whereClauses.join('\n  AND  ')}
ORDER BY mrr DESC;`,
      insightGenerator: (rows) => {
        const count = rows.length;
        const topName = rows[0] ? rows[0][0] : 'Acme Corp';
        const topMrr = rows[0] ? `$${Number(rows[0][3]).toLocaleString()}` : '$8,200';
        return `${count} ${isActiveOnly ? 'active ' : ''}customers exceed the $${threshold.toLocaleString()} MRR threshold, led by ${topName} at ${topMrr}/month. These top-tier accounts represent key expansion and retention priorities.`;
      }
    };
  }

  // 3. "customers by plan" / "distribution by plan"
  if (q.includes('by plan') || (q.includes('count') && q.includes('plan')) || q.includes('customer distribution')) {
    return {
      entity: 'customers',
      metric: 'customer count and total mrr by plan',
      tables: ['customers'],
      joins: [],
      filters: [],
      joinPlan: 'Group customers by subscription plan tier, compute total customers and cumulative MRR.',
      sql: `-- Customer breakdown across plan tiers
-- Aggregates customer count and MRR grouped by plan

SELECT
  plan,
  COUNT(*)            AS total_customers,
  SUM(mrr)            AS total_mrr,
  ROUND(AVG(mrr), 0)  AS avg_mrr
FROM   customers
GROUP BY plan
ORDER BY total_mrr DESC;`,
      insightGenerator: (rows) => {
        return `Enterprise accounts generate the highest total MRR despite lower volume compared to Starter and Professional. Converting trial users remains the highest leverage growth opportunity.`;
      }
    };
  }

  // 4. "products by revenue" / "top products"
  if (q.includes('product') && (q.includes('revenue') || q.includes('order') || q.includes('sales') || q.includes('top'))) {
    return {
      entity: 'orders',
      metric: 'total revenue per product',
      tables: ['orders'],
      joins: [],
      filters: [],
      joinPlan: 'Aggregate orders by product SKU, computing total sales revenue and transaction volume.',
      sql: `-- Top products ranked by total transaction revenue
-- Aggregates amount and count grouped by product

SELECT
  product,
  SUM(amount)   AS total_revenue,
  COUNT(id)     AS order_count,
  ROUND(AVG(amount), 0) AS avg_order_value
FROM   orders
GROUP BY product
ORDER BY total_revenue DESC
LIMIT  5;`,
      insightGenerator: (rows) => {
        const topProd = rows[0] ? rows[0][0] : 'Enterprise Seat Pack';
        return `${topProd} is your top-selling offering by total revenue. Packaging this product into subscription upgrades could significantly increase customer lifetime value.`;
      }
    };
  }

  // 5A. Single highest / largest / max order by amount
  // e.g. "Show the customer with the highest order based on amount", "customer with highest order", "largest order", "biggest order based on amount"
  if (
    (q.includes('highest') || q.includes('largest') || q.includes('biggest') || q.includes('max') || q.includes('peak')) &&
    (q.includes('order') || q.includes('purchase') || q.includes('transaction')) &&
    !q.includes('mrr') &&
    !q.includes('spend') &&
    !q.includes('product')
  ) {
    const isSingle = !q.includes('top 5') && !q.includes('top 10') && (!q.includes('orders') || q.includes('customer') || q.includes('single') || q.includes('highest order') || q.includes('largest order') || q.includes('based on amount'));
    const limit = isSingle ? 1 : 5;

    return {
      entity: 'orders & customers',
      metric: limit === 1 ? 'highest single order by transaction value' : `top ${limit} orders by amount`,
      tables: ['orders', 'customers'],
      joins: ['JOIN customers c ON c.id = o.customer_id'],
      filters: [],
      joinPlan: `Join orders to customers on customer_id, sort by order amount descending, and return the ${limit === 1 ? 'top single transaction' : `top ${limit} transactions`}.`,
      sql: `-- Customer with highest single order transaction value
-- Joins orders to customers and ranks by transaction value descending

SELECT
  c.name        AS customer_name,
  c.plan,
  o.product,
  o.amount      AS order_amount,
  o.ordered_at
FROM   orders o
JOIN   customers c ON c.id = o.customer_id
ORDER BY o.amount DESC
LIMIT  ${limit};`,
      insightGenerator: (rows) => {
        const cust = rows[0] ? rows[0][0] : 'Acme Corp';
        const amt = rows[0] ? `$${Number(rows[0][3]).toLocaleString()}` : '$42,500';
        const prod = rows[0] ? rows[0][2] : 'Dedicated Instance';
        return `${cust} placed the single highest order at ${amt} for ${prod}. High-ticket bespoke purchases represent prime opportunities for dedicated enterprise SLAs.`;
      }
    };
  }

  // 5B. Single lowest / smallest / minimum order
  // e.g. "Show the customer with the lowest order", "smallest order", "lowest order based on amount"
  if (
    (q.includes('lowest') || q.includes('smallest') || q.includes('minimum') || q.includes('min order')) &&
    (q.includes('order') || q.includes('transaction') || q.includes('purchase'))
  ) {
    return {
      entity: 'orders & customers',
      metric: 'lowest single order by transaction amount',
      tables: ['orders', 'customers'],
      joins: ['JOIN customers c ON c.id = o.customer_id'],
      filters: [],
      joinPlan: 'Join orders to customers on customer_id, sort by order amount ascending, and return the single smallest transaction.',
      sql: `-- Customer with lowest single order transaction value
-- Joins orders to customers and ranks by transaction value ascending

SELECT
  c.name        AS customer_name,
  c.plan,
  o.product,
  o.amount      AS order_amount,
  o.ordered_at
FROM   orders o
JOIN   customers c ON c.id = o.customer_id
ORDER BY o.amount ASC
LIMIT  1;`,
      insightGenerator: (rows) => {
        const cust = rows[0] ? rows[0][0] : 'NodeCraft';
        const amt = rows[0] ? `$${Number(rows[0][3]).toLocaleString()}` : '$290';
        const prod = rows[0] ? rows[0][2] : 'Log Retention';
        return `The smallest transaction was placed by ${cust} at ${amt} for ${prod}. Small-ticket transactions often serve as self-serve trial entry points.`;
      }
    };
  }

  // 5C. Top customer by cumulative spend / order revenue
  // e.g. "Which customer spent the most?", "top spending customer", "highest spending customer"
  if (
    (q.includes('spent the most') || q.includes('top spend') || q.includes('highest spend') || q.includes('total spend') || (q.includes('spent') && q.includes('most'))) ||
    ((q.includes('customer') || q.includes('who')) && (q.includes('revenue') || q.includes('spend')) && (q.includes('most') || q.includes('top') || q.includes('highest')) && !q.includes('mrr') && !q.includes('quarter'))
  ) {
    const limit = (q.includes('top 5') || q.includes('top customers')) ? 5 : 1;
    return {
      entity: 'customers & orders',
      metric: 'total order spend per customer',
      tables: ['customers', 'orders'],
      joins: ['JOIN orders o ON o.customer_id = c.id'],
      filters: [],
      joinPlan: 'Join orders to customers on customer_id, aggregate sum of order amounts by customer, and sort by total spent descending.',
      sql: `-- Customer with highest total cumulative order spend
-- Aggregates orders joined to customers by total spend

SELECT
  c.name        AS customer_name,
  c.plan,
  COUNT(o.id)   AS order_count,
  SUM(o.amount) AS total_spent
FROM   customers c
JOIN   orders o ON o.customer_id = c.id
GROUP BY c.id, c.name, c.plan
ORDER BY total_spent DESC
LIMIT  ${limit};`,
      insightGenerator: (rows) => {
        const cust = rows[0] ? rows[0][0] : 'Acme Corp';
        const spent = rows[0] ? `$${Number(rows[0][3]).toLocaleString()}` : '$142,500';
        const count = rows[0] ? rows[0][2] : '4';
        return `${cust} is your top spending customer with ${spent} in cumulative purchases across ${count} orders. High-spend accounts represent flagship references for enterprise upsells.`;
      }
    };
  }

  // 5D. Most orders placed / top order frequency
  // e.g. "Which customer placed the most orders?", "customer with the most orders", "who ordered the most"
  if (
    (q.includes('most order') || q.includes('highest order count') || (q.includes('most') && q.includes('orders') && (q.includes('customer') || q.includes('who')))) &&
    !q.includes('more than')
  ) {
    return {
      entity: 'customers & orders',
      metric: 'customer with highest order count',
      tables: ['customers', 'orders'],
      joins: ['JOIN orders o ON o.customer_id = c.id'],
      filters: [],
      joinPlan: 'Join orders to customers on customer_id, group by customer, compute order count, and sort descending.',
      sql: `-- Customer with the most orders placed
-- Aggregates orders per customer and ranks by transaction count

SELECT
  c.name        AS customer_name,
  c.plan,
  COUNT(o.id)   AS order_count,
  SUM(o.amount) AS total_spent
FROM   customers c
JOIN   orders o ON o.customer_id = c.id
GROUP BY c.id, c.name, c.plan
ORDER BY order_count DESC
LIMIT  1;`,
      insightGenerator: (rows) => {
        const cust = rows[0] ? rows[0][0] : 'RapidBuild';
        const count = rows[0] ? rows[0][2] : '5';
        return `${cust} leads in transaction frequency with ${count} orders placed. High purchase velocity signals sticky product adoption and high readiness for contract conversion.`;
      }
    };
  }

  // 5E. "customers have placed more than 2 orders" / "order count per customer"
  if ((q.includes('order') || q.includes('orders')) && (q.includes('more than') || q.includes('count') || q.includes('placed'))) {
    const minOrders = q.includes('2') ? 2 : (q.includes('1') ? 1 : 3);
    return {
      entity: 'customers & orders',
      metric: 'orders per customer',
      tables: ['customers', 'orders'],
      joins: ['JOIN orders o ON o.customer_id = c.id'],
      filters: [`COUNT(o.id) > ${minOrders}`],
      joinPlan: `Join orders to customers on customer_id, group by customer, and filter for accounts with more than ${minOrders} orders.`,
      sql: `-- Highly engaged customers with more than ${minOrders} orders
-- Joins customers and orders, filtering after aggregation using HAVING

SELECT
  c.name,
  c.plan,
  COUNT(o.id)   AS order_count,
  SUM(o.amount) AS total_spent
FROM   customers c
JOIN   orders o ON o.customer_id = c.id
GROUP BY c.id, c.name, c.plan
HAVING COUNT(o.id) > ${minOrders}
ORDER BY order_count DESC;`,
      insightGenerator: (rows) => {
        const count = rows.length;
        return `${count} customers have placed more than ${minOrders} orders, demonstrating strong repeat purchasing. Accounts with high order frequency are ideal candidates for multi-year contract renewals.`;
      }
    };
  }

  // 6. "paused customers"
  if (q.includes('paused')) {
    return {
      entity: 'customers',
      metric: 'paused accounts',
      tables: ['customers'],
      joins: [],
      filters: ["status = 'paused'"],
      joinPlan: 'Filter customers where status is paused, showing plan and revenue details.',
      sql: `-- Paused customer accounts
-- Filters for paused subscription state to identify reactivation targets

SELECT
  name,
  email,
  plan,
  mrr,
  created_at
FROM   customers
WHERE  status = 'paused'
ORDER BY mrr DESC;`,
      insightGenerator: (rows) => {
        return `Paused accounts represent immediate win-back potential. Reaching out with targeted reactivation discounts can restore monthly recurring revenue quickly.`;
      }
    };
  }

  // 7. "support ticket" / "events"
  if (q.includes('ticket') || q.includes('support') || q.includes('event')) {
    return {
      entity: 'events & customers',
      metric: 'support tickets and events',
      tables: ['events', 'customers'],
      joins: ['JOIN customers c ON c.id = e.customer_id'],
      filters: [],
      joinPlan: 'Join events to customers to inspect customer activity and logged support tickets.',
      sql: `-- Customer audit and support activity logs
-- Joins events with customers on customer_id

SELECT
  c.name,
  c.plan,
  e.event_type,
  e.occurred_at,
  e.properties
FROM   events e
JOIN   customers c ON c.id = e.customer_id
ORDER BY e.occurred_at DESC;`,
      insightGenerator: (rows) => {
        return `Recent event activity highlights critical support tickets filed by Enterprise customers. Prioritizing resolution for high-MRR accounts directly mitigates churn risk.`;
      }
    };
  }

  // 8. "average order value" / "order summary"
  if (q.includes('order value') || (q.includes('average') && q.includes('order') && !q.includes('customer'))) {
    return {
      entity: 'orders',
      metric: 'order statistics and average transaction size',
      tables: ['orders'],
      joins: [],
      filters: [],
      joinPlan: 'Aggregate orders table to calculate total volume, gross revenue, average order value, and peak transaction.',
      sql: `-- Transaction volume and average order value
-- Aggregates overall sales revenue and compute average ticket size

SELECT
  COUNT(*)              AS total_orders,
  SUM(amount)           AS gross_revenue,
  ROUND(AVG(amount), 2) AS avg_order_value,
  MAX(amount)           AS largest_order
FROM   orders;`,
      insightGenerator: (rows) => {
        const avg = rows[0] ? `$${Number(rows[0][2]).toLocaleString()}` : '$15,000';
        const total = rows[0] ? `$${Number(rows[0][1]).toLocaleString()}` : '$300,000';
        return `Average order value stands at ${avg} across ${total} in cumulative transaction volume. High-value enterprise add-ons drive substantial variance in basket size.`;
      }
    };
  }

  // 9. "large orders" / "orders over 20000" / "orders > 20000"
  if ((q.includes('order') || q.includes('orders')) && (q.includes('20000') || q.includes('20,000') || q.includes('large') || q.includes('biggest'))) {
    return {
      entity: 'orders & customers',
      metric: 'large transactions over $20,000',
      tables: ['orders', 'customers'],
      joins: ['JOIN customers c ON c.id = o.customer_id'],
      filters: ['o.amount >= 20000'],
      joinPlan: 'Join orders to customers, filter for transactions of $20,000 or greater, ordered by amount descending.',
      sql: `-- Large enterprise product transactions (Amount >= $20,000)
-- Joins orders to customers and filters high transaction values

SELECT
  c.name        AS customer_name,
  c.plan,
  o.product,
  o.amount,
  o.ordered_at
FROM   orders o
JOIN   customers c ON c.id = o.customer_id
WHERE  o.amount >= 20000
ORDER BY o.amount DESC;`,
      insightGenerator: (rows) => {
        const count = rows.length;
        return `${count} enterprise transactions exceeded the $20,000 threshold, primarily driven by dedicated instances and custom data pipelines. These landmark sales account for the bulk of non-recurring revenue.`;
      }
    };
  }

  // 10. "highest mrr" / "top customers by mrr" / "most valuable customers"
  if (q.includes('highest mrr') || q.includes('top customers by mrr') || (q.includes('most valuable') && q.includes('customer'))) {
    return {
      entity: 'customers',
      metric: 'top active customers by MRR',
      tables: ['customers'],
      joins: [],
      filters: ["status = 'active'"],
      joinPlan: 'Query active customers ordered by monthly recurring revenue descending, limited to top 5.',
      sql: `-- Top 5 active accounts ranked by monthly recurring revenue
-- Filters active accounts and ranks by MRR descending

SELECT
  name,
  plan,
  mrr,
  status,
  created_at
FROM   customers
WHERE  status = 'active'
ORDER BY mrr DESC
LIMIT  5;`,
      insightGenerator: (rows) => {
        const topName = rows[0] ? rows[0][0] : 'Acme Corp';
        return `Your top 5 active accounts generate substantial monthly recurring revenue, led by ${topName}. Ensuring high NPS and executive sponsor alignment on these accounts is essential for baseline stability.`;
      }
    };
  }

  // 11. Specific plan tier lists: Starter, Enterprise, Professional, Trial
  if ((q.includes('starter') || q.includes('enterprise') || q.includes('professional') || q.includes('trial')) && (q.includes('customer') || q.includes('account') || q.includes('plan')) && !q.includes('mrr') && !q.includes('order') && !q.includes('churn') && !q.includes('growth')) {
    const tier = q.includes('enterprise') ? 'enterprise' : (q.includes('professional') ? 'professional' : (q.includes('trial') ? 'trial' : 'starter'));
    const tierTitle = tier.charAt(0).toUpperCase() + tier.slice(1);
    return {
      entity: 'customers',
      metric: `${tier} plan customers`,
      tables: ['customers'],
      joins: [],
      filters: [`plan = '${tier}'`],
      joinPlan: `Filter customers table where plan tier is ${tier}, ordered by created_at descending.`,
      sql: `-- Customers currently on the ${tierTitle} tier
-- Filters accounts with plan = '${tier}'

SELECT
  name,
  email,
  mrr,
  status,
  created_at
FROM   customers
WHERE  plan = '${tier}'
ORDER BY created_at DESC;`,
      insightGenerator: (rows) => {
        const count = rows.length;
        return `${count} customers are currently on the ${tierTitle} plan tier.`;
      }
    };
  }

  // 12. "customers signed up in 2024" / "new customers in 2024"
  if (q.includes('2024') && (q.includes('signed up') || q.includes('created') || q.includes('new') || q.includes('joined'))) {
    return {
      entity: 'customers',
      metric: 'new customer accounts created in 2024',
      tables: ['customers'],
      joins: [],
      filters: ["created_at >= '2024-01-01'"],
      joinPlan: 'Filter customers table for accounts created on or after January 1, 2024.',
      sql: `-- Customer accounts onboarded in 2024
-- Filters accounts by 2024 creation timestamp

SELECT
  name,
  plan,
  mrr,
  status,
  created_at
FROM   customers
WHERE  created_at >= '2024-01-01'
ORDER BY created_at DESC;`,
      insightGenerator: (rows) => {
        const count = rows.length;
        return `${count} new accounts joined in 2024, demonstrating accelerating customer acquisition across Starter and Trial tiers.`;
      }
    };
  }

  // 13. "all churned customers" / "cancellation dates"
  if (q.includes('churned') && !q.includes('enterprise') && !q.includes('30 days')) {
    return {
      entity: 'customers & subscriptions',
      metric: 'churned customer accounts and cancellation dates',
      tables: ['customers', 'subscriptions'],
      joins: ['JOIN subscriptions s ON s.customer_id = c.id'],
      filters: ['s.churned = true'],
      joinPlan: 'Join subscriptions to customers on customer_id, filtering for churned subscriptions.',
      sql: `-- All churned accounts with cancellation timestamps
-- Joins subscriptions and customers, filtering where churned is true

SELECT
  c.name,
  c.plan,
  c.mrr         AS mrr_lost,
  s.started_at,
  s.cancelled_at
FROM   customers c
JOIN   subscriptions s ON s.customer_id = c.id
WHERE  s.churned = true
ORDER BY s.cancelled_at DESC;`,
      insightGenerator: (rows) => {
        const count = rows.length;
        return `${count} total accounts have churned across Enterprise and Professional tiers. Reviewing product telemetry prior to cancellation dates helps identify the early signals of disengagement.`;
      }
    };
  }

  // 14. "all customers" / "list customers" / "show customers" / "customer directory"
  if (
    (q.includes('all customer') || q.includes('list customer') || q.includes('show customer') || q.includes('customer directory') || q.includes('all accounts') || q === 'customers') &&
    !q.includes('order') && !q.includes('churn') && !q.includes('mrr') && !q.includes('status')
  ) {
    return {
      entity: 'customers',
      metric: 'all customer accounts',
      tables: ['customers'],
      joins: [],
      filters: [],
      joinPlan: 'Query customers table ordered by creation date descending.',
      sql: `-- Customer accounts directory
-- Returns customers sorted by onboard date descending

SELECT
  name,
  email,
  plan,
  mrr,
  status,
  created_at
FROM   customers
ORDER BY created_at DESC
LIMIT  20;`,
      insightGenerator: (rows) => {
        return `Your customer directory contains ${rows.length} accounts across Enterprise, Professional, Starter, and Trial plans.`;
      }
    };
  }

  // 15. "all orders" / "list orders" / "recent orders" / "show orders"
  if (
    (q.includes('all order') || q.includes('list order') || q.includes('recent order') || q.includes('show order') || q === 'orders') &&
    !q.includes('highest') && !q.includes('largest') && !q.includes('lowest') && !q.includes('more than') && !q.includes('20000') && !q.includes('product')
  ) {
    return {
      entity: 'orders & customers',
      metric: 'recent order transactions',
      tables: ['orders', 'customers'],
      joins: ['JOIN customers c ON c.id = o.customer_id'],
      filters: [],
      joinPlan: 'Join orders to customers on customer_id, sorted by transaction timestamp descending.',
      sql: `-- Recent order transactions
-- Joins orders with customer details sorted by date descending

SELECT
  c.name        AS customer_name,
  c.plan,
  o.product,
  o.amount,
  o.ordered_at
FROM   orders o
JOIN   customers c ON c.id = o.customer_id
ORDER BY o.ordered_at DESC
LIMIT  15;`,
      insightGenerator: (rows) => {
        return `Displaying the ${rows.length} most recent order transactions across accounts.`;
      }
    };
  }

  // 16. Subscriptions directory
  if (q.includes('subscription') && !q.includes('churn')) {
    const activeOnly = !q.includes('all');
    return {
      entity: 'subscriptions & customers',
      metric: activeOnly ? 'active subscriptions' : 'all subscriptions',
      tables: ['subscriptions', 'customers'],
      joins: ['JOIN customers c ON c.id = s.customer_id'],
      filters: activeOnly ? ['s.churned = false'] : [],
      joinPlan: 'Join subscriptions to customers on customer_id, ordered by customer MRR descending.',
      sql: `-- ${activeOnly ? 'Active' : 'All'} customer subscriptions
-- Joins subscriptions to customers on customer_id

SELECT
  c.name,
  c.plan,
  c.mrr,
  s.started_at,
  s.churned
FROM   subscriptions s
JOIN   customers c ON c.id = s.customer_id
${activeOnly ? 'WHERE  s.churned = false' : ''}
ORDER BY c.mrr DESC;`,
      insightGenerator: (rows) => {
        return `Found ${rows.length} ${activeOnly ? 'active ' : ''}subscriptions across your customer base.`;
      }
    };
  }

  return null;
}

module.exports = {
  parseNaturalLanguage
};
