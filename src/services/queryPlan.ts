export type QueryIntentType =
  | 'top_n_per_group'        // e.g. "most sold product in each region", "top 2 customers per industry"
  | 'aggregate_by_dimension' // e.g. "sales by region", "average mrr by plan tier"
  | 'ranking'                // e.g. "top 5 products by profit overall"
  | 'comparison'             // e.g. "compare technology vs furniture"
  | 'filter_lookup'          // e.g. "orders with discount > 15% and negative profit"
  | 'distribution'           // e.g. "breakdown of churn status"
  | 'time_trend'             // e.g. "monthly sales trend"
  | 'overview';              // e.g. "first 10 rows", "summary"

export interface QueryPlanFilter {
  column: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'IN' | 'LIKE' | 'IS NULL' | 'IS NOT NULL';
  value: any;
}

export interface QueryPlan {
  intent: QueryIntentType;
  partition_by?: string[];     // Dimensions to partition by (e.g. ['region'] for "in each region")
  item_entity?: string;        // Entity being ranked within partition (e.g. 'product')
  dimensions: string[];        // Dimensions to group by
  metric?: string;             // Numerical column to aggregate (e.g. 'quantity', 'sales', 'profit', 'mrr')
  aggregation?: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX' | 'COUNT_DISTINCT';
  ranking_direction?: 'DESC' | 'ASC';
  limit?: number;              // Limit for ranking (e.g. 1 for "most sold" / "top", 5 for "top 5")
  scope?: 'each_group' | 'overall'; // 'each_group' if per-partition, 'overall' otherwise
  filters?: QueryPlanFilter[];
  time_grain?: 'day' | 'week' | 'month' | 'quarter' | 'year' | null;
  explanation: string;
}

/**
 * Checks if question language strongly implies a partition-level ranking.
 * E.g. "most sold product in each region", "highest revenue client per vertical".
 */
export function hasPerGroupRankingLanguage(question: string): boolean {
  const q = question.toLowerCase();
  const hasRankingWord = /\b(most|top|highest|greatest|best|lowest|least|bottom|first|leader|winner)\b/.test(q);
  const hasPerGroupWord = /\b(in each|in every|for each|for every|per|by each|across each)\b/.test(q);

  if (hasRankingWord && hasPerGroupWord) {
    return true;
  }

  // Pattern: "top-selling item by region", "most sold product by territory", etc.
  const hasRankItemByGroup = /\b(top|most|highest|greatest|best)\b.*?\b(by|across)\s+(region|territory|geography|category|industry|tier|group|vertical|department|zone|country|area)\b/.test(q);
  if (hasRankItemByGroup) {
    return true;
  }

  return false;
}

/**
 * Safely parses and normalizes a QueryPlan from raw LLM JSON.
 */
export function parseQueryPlan(raw: any, defaultExplanation = 'Analytical execution plan'): QueryPlan {
  if (!raw || typeof raw !== 'object') {
    return {
      intent: 'overview',
      dimensions: [],
      explanation: defaultExplanation,
    };
  }

  const validIntents: QueryIntentType[] = [
    'top_n_per_group',
    'aggregate_by_dimension',
    'ranking',
    'comparison',
    'filter_lookup',
    'distribution',
    'time_trend',
    'overview',
  ];

  let intent: QueryIntentType = validIntents.includes(raw.intent) ? raw.intent : 'overview';

  // Normalize partition_by
  let partition_by: string[] | undefined;
  if (Array.isArray(raw.partition_by)) {
    partition_by = raw.partition_by.map((p: any) => String(p).trim().toLowerCase()).filter(Boolean);
  } else if (typeof raw.partition_by === 'string' && raw.partition_by.trim()) {
    partition_by = [raw.partition_by.trim().toLowerCase()];
  }

  // Normalize dimensions
  let dimensions: string[] = [];
  if (Array.isArray(raw.dimensions)) {
    dimensions = raw.dimensions.map((d: any) => String(d).trim().toLowerCase()).filter(Boolean);
  } else if (typeof raw.dimensions === 'string' && raw.dimensions.trim()) {
    dimensions = [raw.dimensions.trim().toLowerCase()];
  }

  // If partition_by is defined and intent is not top_n_per_group, check if it should be
  if (partition_by && partition_by.length > 0 && (raw.scope === 'each_group' || raw.item_entity)) {
    intent = 'top_n_per_group';
  }

  const item_entity = raw.item_entity ? String(raw.item_entity).trim().toLowerCase() : undefined;
  const metric = raw.metric ? String(raw.metric).trim().toLowerCase() : undefined;
  const aggregation = ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'COUNT_DISTINCT'].includes(
    String(raw.aggregation).toUpperCase()
  )
    ? (String(raw.aggregation).toUpperCase() as any)
    : 'SUM';
  const ranking_direction = String(raw.ranking_direction).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const limit = typeof raw.limit === 'number' && raw.limit > 0 ? raw.limit : undefined;
  const scope = raw.scope === 'each_group' ? 'each_group' : 'overall';

  const filters: QueryPlanFilter[] = Array.isArray(raw.filters)
    ? raw.filters
        .filter((f: any) => f && f.column)
        .map((f: any) => ({
          column: String(f.column).trim().toLowerCase(),
          operator: f.operator || '=',
          value: f.value,
        }))
    : [];

  return {
    intent,
    partition_by,
    item_entity,
    dimensions,
    metric,
    aggregation,
    ranking_direction,
    limit,
    scope,
    filters,
    time_grain: raw.time_grain || null,
    explanation: raw.explanation || defaultExplanation,
  };
}

/**
 * Produces a clear, readable summary string of the QueryPlan for reasoning traces.
 */
export function formatQueryPlanSummary(plan: QueryPlan): string {
  switch (plan.intent) {
    case 'top_n_per_group':
      return `Grouped Ranking: Top ${plan.limit || 1} ${plan.item_entity || 'item'} in each ${
        plan.partition_by?.join(', ') || 'group'
      } ordered by ${plan.aggregation || 'SUM'}(${plan.metric || 'metric'}) ${plan.ranking_direction || 'DESC'}`;
    case 'ranking':
      return `Global Ranking: Top ${plan.limit || 5} ${plan.dimensions.join(', ') || 'items'} ordered by ${
        plan.aggregation || 'SUM'
      }(${plan.metric || 'metric'}) ${plan.ranking_direction || 'DESC'}`;
    case 'aggregate_by_dimension':
      return `Aggregation: ${plan.aggregation || 'SUM'}(${plan.metric || 'metric'}) grouped by ${plan.dimensions.join(', ')}`;
    case 'filter_lookup':
      return `Filtered Query: Filter dataset on ${plan.filters?.map((f) => `${f.column} ${f.operator} ${f.value}`).join(' AND ') || 'conditions'}`;
    case 'distribution':
      return `Distribution: Count & share across ${plan.dimensions.join(', ')}`;
    case 'time_trend':
      return `Time Series Trend: ${plan.aggregation || 'SUM'}(${plan.metric || 'metric'}) over time (${plan.time_grain || 'date'})`;
    case 'overview':
    default:
      return plan.explanation || 'Dataset sample overview';
  }
}
