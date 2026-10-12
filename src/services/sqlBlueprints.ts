import { QueryPlan } from './queryPlan';

export interface SqlBlueprint {
  name: string;
  description: string;
  template: string;
}

export const SQL_BLUEPRINTS: Record<string, SqlBlueprint> = {
  top_n_per_group: {
    name: 'Top N Items Per Group (Window Function / Partition)',
    description: 'Use when finding the most sold, top, best, or worst item within each region, category, or group.',
    template: `WITH ranked_items AS (
  SELECT 
    <partition_col>, 
    <item_col>, 
    <agg_func>(<metric_col>) AS <metric_alias>,
    ROW_NUMBER() OVER (
      PARTITION BY <partition_col> 
      ORDER BY <agg_func>(<metric_col>) <direction>
    ) AS rank
  FROM <table_name>
  <optional_where>
  GROUP BY <partition_col>, <item_col>
)
SELECT <partition_col>, <item_col>, <metric_alias>
FROM ranked_items
WHERE rank <= <limit>
ORDER BY <partition_col> ASC, rank ASC;`,
  },

  aggregate_by_dimension: {
    name: 'Dimension Aggregation',
    description: 'Use when summarizing a metric grouped by one or more categories or regions.',
    template: `SELECT 
  <dimension_col>, 
  COUNT(*) AS total_count,
  ROUND(<agg_func>(<metric_col>), 2) AS <metric_alias>
FROM <table_name>
<optional_where>
GROUP BY <dimension_col>
ORDER BY <metric_alias> DESC;`,
  },

  ranking: {
    name: 'Global Ranking (Top N Overall)',
    description: 'Use when ranking items across the entire dataset without partitioning.',
    template: `SELECT 
  <item_col>, 
  ROUND(<agg_func>(<metric_col>), 2) AS <metric_alias>
FROM <table_name>
<optional_where>
GROUP BY <item_col>
ORDER BY <metric_alias> <direction>
LIMIT <limit>;`,
  },

  percentage_of_total: {
    name: 'Percentage of Total Share',
    description: 'Use when calculating the market share or percentage contribution of each category.',
    template: `WITH totals AS (
  SELECT SUM(<metric_col>) AS grand_total FROM <table_name>
),
breakdown AS (
  SELECT 
    <dimension_col>, 
    SUM(<metric_col>) AS category_total
  FROM <table_name>
  GROUP BY <dimension_col>
)
SELECT 
  b.<dimension_col>, 
  b.category_total, 
  ROUND((b.category_total / t.grand_total) * 100, 2) AS pct_of_total
FROM breakdown b, totals t
ORDER BY b.category_total DESC;`,
  },

  filter_lookup: {
    name: 'Filtered Detail Records',
    description: 'Use when inspecting rows matching specific criteria (e.g. churned accounts, negative profit).',
    template: `SELECT <selected_cols>
FROM <table_name>
WHERE <conditions>
ORDER BY <sort_col> <direction>
LIMIT <limit>;`,
  },
};

/**
 * Returns formatted blueprints section for injection into LLM system prompt.
 */
export function getBlueprintPromptSection(): string {
  return `
SQL GENERATION BLUEPRINTS (DuckDB-WASM Compatible):
When formulating SQL, you MUST follow these canonical patterns:

1. TOP / MOST / BEST PER GROUP (e.g. "most sold product in each region", "top customer per industry"):
   DO NOT perform a simple GROUP BY without a window function.
   YOU MUST USE A CTE WITH ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...):
   \`\`\`sql
   WITH ranked_items AS (
     SELECT 
       <partition_column>, 
       <item_column>, 
       SUM(<metric_column>) AS total_<metric>,
       ROW_NUMBER() OVER (
         PARTITION BY <partition_column> 
         ORDER BY SUM(<metric_column>) DESC
       ) AS rank
     FROM dataset
     GROUP BY <partition_column>, <item_column>
   )
   SELECT <partition_column>, <item_column>, total_<metric>
   FROM ranked_items
   WHERE rank = 1
   ORDER BY total_<metric> DESC;
   \`\`\`

2. OVERALL TOP N (e.g. "top 5 products by revenue"):
   \`\`\`sql
   SELECT <item_column>, ROUND(SUM(<metric_column>), 2) AS total_<metric>
   FROM dataset
   GROUP BY <item_column>
   ORDER BY total_<metric> DESC
   LIMIT 5;
   \`\`\`

3. GROUPED AGGREGATIONS (e.g. "sales by region"):
   \`\`\`sql
   SELECT <dimension_column>, ROUND(SUM(<metric_column>), 2) AS total_<metric>
   FROM dataset
   GROUP BY <dimension_column>
   ORDER BY total_<metric> DESC;
   \`\`\`

4. FILTERED AUDITS (e.g. "orders with discount > 15% and negative profit"):
   \`\`\`sql
   SELECT <key_columns>
   FROM dataset
   WHERE discount_pct > 0.15 AND profit < 0
   ORDER BY profit ASC
   LIMIT 20;
   \`\`\`
`.trim();
}

/**
 * Deterministically constructs SQL from a validated QueryPlan using blueprints.
 */
export function constructSqlFromPlan(plan: QueryPlan, tableName: string): string {
  const table = `"${tableName}"`;

  // Build WHERE clause from filters
  let whereClause = '';
  if (plan.filters && plan.filters.length > 0) {
    const conditions = plan.filters.map((f) => {
      if (f.operator === 'IS NULL' || f.operator === 'IS NOT NULL') {
        return `${f.column} ${f.operator}`;
      }
      if (typeof f.value === 'string') {
        return `${f.column} ${f.operator} '${f.value.replace(/'/g, "''")}'`;
      }
      return `${f.column} ${f.operator} ${f.value}`;
    });
    whereClause = `WHERE ${conditions.join(' AND ')} `;
  }

  // 1. Top N per group
  if (plan.intent === 'top_n_per_group' && plan.partition_by && plan.partition_by.length > 0) {
    const partCol = plan.partition_by[0];
    const itemCol = plan.item_entity || plan.dimensions.find((d) => d !== partCol) || 'item';
    const metricCol = plan.metric || 'quantity';
    const agg = plan.aggregation || 'SUM';
    const dir = plan.ranking_direction || 'DESC';
    const limit = plan.limit || 1;

    return `WITH ranked_items AS (
  SELECT 
    ${partCol}, 
    ${itemCol}, 
    ${agg}(${metricCol}) AS total_${metricCol},
    ROW_NUMBER() OVER (PARTITION BY ${partCol} ORDER BY ${agg}(${metricCol}) ${dir}) AS rank
  FROM ${table}
  ${whereClause}GROUP BY ${partCol}, ${itemCol}
)
SELECT ${partCol}, ${itemCol}, total_${metricCol}
FROM ranked_items
WHERE rank <= ${limit}
ORDER BY total_${metricCol} DESC`;
  }

  // 2. Ranking
  if (plan.intent === 'ranking' || (plan.limit && plan.limit > 0 && plan.intent !== 'filter_lookup')) {
    const itemCol = plan.item_entity || (plan.dimensions.length > 0 ? plan.dimensions[0] : 'item');
    const metricCol = plan.metric || 'sales';
    const agg = plan.aggregation || 'SUM';
    const dir = plan.ranking_direction || 'DESC';
    const limit = plan.limit || 5;

    return `SELECT ${itemCol}, ROUND(${agg}(${metricCol}), 2) AS total_${metricCol}
FROM ${table}
${whereClause}GROUP BY ${itemCol}
ORDER BY total_${metricCol} ${dir}
LIMIT ${limit}`;
  }

  // 3. Aggregate by dimension
  if (plan.intent === 'aggregate_by_dimension' || plan.dimensions.length > 0) {
    const dims = plan.dimensions.join(', ');
    const metricCol = plan.metric || 'sales';
    const agg = plan.aggregation || 'SUM';

    return `SELECT ${dims}, COUNT(*) AS row_count, ROUND(${agg}(${metricCol}), 2) AS total_${metricCol}
FROM ${table}
${whereClause}GROUP BY ${dims}
ORDER BY total_${metricCol} DESC`;
  }

  // 4. Default overview / filter lookup
  return `SELECT * FROM ${table} ${whereClause}LIMIT 10`;
}
