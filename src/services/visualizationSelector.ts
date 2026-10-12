import { ChartSuggestion } from '../types';
import { QueryPlan } from './queryPlan';
import { SemanticSchema } from './schemaProfiler';

/**
 * Validates whether a ChartSuggestion is technically and semantically sound
 * for a given query result set and query plan.
 */
export function validateChartSuggestion(
  suggestion: ChartSuggestion | undefined,
  rows: Record<string, any>[],
  columns: string[],
  plan: QueryPlan,
  schema: SemanticSchema
): { valid: boolean; reason?: string } {
  if (!suggestion) {
    return { valid: false, reason: 'No chart suggestion provided.' };
  }

  if (!rows || rows.length === 0 || !columns || columns.length === 0) {
    return { valid: false, reason: 'Cannot render chart on empty result set.' };
  }

  const lowerCols = columns.map((c) => c.toLowerCase());
  const xKeyLower = suggestion.xAxisKey.toLowerCase();
  const yKeyLower = suggestion.yAxisKey.toLowerCase();

  const actualXKey = columns.find((c) => c.toLowerCase() === xKeyLower);
  const actualYKey = columns.find((c) => c.toLowerCase() === yKeyLower);

  if (!actualXKey) {
    return { valid: false, reason: `X-axis column "${suggestion.xAxisKey}" not present in result columns.` };
  }

  if (!actualYKey) {
    return { valid: false, reason: `Y-axis column "${suggestion.yAxisKey}" not present in result columns.` };
  }

  // Ensure Y-axis is numeric
  const hasNumericValues = rows.some((r) => {
    const val = r[actualYKey];
    return typeof val === 'number' && !isNaN(val);
  });

  if (!hasNumericValues) {
    return { valid: false, reason: `Y-axis column "${suggestion.yAxisKey}" does not contain numeric data.` };
  }

  // Donut chart validation
  if (suggestion.type === 'donut') {
    // Donut charts should not be used for raw record lookup where multiple rows share the same category label
    const rawCategories = rows.map((r) => String(r[actualXKey] ?? ''));
    const uniqueCategories = new Set(rawCategories);

    if (uniqueCategories.size < 2) {
      return { valid: false, reason: 'Donut chart requires at least 2 distinct categories to show distribution.' };
    }

    if (uniqueCategories.size > 8) {
      return { valid: false, reason: `Too many categories (${uniqueCategories.size}) for readable donut chart. Use a bar chart instead.` };
    }

    // Check if there are duplicate category rows without aggregation
    if (rawCategories.length > uniqueCategories.size && plan.intent === 'filter_lookup') {
      return {
        valid: false,
        reason: 'Donut chart cannot be used on raw unaggregated records with duplicate category labels.',
      };
    }

    // Ensure values are non-negative for pie/donut
    const hasNegative = rows.some((r) => typeof r[actualYKey] === 'number' && r[actualYKey] < 0);
    if (hasNegative) {
      return { valid: false, reason: 'Donut chart cannot display negative values.' };
    }
  }

  return { valid: true };
}

/**
 * Deterministic Visualization Selector.
 * Determines the optimal chart representation based on:
 * - Analytical intent (QueryPlan)
 * - Actual result columns & data types
 * - Result cardinality
 * - Category uniqueness
 */
export function selectDeterministicVisualization(
  question: string,
  plan: QueryPlan,
  rows: Record<string, any>[],
  columns: string[],
  schema: SemanticSchema,
  candidateSuggestion?: ChartSuggestion
): ChartSuggestion | undefined {
  if (!rows || rows.length === 0 || !columns || columns.length === 0) {
    return undefined;
  }

  const lowerQ = question.toLowerCase();

  // Find candidate numeric and categorical columns from the actual returned rows
  const numericCols = columns.filter((col) => {
    return rows.some((r) => typeof r[col] === 'number' && !isNaN(r[col]));
  });

  const categoricalCols = columns.filter((col) => {
    return !numericCols.includes(col);
  });

  // Rule D: Raw records lookup (e.g. "List all customers...", "Which customers are At-Risk...")
  // A table must be primary. Do NOT show misleading charts for raw records unless explicitly aggregated.
  if (plan.intent === 'filter_lookup') {
    // If it's a raw records query with multiple identifier/entity columns and detail rows,
    // table is primary.
    const isDetailQuestion =
      lowerQ.includes('which customer') ||
      lowerQ.includes('list all') ||
      lowerQ.includes('show all') ||
      lowerQ.includes('which order') ||
      lowerQ.includes('find all');

    if (isDetailQuestion) {
      return undefined; // Table is primary!
    }
  }

  // Check if candidate suggestion from LLM is valid and appropriate
  if (candidateSuggestion) {
    const candidateValidation = validateChartSuggestion(
      candidateSuggestion,
      rows,
      columns,
      plan,
      schema
    );

    if (candidateValidation.valid) {
      // Validate that candidate title is aligned with actual columns
      return {
        ...candidateSuggestion,
        xAxisKey: columns.find((c) => c.toLowerCase() === candidateSuggestion.xAxisKey.toLowerCase()) || candidateSuggestion.xAxisKey,
        yAxisKey: columns.find((c) => c.toLowerCase() === candidateSuggestion.yAxisKey.toLowerCase()) || candidateSuggestion.yAxisKey,
        isAggregated: plan.intent === 'aggregate_by_dimension' || plan.intent === 'distribution',
      };
    }
  }

  if (numericCols.length === 0) {
    return undefined; // No numeric measures to chart
  }

  // Primary measure (e.g. mrr, total_sales, quantity, or first numeric)
  const primaryMeasure =
    numericCols.find((c) => {
      const cl = c.toLowerCase();
      if (plan.metric && cl.includes(plan.metric.toLowerCase())) return true;
      return cl.startsWith('total_') || cl.startsWith('sum_') || cl.includes('mrr') || cl.includes('sales') || cl.includes('profit');
    }) || numericCols[0];

  // Primary dimension/entity
  const primaryDimension =
    categoricalCols.find((c) => {
      const cl = c.toLowerCase();
      if (plan.partition_by && plan.partition_by.some((p: string) => cl === p.toLowerCase())) return true;
      if (plan.dimensions.some((d: string) => cl === d.toLowerCase())) return true;
      if (plan.item_entity && cl.includes(plan.item_entity.toLowerCase())) return true;
      return false;
    }) || categoricalCols[0] || columns[0];

  // Check unique values of primary dimension
  const uniqueDimensionVals = new Set(rows.map((r) => r[primaryDimension]));

  // Rule C: Time-series analysis
  const dateCol = categoricalCols.find((c) => {
    const cl = c.toLowerCase();
    return cl.includes('date') || cl.includes('month') || cl.includes('year') || cl.includes('day') || cl.includes('quarter');
  });

  if (plan.intent === 'time_trend' || (dateCol && (lowerQ.includes('trend') || lowerQ.includes('monthly') || lowerQ.includes('over time')))) {
    const timeX = dateCol || primaryDimension;
    return {
      type: 'line',
      xAxisKey: timeX,
      yAxisKey: primaryMeasure,
      title: `${formatHeaderName(primaryMeasure)} Trend over ${formatHeaderName(timeX)}`,
      categoryLabel: formatHeaderName(timeX),
      metricLabel: formatHeaderName(primaryMeasure),
      isAggregated: true,
    };
  }

  // Rule A: Ranked Entities (e.g. "Top 5 customers by MRR", "Top 5 products")
  if (plan.intent === 'ranking' || (plan.limit && plan.limit <= 15 && plan.intent !== 'filter_lookup')) {
    const entityCol =
      categoricalCols.find((c) => {
        const cl = c.toLowerCase();
        return cl.includes('name') || cl.includes('company') || cl.includes('product') || cl.includes('customer') || cl.includes('item');
      }) || primaryDimension;

    return {
      type: 'horizontal_bar',
      xAxisKey: entityCol,
      yAxisKey: primaryMeasure,
      title: `Top ${Math.min(rows.length, plan.limit || rows.length)} ${formatHeaderName(entityCol)} by ${formatHeaderName(primaryMeasure)}`,
      categoryLabel: formatHeaderName(entityCol),
      metricLabel: formatHeaderName(primaryMeasure),
      isAggregated: false,
    };
  }

  // Rule B & E: Metric grouped by Category or Distribution
  if (plan.intent === 'aggregate_by_dimension' || plan.intent === 'distribution') {
    const isComposition =
      (lowerQ.includes('breakdown') || lowerQ.includes('distribution') || lowerQ.includes('share') || lowerQ.includes('composition')) &&
      uniqueDimensionVals.size >= 2 &&
      uniqueDimensionVals.size <= 7 &&
      rows.every((r) => typeof r[primaryMeasure] === 'number' && r[primaryMeasure] >= 0);

    if (isComposition && uniqueDimensionVals.size === rows.length) {
      // 1 row per unique category -> perfect for Donut chart
      return {
        type: 'donut',
        xAxisKey: primaryDimension,
        yAxisKey: primaryMeasure,
        title: `${formatHeaderName(primaryMeasure)} Distribution by ${formatHeaderName(primaryDimension)}`,
        categoryLabel: formatHeaderName(primaryDimension),
        metricLabel: formatHeaderName(primaryMeasure),
        isAggregated: true,
      };
    }

    // Otherwise standard Bar comparison
    return {
      type: 'bar',
      xAxisKey: primaryDimension,
      yAxisKey: primaryMeasure,
      title: `${formatHeaderName(primaryMeasure)} by ${formatHeaderName(primaryDimension)}`,
      categoryLabel: formatHeaderName(primaryDimension),
      metricLabel: formatHeaderName(primaryMeasure),
      isAggregated: true,
    };
  }

  // Rule: Top N per group (e.g. "most sold product in each region")
  if (plan.intent === 'top_n_per_group' && plan.partition_by && plan.partition_by.length > 0) {
    const partCol = columns.find((c) => c.toLowerCase() === plan.partition_by![0].toLowerCase()) || primaryDimension;
    return {
      type: 'bar',
      xAxisKey: partCol,
      yAxisKey: primaryMeasure,
      title: `Leading ${formatHeaderName(plan.item_entity || 'Item')} in Each ${formatHeaderName(partCol)} (${formatHeaderName(primaryMeasure)})`,
      categoryLabel: formatHeaderName(partCol),
      metricLabel: formatHeaderName(primaryMeasure),
      isAggregated: true,
    };
  }

  // Fallback: If clean categorical key and numeric key exist and cardinality is reasonable (<= 15)
  if (rows.length <= 15 && uniqueDimensionVals.size === rows.length) {
    return {
      type: 'bar',
      xAxisKey: primaryDimension,
      yAxisKey: primaryMeasure,
      title: `${formatHeaderName(primaryMeasure)} by ${formatHeaderName(primaryDimension)}`,
      categoryLabel: formatHeaderName(primaryDimension),
      metricLabel: formatHeaderName(primaryMeasure),
      isAggregated: false,
    };
  }

  return undefined;
}

function formatHeaderName(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bMrr\b/i, 'MRR')
    .replace(/\bNps\b/i, 'NPS')
    .replace(/\bSku\b/i, 'SKU')
    .replace(/\bId\b/i, 'ID');
}
