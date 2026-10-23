export interface GoldenTemplate {
  id: string;
  category: "GENERIC" | "SAAS" | "ECOMMERCE" | "PRODUCT_ANALYTICS";
  description: string;
  patterns: string[];
  sql_template: string;
}

export const GOLDEN_TEMPLATES: GoldenTemplate[] = [
  // 1. GENERIC: Top N Per Group
  {
    id: "top_n_per_group",
    category: "GENERIC",
    description: "Filtering the highest, lowest, or most frequent records inside distinct groups, categories, or regions.",
    patterns: ["top product per region", "most sold item in each", "highest earning", "rank rows within", "best performing in"],
    sql_template: `WITH ranked_items AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY "group_col" ORDER BY "metric_col" DESC) as rank_idx 
  FROM "table"
) SELECT * FROM ranked_items WHERE rank_idx = 1;`
  },
  // 2. GENERIC: Period-over-Period Growth
  {
    id: "period_over_period",
    category: "GENERIC",
    description: "Calculating window growth differentials, rolling trend trajectories, or rate changes across time frames.",
    patterns: ["month over month", "growth rate", "revenue trend", "mom", "yoy", "weekly delta", "percentage change over time"],
    sql_template: `WITH monthly_stats AS (
  SELECT DATE_TRUNC('month', "date_col") as period, SUM("metric_col") as total 
  FROM "table" GROUP BY 1
) SELECT period, total, total - LAG(total) OVER (ORDER BY period) as periodic_growth 
FROM monthly_stats;`
  },
  // 3. SAAS: Monthly Customer Cohort Retention Matrix
  {
    id: "monthly_cohort_retention",
    category: "SAAS",
    description: "Monthly customer cohort retention tracking activity over subsequent months relative to an initial acquisition window.",
    patterns: ["cohort retention", "retention curve", "churn over time", "cohort analysis", "customer retention by signup month", "user lifespan"],
    sql_template: `WITH cohort_items AS (
  SELECT 
    "customer_id",
    DATE_TRUNC('month', MIN("signup_date")) as cohort_month
  FROM "table"
  GROUP BY "customer_id"
),
activities AS (
  SELECT 
    t."customer_id",
    c.cohort_month,
    DATE_DIFF('month', c.cohort_month, DATE_TRUNC('month', t."activity_date")) as period_number
  FROM "table" t
  JOIN cohort_items c ON t."customer_id" = c."customer_id"
)
SELECT 
  cohort_month,
  period_number,
  COUNT(DISTINCT "customer_id") as active_users
FROM activities
GROUP BY cohort_month, period_number
ORDER BY cohort_month, period_number;`
  },
  // 4. SAAS: Customer Lifetime Value (LTV) & Payback
  {
    id: "customer_ltv_arpu",
    category: "SAAS",
    description: "Average revenue per account (ARPU), billing distributions, and customer lifetime value estimation.",
    patterns: ["customer ltv", "lifetime value", "arpu", "average revenue per user", "customer value by tier", "monetary worth"],
    sql_template: `SELECT 
  "plan_tier",
  COUNT(DISTINCT "customer_id") as total_accounts,
  ROUND(AVG("mrr"), 2) as arpu,
  ROUND(SUM("mrr"), 2) as total_mrr,
  ROUND(AVG("mrr") * 24, 2) as estimated_2yr_ltv
FROM "table"
WHERE "churn_status" = 'Active'
GROUP BY "plan_tier"
ORDER BY total_mrr DESC;`
  },
  // 5. E-COMMERCE: Pareto Principle (80/20 Revenue Concentration)
  {
    id: "pareto_revenue_concentration",
    category: "ECOMMERCE",
    description: "Cumulative revenue contribution window to identify top customers or products driving 80% of volume.",
    patterns: ["pareto", "80/20", "top contributors", "cumulative share", "revenue concentration", "cumulative percentage", "concentration risk"],
    sql_template: `WITH ranked_entities AS (
  SELECT 
    "entity_name",
    SUM("sales") as entity_revenue,
    SUM(SUM("sales")) OVER () as grand_total
  FROM "table"
  GROUP BY "entity_name"
),
cumulative_calc AS (
  SELECT 
    "entity_name",
    entity_revenue,
    ROUND((entity_revenue / grand_total) * 100, 2) as pct_of_total,
    ROUND((SUM(entity_revenue) OVER (ORDER BY entity_revenue DESC) / grand_total) * 100, 2) as cumulative_pct
  FROM ranked_entities
)
SELECT * FROM cumulative_calc
ORDER BY entity_revenue DESC;`
  },
  // 6. PRODUCT ANALYTICS: RFM Segmentation (Recency, Frequency, Monetary)
  {
    id: "rfm_segmentation",
    category: "PRODUCT_ANALYTICS",
    description: "NTILE-based RFM scoring to segment users into engagement categories like champions, loyal, and at-risk.",
    patterns: ["rfm analysis", "recency frequency monetary", "customer segments", "user scoring", "customer tiers", "user engagement tracking"],
    sql_template: `WITH rfm_raw AS (
  SELECT 
    "customer_id",
    DATE_DIFF('day', MAX("order_date"), CURRENT_DATE) as recency_days,
    COUNT("order_id") as frequency,
    SUM("order_total") as monetary
  FROM "table"
  GROUP BY "customer_id"
)
SELECT 
  "customer_id",
  recency_days,
  frequency,
  monetary,
  NTILE(4) OVER (ORDER BY recency_days DESC) as r_score,
  NTILE(4) OVER (ORDER BY frequency ASC) as f_score,
  NTILE(4) OVER (ORDER BY monetary ASC) as m_score
FROM rfm_raw;`
  }
];
