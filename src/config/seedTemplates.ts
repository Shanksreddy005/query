import { UserSavedQuery } from '../services/localQueryStorage';

export const STARTER_SEED_TEMPLATES: UserSavedQuery[] = [
  // 1. SaaS Customer & Revenue Metrics Pack
  {
    userQuery: "Show top 5 Enterprise customers by MRR",
    schemaContextFingerprint: "active_users,churn_status,company_name,customer_id,industry,mrr,nps_score,plan_tier,signup_date,support_tickets",
    successfulSql: `SELECT "company_name", "plan_tier", "mrr" FROM "customers" WHERE "plan_tier" = 'Enterprise' ORDER BY "mrr" DESC LIMIT 5;`,
    savedAt: 1729420000000
  },
  {
    userQuery: "Identify at-risk accounts with low NPS or high support tickets",
    schemaContextFingerprint: "active_users,churn_status,company_name,customer_id,industry,mrr,nps_score,plan_tier,signup_date,support_tickets",
    successfulSql: `SELECT "company_name", "mrr", "nps_score", "support_tickets" FROM "customers" WHERE "churn_status" IN ('At-Risk', 'Churned') AND "nps_score" < 6 ORDER BY "mrr" DESC;`,
    savedAt: 1729420000000
  },
  {
    userQuery: "Calculate breakdown and ARPU by plan tier",
    schemaContextFingerprint: "active_users,churn_status,company_name,customer_id,industry,mrr,nps_score,plan_tier,signup_date,support_tickets",
    successfulSql: `SELECT "plan_tier", COUNT(*) as total_accounts, ROUND(AVG("mrr"), 2) as arpu, SUM("mrr") as total_mrr FROM "customers" GROUP BY "plan_tier" ORDER BY total_mrr DESC;`,
    savedAt: 1729420000000
  },
  // 2. E-Commerce & Retail Sales Pack
  {
    userQuery: "What is the top sold product in each region?",
    schemaContextFingerprint: "category,discount_pct,order_date,order_id,product,profit,quantity,region,sales",
    successfulSql: `WITH ranked_items AS (SELECT "region", "product", SUM("quantity") as total_units, ROW_NUMBER() OVER (PARTITION BY "region" ORDER BY SUM("quantity") DESC) as rank_idx FROM "orders" GROUP BY "region", "product") SELECT * FROM ranked_items WHERE rank_idx = 1;`,
    savedAt: 1729420000000
  },
  {
    userQuery: "Find orders with high discounts that lost money",
    schemaContextFingerprint: "category,discount_pct,order_date,order_id,product,profit,quantity,region,sales",
    successfulSql: `SELECT "order_id", "product", "discount_pct", "profit", "sales" FROM "orders" WHERE "discount_pct" > 0.15 AND "profit" < 0 ORDER BY "profit" ASC;`,
    savedAt: 1729420000000
  },
  {
    userQuery: "Summarize revenue and margins by product category",
    schemaContextFingerprint: "category,discount_pct,order_date,order_id,product,profit,quantity,region,sales",
    successfulSql: `SELECT "category", ROUND(SUM("sales"), 2) as total_sales, ROUND(SUM("profit"), 2) as total_profit, ROUND((SUM("profit") / SUM("sales")) * 100, 2) as margin_pct FROM "orders" GROUP BY "category" ORDER BY total_sales DESC;`,
    savedAt: 1729420000000
  },
  // 3. Product Analytics & Telemetry Pack
  {
    userQuery: "Calculate event error rates across platforms",
    schemaContextFingerprint: "duration_seconds,error_flag,event_id,event_name,platform,session_id,timestamp,user_id",
    successfulSql: `SELECT "platform", COUNT(*) as total_events, SUM(CASE WHEN "error_flag" = true THEN 1 ELSE 0 END) as error_count, ROUND(AVG(CASE WHEN "error_flag" = true THEN 1.0 ELSE 0.0 END) * 100, 2) as error_rate_pct FROM "telemetry" GROUP BY "platform" ORDER BY error_rate_pct DESC;`,
    savedAt: 1729420000000
  },
  {
    userQuery: "Find the 95th percentile session duration by platform",
    schemaContextFingerprint: "duration_seconds,error_flag,event_id,event_name,platform,session_id,timestamp,user_id",
    successfulSql: `SELECT "platform", ROUND(AVG("duration_seconds"), 1) as avg_duration, QUANTILE_CONT("duration_seconds", 0.95) as p95_duration FROM "telemetry" GROUP BY "platform";`,
    savedAt: 1729420000000
  }
];
