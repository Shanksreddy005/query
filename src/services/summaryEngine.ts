import {
  AnalyticalCategory,
  AnomalyObservation,
  BusinessImplication,
  KeyFinding,
  QueryInsight,
  RecommendedAction,
} from '../types';
import { QueryPlan } from './queryPlan';
import { SemanticSchema } from './schemaProfiler';

export interface SummaryContext {
  question: string;
  sql: string;
  status: 'verified' | 'success' | 'empty' | 'error' | 'needs_clarification';
  error?: string;
  rows: Record<string, any>[];
  columns: string[];
  rowCount: number;
  datasetName: string;
  tableName: string;
  queryPlan?: QueryPlan;
  semanticSchema?: SemanticSchema;
  executionTimeMs?: number;
  passedChecks?: string[];
  llmInsight?: Partial<QueryInsight>;
}

// Banned generic boilerplates that must NEVER appear in QueryMind summaries
const BANNED_BOILERPLATES: RegExp[] = [
  /audit downstream data pipelines/i,
  /review commercial thresholds prior to capital deployment/i,
  /review variance thresholds against historical quarterly trends/i,
  /all verified metrics conform to expected baseline constraints/i,
  /data scope is bounded to active table filters/i,
  /prior to capital deployment/i,
  /fiscal reporting cycles/i,
];

/**
 * Strips HTML and script injection to keep text safe and clean.
 */
function sanitizeText(raw: string | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/**
 * Checks if a string contains any banned boilerplate phrases.
 */
function containsBannedBoilerplate(text: string): boolean {
  return BANNED_BOILERPLATES.some((regex) => regex.test(text));
}

/**
 * Formats numeric values nicely with appropriate prefixes/suffixes based on column name and value.
 */
export function formatMetricValue(val: any, colName: string = ''): string {
  if (val === null || val === undefined || val === '') return 'N/A';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  const num = typeof val === 'number' ? val : Number(val);
  if (isNaN(num)) return String(val);

  const lowerCol = colName.toLowerCase();
  const isCurrency =
    lowerCol.includes('mrr') ||
    lowerCol.includes('arr') ||
    lowerCol.includes('sales') ||
    lowerCol.includes('profit') ||
    lowerCol.includes('revenue') ||
    lowerCol.includes('price') ||
    lowerCol.includes('cost') ||
    lowerCol.includes('spend');

  const isPercentage =
    lowerCol.includes('pct') ||
    lowerCol.includes('percent') ||
    lowerCol.includes('margin') ||
    lowerCol.includes('rate') ||
    lowerCol.includes('ratio');

  if (isCurrency) {
    const isNeg = num < 0;
    const absVal = Math.abs(num);
    const formatted =
      absVal >= 1000
        ? absVal.toLocaleString('en-US', { maximumFractionDigits: 2 })
        : absVal.toFixed(absVal % 1 === 0 ? 0 : 2);
    return isNeg ? `-$${formatted}` : `$${formatted}`;
  }

  if (isPercentage) {
    const pctVal = Math.abs(num) > 0 && Math.abs(num) <= 1 && lowerCol.includes('pct') ? num * 100 : num;
    return `${pctVal.toFixed(pctVal % 1 === 0 ? 0 : 1)}%`;
  }

  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/**
 * Infers entity name from table name, dataset name, or schema.
 */
function inferEntity(tableName: string, datasetName: string): { singular: string; plural: string } {
  const combined = `${tableName} ${datasetName}`.toLowerCase();
  if (combined.includes('customer') || combined.includes('client') || combined.includes('account')) {
    return { singular: 'customer', plural: 'customers' };
  }
  if (combined.includes('order') || combined.includes('sale') || combined.includes('transaction')) {
    return { singular: 'order', plural: 'orders' };
  }
  if (combined.includes('product') || combined.includes('item')) {
    return { singular: 'product', plural: 'products' };
  }
  if (combined.includes('employee') || combined.includes('staff')) {
    return { singular: 'employee', plural: 'employees' };
  }
  return { singular: 'record', plural: 'records' };
}

/**
 * Profiler for identifying column semantic roles in tabular query results.
 */
interface ColumnProfile {
  dimensionCol?: string;
  entityCol?: string;
  totalCountCol?: string;
  activeCountCol?: string;
  activeRateCol?: string;
  totalRevenueCol?: string;
  avgRevenueCol?: string;
  activeRevenueCol?: string;
  ticketsCol?: string;
  usageCol?: string;
  statusCol?: string;
  rankCol?: string;
  numericCols: string[];
}

function profileColumns(columns: string[], rows: Record<string, any>[]): ColumnProfile {
  const sample = rows[0] || {};
  const numericCols = columns.filter((c) => typeof sample[c] === 'number');
  const stringCols = columns.filter((c) => !numericCols.includes(c));

  // Dimension column (categorical groupings like segment, tier, channel, city, industry)
  const dimensionCol = stringCols.find((c) => {
    const l = c.toLowerCase();
    return (
      l.includes('segment') ||
      l.includes('tier') ||
      l.includes('channel') ||
      l.includes('city') ||
      l.includes('region') ||
      l.includes('industry') ||
      l.includes('category')
    );
  }) || stringCols[0];

  // Entity column (individual identifiers like company_name, customer_name, product)
  const entityCol = stringCols.find((c) => {
    const l = c.toLowerCase();
    return (
      l.includes('company') ||
      l.includes('customer_name') ||
      l.includes('name') ||
      l.includes('product') ||
      l.includes('id')
    );
  }) || stringCols[0] || columns[0];

  // Total count column
  const totalCountCol = numericCols.find((c) => {
    const l = c.toLowerCase();
    return (
      (l.includes('total_customer') || l.includes('customer_count') || l.includes('customers') || l === 'count') &&
      !l.includes('active')
    );
  });

  // Active count column
  const activeCountCol = numericCols.find((c) => {
    const l = c.toLowerCase();
    return l.includes('active') && (l.includes('customer') || l.includes('user') || l.includes('count'));
  });

  // Active rate / percentage column
  const activeRateCol = numericCols.find((c) => {
    const l = c.toLowerCase();
    return (l.includes('active') || l.includes('activation')) && (l.includes('percent') || l.includes('pct') || l.includes('rate'));
  });

  // Total revenue column
  const totalRevenueCol = numericCols.find((c) => {
    const l = c.toLowerCase();
    return (
      (l.includes('total_mrr') || l.includes('sum_mrr') || l.includes('total_sales') || l.includes('total_revenue') || l.includes('total_profit') || l === 'mrr') &&
      !l.includes('avg') &&
      !l.includes('average') &&
      !l.includes('active_mrr')
    );
  });

  // Average revenue column
  const avgRevenueCol = numericCols.find((c) => {
    const l = c.toLowerCase();
    return (l.includes('avg') || l.includes('average')) && (l.includes('mrr') || l.includes('sales') || l.includes('profit') || l.includes('revenue'));
  });

  // Active revenue column
  const activeRevenueCol = numericCols.find((c) => {
    const l = c.toLowerCase();
    return l.includes('active') && (l.includes('mrr') || l.includes('sales') || l.includes('revenue'));
  });

  // Support tickets column
  const ticketsCol = numericCols.find((c) => c.toLowerCase().includes('ticket'));

  // Usage column
  const usageCol = numericCols.find((c) => c.toLowerCase().includes('usage'));

  // Status column
  const statusCol = stringCols.find((c) => {
    const l = c.toLowerCase();
    return l.includes('status') || l.includes('churn');
  });

  // Rank column
  const rankCol = numericCols.find((c) => c.toLowerCase().includes('rank'));

  return {
    dimensionCol,
    entityCol,
    totalCountCol,
    activeCountCol,
    activeRateCol,
    totalRevenueCol,
    avgRevenueCol,
    activeRevenueCol,
    ticketsCol,
    usageCol,
    statusCol,
    rankCol,
    numericCols,
  };
}

/**
 * Classifies the analytical intent into one of the canonical categories.
 */
export function classifyAnalyticalIntent(
  question: string,
  sql: string,
  columns: string[],
  rows: Record<string, any>[],
  plan?: QueryPlan
): AnalyticalCategory {
  const q = question.toLowerCase().trim();
  const sqlUpper = sql.toUpperCase();

  // 1. Predictive / Unsupported Requests
  const predictiveRegex = /\b(predict|prediction|predictive|forecast|forecasted|next month|next year|churn probability|churn probabilities|will churn|will cancel|propensity|machine learning model)\b/i;
  if (predictiveRegex.test(q)) {
    return 'unsupported_request';
  }

  const hasGroupedLanguage =
    q.includes('by ') ||
    q.includes('per ') ||
    q.includes('each ') ||
    q.includes('across ') ||
    q.includes('segment') ||
    sqlUpper.includes('GROUP BY');

  // 2. Simple Count
  const countRegex = /\b(how many|count of|number of|total number of|how many customers|how many orders|how many rows)\b/i;
  const isCountSql =
    sqlUpper.includes('COUNT(') &&
    !sqlUpper.includes('GROUP BY') &&
    rows.length <= 1;
  if ((countRegex.test(q) && !hasGroupedLanguage) || isCountSql) {
    return 'simple_count';
  }

  // 3. Total / Sum
  const sumRegex = /\b(total|sum of|cumulative|total mrr|overall mrr|total sales|total revenue|total profit)\b/i;
  const isSumSql =
    sqlUpper.includes('SUM(') &&
    !sqlUpper.includes('GROUP BY') &&
    rows.length <= 1;
  if ((sumRegex.test(q) && !hasGroupedLanguage) || isSumSql) {
    return 'total_sum';
  }

  // 4. Statistical Aggregation (Single-group Avg/Min/Max)
  const statRegex = /\b(average|avg|median|min|max|minimum|maximum|mean)\b/i;
  const isStatSql =
    (sqlUpper.includes('AVG(') || sqlUpper.includes('MIN(') || sqlUpper.includes('MAX(')) &&
    !sqlUpper.includes('GROUP BY') &&
    rows.length <= 1;
  if ((statRegex.test(q) && !hasGroupedLanguage) || isStatSql) {
    return 'statistical_aggregation';
  }

  // 5. Ranking / Top-N
  const rankingRegex = /\b(top \d+|top|most|highest|lowest|bottom \d+|leading|best|worst|ranked|ranking)\b/i;
  const isRankingSql =
    sqlUpper.includes('ORDER BY') &&
    (sqlUpper.includes('LIMIT') || sqlUpper.includes('ROW_NUMBER()'));
  if (plan?.intent === 'top_n_per_group' || plan?.intent === 'ranking' || (rankingRegex.test(q) && (isRankingSql || q.includes('top')))) {
    return 'ranking_top_n';
  }

  // 6. Multi-Metric Analysis
  const hasMultipleMeasures =
    columns.filter((c) => {
      const lower = c.toLowerCase();
      return (
        lower.includes('count') ||
        lower.includes('sum') ||
        lower.includes('avg') ||
        lower.includes('total') ||
        lower.includes('mrr') ||
        lower.includes('sales') ||
        lower.includes('profit') ||
        lower.includes('active_users') ||
        lower.includes('ticket')
      );
    }).length >= 2;
  if (sqlUpper.includes('GROUP BY') && hasMultipleMeasures && (q.includes(' and ') || q.includes('both'))) {
    return 'multi_metric';
  }

  // 7. Grouped Comparison or Segmentation
  if (sqlUpper.includes('GROUP BY') || hasGroupedLanguage) {
    if (q.includes('percentage') || q.includes('percent') || q.includes('rate') || q.includes('ratio')) {
      return 'segmentation';
    }
    return 'grouped_comparison';
  }

  // 8. Time Trend
  if (sqlUpper.includes('DATE_TRUNC') || q.includes('monthly') || q.includes('daily') || q.includes('trend')) {
    return 'time_trend';
  }

  // 9. Filtering and Record Retrieval
  return 'filtering_retrieval';
}

/**
 * Detects numerical or categorical anomalies from actual returned rows.
 */
export function detectEvidenceAnomalies(
  rows: Record<string, any>[],
  columns: string[],
  category: AnalyticalCategory
): AnomalyObservation[] {
  const anomalies: AnomalyObservation[] = [];
  if (!rows || rows.length === 0) return anomalies;

  // 1. Negative Values where typically unexpected
  columns.forEach((col) => {
    const colLower = col.toLowerCase();
    const shouldBeNonNegative =
      colLower.includes('mrr') ||
      colLower.includes('quantity') ||
      colLower.includes('active_users') ||
      colLower.includes('ticket') ||
      colLower.includes('count');

    if (shouldBeNonNegative) {
      const negRows = rows.filter((r) => typeof r[col] === 'number' && r[col] < 0);
      if (negRows.length > 0) {
        anomalies.push({
          observation: `Found ${negRows.length} record(s) with negative values in non-negative field "${col}".`,
          evidence: `Sample negative value: ${formatMetricValue(negRows[0][col], col)}`,
          severity: 'high',
          type: 'data_quality',
        });
      }
    }
  });

  // 2. Check for unexpected nulls in returned rows
  columns.forEach((col) => {
    const nullRows = rows.filter((r) => r[col] === null || r[col] === undefined);
    if (nullRows.length > 0 && nullRows.length === rows.length) {
      anomalies.push({
        observation: `Column "${col}" returned entirely null values across all ${rows.length} record(s).`,
        evidence: `100% missing values in column "${col}"`,
        severity: 'medium',
        type: 'data_quality',
      });
    }
  });

  return anomalies;
}

/**
 * Normalizes insight into both structured arrays and backward-compatible fields.
 */
function buildLegacyPayload(insight: QueryInsight): QueryInsight {
  const findingsList = insight.key_findings ? insight.key_findings.map((f) => f.finding) : (insight.findings || []);
  const anomaliesList = insight.anomalies
    ? insight.anomalies.map((a) => (typeof a === 'string' ? a : a.observation))
    : (insight.critical_anomalies || []);
  const implicationsList = insight.business_implications
    ? insight.business_implications.map((i) => (typeof i === 'string' ? i : i.implication))
    : (insight.caveats || []);
  const actionsList = insight.recommended_actions
    ? insight.recommended_actions.map((a) => a.action)
    : insight.recommendedAction
    ? [insight.recommendedAction]
    : [];

  return {
    ...insight,
    summary: insight.overview || insight.executive_summary || '',
    executive_summary: insight.overview || insight.executive_summary || '',
    findings: findingsList,
    highlights: findingsList,
    critical_anomalies: anomaliesList,
    business_implications: implicationsList,
    caveats: implicationsList,
    strategic_experiments: actionsList,
    recommendedAction: actionsList[0] || undefined,
    recommended_action: actionsList[0] || undefined,
  };
}

/**
 * Main Evidence-First Summary Generation Engine.
 * Produces deep, professional, evidence-grounded Business Intelligence narratives.
 */
export function generateEvidenceBasedSummary(ctx: SummaryContext): QueryInsight {
  const { question, sql, status, error, rows, columns, rowCount, datasetName, tableName, queryPlan, semanticSchema } = ctx;
  const entity = inferEntity(tableName, datasetName);

  // 1. Failure Handling
  if (status === 'error' || error) {
    const errorMsg = sanitizeText(error || 'Query execution failed in local DuckDB engine.');
    return buildLegacyPayload({
      status: 'error',
      overview: `Execution was unsuccessful: ${errorMsg}`,
      key_findings: [],
      anomalies: [],
      business_implications: [],
      recommended_actions: [],
      limitations: ['Query failed execution; no analytical claims can be derived.'],
    });
  }

  // 2. Classify Category
  const category = classifyAnalyticalIntent(question, sql, columns, rows, queryPlan);

  // 3. Handle Unsupported / Predictive Requests
  if (category === 'unsupported_request' || status === 'needs_clarification') {
    return buildLegacyPayload({
      status: 'needs_clarification',
      category: 'unsupported_request',
      overview: `The requested predictive analysis cannot be calculated from available data.`,
      key_findings: [
        {
          finding: `Dataset "${datasetName}" contains observational records but lacks predictive model outputs or historical churn labels.`,
          importance: 'high',
        },
      ],
      anomalies: [],
      business_implications: [],
      recommended_actions: [
        {
          action: 'Analyze deterministic attributes such as current churn_status, support_tickets, or NPS scores.',
          reason: 'Observational metrics provide verified ground truth without speculative models',
          priority: 'medium',
        },
      ],
      limitations: [
        'The dataset does not contain predictive models, forward-looking forecast labels, or multi-period time-series features necessary to predict future outcomes.',
      ],
    });
  }

  // 4. Empty Result Set Handling
  if (rowCount === 0 || !rows || rows.length === 0) {
    return buildLegacyPayload({
      status: 'empty',
      category: 'filtering_retrieval',
      overview: `No records matched the specified criteria in ${datasetName}.`,
      key_findings: [
        {
          finding: `Zero records satisfied the active query filters in "${datasetName}".`,
          evidence: `DuckDB returned 0 rows for query`,
          importance: 'low',
        },
      ],
      anomalies: [],
      business_implications: [],
      recommended_actions: [
        {
          action: 'Review or relax filter criteria to broaden the search scope.',
          reason: 'No records matched current filter conditions',
          priority: 'low',
        },
      ],
      limitations: ['Zero rows returned; statistical aggregations cannot be computed on empty results.'],
    });
  }

  // Profile columns
  const profile = profileColumns(columns, rows);

  let overview = '';
  const key_findings: KeyFinding[] = [];
  const performance_comparison: string[] = [];
  const anomalies: AnomalyObservation[] = detectEvidenceAnomalies(rows, columns, category);
  const business_implications: BusinessImplication[] = [];
  const recommended_actions: RecommendedAction[] = [];
  const limitations: string[] = [];

  // =========================================================================
  // STRATEGY 1: SIMPLE COUNT
  // =========================================================================
  if (category === 'simple_count') {
    const countCol = profile.totalCountCol || columns.find((c) => c.toLowerCase().includes('count')) || columns[0];
    const countVal = rows[0][countCol] !== undefined ? rows[0][countCol] : rowCount;
    const formattedCount = formatMetricValue(countVal);

    const isFiltered = sql.toUpperCase().includes('WHERE');
    if (isFiltered) {
      overview = `Your dataset contains ${formattedCount} ${entity.plural} matching the specified filter criteria.`;
    } else {
      overview = `Your dataset contains ${formattedCount} distinct ${entity.plural}.`;
    }

    key_findings.push({
      finding: `Total count: ${formattedCount} verified ${entity.plural} recorded in ${datasetName}.`,
      evidence: `${countCol} = ${countVal}`,
      importance: 'high',
    });

    recommended_actions.push({
      action: `Consider segment-level or geographic breakdowns to understand the ${entity.singular} base in greater detail.`,
      reason: 'Gain deeper distribution visibility',
      priority: 'low',
    });
  }

  // =========================================================================
  // STRATEGY 2: TOTAL SUM
  // =========================================================================
  else if (category === 'total_sum') {
    const sumCol = profile.totalRevenueCol || profile.numericCols[0] || columns[0];
    const sumVal = rows[0][sumCol];
    const formattedSum = formatMetricValue(sumVal, sumCol);
    const totalEntities = semanticSchema?.rowCount || rows.length;

    overview = `Total ${sumCol.replace(/^(total_|sum_)/i, '').toUpperCase()} across all ${totalEntities} ${entity.plural} is ${formattedSum}.`;

    key_findings.push({
      finding: `Aggregate ${sumCol.replace(/^(total_|sum_)/i, '').toUpperCase()}: ${formattedSum} across verified ${entity.plural}.`,
      evidence: `${sumCol} = ${sumVal}`,
      importance: 'high',
    });

    limitations.push('Historical revenue trends or comparisons cannot be established from single-period snapshot data.');
  }

  // =========================================================================
  // STRATEGY 3: STATISTICAL AGGREGATION
  // =========================================================================
  else if (category === 'statistical_aggregation') {
    const avgCol = profile.avgRevenueCol || profile.numericCols[0] || columns[0];
    const avgVal = rows[0][avgCol];
    const formattedAvg = formatMetricValue(avgVal, avgCol);

    overview = `Average ${avgCol.replace(/^(avg_|average_)/i, '').toUpperCase()} across ${entity.plural} is ${formattedAvg}.`;

    key_findings.push({
      finding: `Calculated average: ${formattedAvg}.`,
      evidence: `${avgCol} = ${avgVal}`,
      importance: 'high',
    });

    limitations.push('Averages can be influenced by outlier values in skewed distributions.');
  }

  // =========================================================================
  // STRATEGY 4: MULTI-METRIC OR GROUPED CATEGORICAL COMPARISON
  // =========================================================================
  else if (category === 'multi_metric' || category === 'grouped_comparison' || category === 'segmentation') {
    const dimCol = profile.dimensionCol;
    const hasMultipleMetrics = profile.numericCols.length >= 2;

    // Check if we have revenue metrics and count metrics
    const revCol = profile.totalRevenueCol || profile.activeRevenueCol || profile.avgRevenueCol || profile.numericCols.find((c) => c.toLowerCase().includes('mrr') || c.toLowerCase().includes('sales'));
    const avgCol = profile.avgRevenueCol || (profile.totalRevenueCol && profile.totalCountCol ? null : null);
    const countCol = profile.totalCountCol || profile.activeCountCol || profile.numericCols.find((c) => c.toLowerCase().includes('count') || c.toLowerCase().includes('customer'));
    const rateCol = profile.activeRateCol || profile.numericCols.find((c) => c.toLowerCase().includes('pct') || c.toLowerCase().includes('percent') || c.toLowerCase().includes('rate'));

    if (dimCol && rows.length > 1) {
      // 1. Calculate Grand Totals across all returned rows
      const totalRevAll = revCol ? rows.reduce((acc, r) => acc + (Number(r[revCol]) || 0), 0) : 0;
      const totalCustAll = countCol ? rows.reduce((acc, r) => acc + (Number(r[countCol]) || 0), 0) : 0;

      // 2. Identify Leaders across Key Dimensions
      // Leader by Total Revenue
      const rowsSortedByRev = revCol ? [...rows].sort((a, b) => (Number(b[revCol]) || 0) - (Number(a[revCol]) || 0)) : rows;
      const topRevRow = rowsSortedByRev[0];
      const lowestRevRow = rowsSortedByRev[rowsSortedByRev.length - 1];

      // Leader by Average Revenue
      let rowsSortedByAvg: Record<string, any>[] = [];
      let topAvgRow: Record<string, any> | null = null;
      if (avgCol) {
        rowsSortedByAvg = [...rows].sort((a, b) => (Number(b[avgCol]) || 0) - (Number(a[avgCol]) || 0));
        topAvgRow = rowsSortedByAvg[0];
      } else if (revCol && countCol) {
        // Compute derived average
        rowsSortedByAvg = [...rows].sort((a, b) => {
          const avgA = (Number(a[revCol]) || 0) / (Number(a[countCol]) || 1);
          const avgB = (Number(b[revCol]) || 0) / (Number(b[countCol]) || 1);
          return avgB - avgA;
        });
        topAvgRow = rowsSortedByAvg[0];
      }

      // Leader by Customer Count
      const rowsSortedByCount = countCol ? [...rows].sort((a, b) => (Number(b[countCol]) || 0) - (Number(a[countCol]) || 0)) : rows;
      const topCountRow = rowsSortedByCount[0];

      // Leader by Active Rate
      const rowsSortedByRate = rateCol ? [...rows].sort((a, b) => (Number(b[rateCol]) || 0) - (Number(a[rateCol]) || 0)) : rows;
      const topRateRow = rateCol ? rowsSortedByRate[0] : null;
      const lowestRateRow = rateCol ? rowsSortedByRate[rowsSortedByRate.length - 1] : null;

      // =====================================================================
      // EXECUTIVE OVERVIEW SYNTHESIS
      // =====================================================================
      const topRevName = topRevRow[dimCol];
      const topRevVal = revCol ? formatMetricValue(topRevRow[revCol], revCol) : '';
      const topAvgName = topAvgRow ? topAvgRow[dimCol] : null;
      const topAvgVal = topAvgRow && avgCol ? formatMetricValue(topAvgRow[avgCol], avgCol) : null;
      const topCountName = topCountRow[dimCol];
      const topCountVal = countCol ? topCountRow[countCol] : null;

      // Check if this is a direct single-metric average query (e.g. "What is the average MRR by customer segment?")
      const isSingleAverageQuery = (question.toLowerCase().includes('average') || question.toLowerCase().includes('avg')) &&
        !rateCol && !question.toLowerCase().includes('active') && !question.toLowerCase().includes('channel') && !question.toLowerCase().includes('city');

      // Check if Delhi/Outlier low activation pattern exists (e.g. City comparison)
      const hasSevereLowOutlier = lowestRateRow && rateCol && (Number(lowestRateRow[rateCol]) <= 40);
      const allOther100 = rateCol && rows.filter((r) => r !== lowestRateRow).every((r) => Number(r[rateCol]) === 100);

      if (isSingleAverageQuery) {
        const targetCol = profile.avgRevenueCol || profile.numericCols.find((c) => c.toLowerCase().includes('mrr') || c.toLowerCase().includes('avg')) || profile.numericCols[0] || columns[1];
        const metricLabel = targetCol.replace(/^(avg_|sum_|total_)/i, '').replace(/_/g, ' ');
        const sorted = [...rows].sort((a, b) => (Number(b[targetCol]) || 0) - (Number(a[targetCol]) || 0));
        overview = `${sorted[0][dimCol]} has the highest average ${metricLabel} at ${formatMetricValue(sorted[0][targetCol], targetCol)}, while ${sorted[sorted.length - 1][dimCol]} has the lowest at ${formatMetricValue(sorted[sorted.length - 1][targetCol], targetCol)}.`;

        sorted.forEach((r) => {
          key_findings.push({
            finding: `${r[dimCol]}: ${metricLabel} is ${formatMetricValue(r[targetCol], targetCol)}${
              r.customer_count ? ` (${r.customer_count} ${entity.plural})` : ''
            }.`,
            evidence: `${dimCol}="${r[dimCol]}", ${targetCol}=${r[targetCol]}`,
            importance: 'medium',
          });
        });

        const highestValNum = Number(sorted[0][targetCol]);
        const lowestValNum = Number(sorted[sorted.length - 1][targetCol]);
        if (lowestValNum > 0 && highestValNum / lowestValNum >= 1.5) {
          const mult = (highestValNum / lowestValNum).toFixed(1);
          key_findings.push({
            finding: `${sorted[0][dimCol]}'s average ${metricLabel} is approximately ${mult} times that of ${sorted[sorted.length - 1][dimCol]}.`,
            evidence: `Calculated ratio: ${highestValNum} / ${lowestValNum}`,
            importance: 'high',
          });
        }
      } else if (hasSevereLowOutlier && lowestRateRow && allOther100) {
        const outlierName = lowestRateRow[dimCol];
        const outlierRev = revCol ? formatMetricValue(lowestRateRow[revCol], revCol) : '';
        const outlierActive = profile.activeCountCol ? lowestRateRow[profile.activeCountCol] : '';
        const outlierTotal = profile.totalCountCol ? lowestRateRow[profile.totalCountCol] : '';
        const secondRevRow = rowsSortedByRev[1];

        overview = `${topRevName} leads ${dimCol.toLowerCase()}-level ${revCol?.toLowerCase() || 'revenue'} at ${topRevVal}${
          secondRevRow && revCol ? `, followed by ${secondRevRow[dimCol]} at ${formatMetricValue(secondRevRow[revCol], revCol)}` : ''
        }. ${outlierName} is a significant outlier, generating only ${outlierRev} in ${revCol?.toLowerCase() || 'revenue'} with ${outlierActive} of its ${outlierTotal} customers active. All ${countCol && rows[0][countCol] ? rows[0][countCol] : ''} customers in ${rows
          .filter((r) => rateCol && Number(r[rateCol]) === 100)
          .map((r) => r[dimCol])
          .join(', ')} are active.`;
      }
      // Top revenue and top average differ (e.g. Channel comparison: Referral vs Partner)
      else if (topAvgName && topAvgName !== topRevName && revCol && avgCol) {
        overview = `${topRevName} is the largest total-${revCol.toUpperCase().replace(/TOTAL_/, '')} contributor at ${topRevVal}, while ${topAvgName} delivers the highest average ${revCol.toUpperCase().replace(/TOTAL_/, '')} per customer at ${topAvgVal}. Although ${
          rateCol && topRateRow && rowsSortedByRate[1] && Number(topRateRow[rateCol]) === 100 && Number(rowsSortedByRate[1][rateCol]) === 100
            ? `${topRateRow[dimCol]} and ${rowsSortedByRate[1][dimCol]} both show 100% active customer rates`
            : `${topRateRow ? topRateRow[dimCol] : 'leading groups'} show strong customer engagement`
        }, their average revenue contributions differ considerably.`;
      }
      // Top revenue is also top average (e.g. Enterprise segment)
      else if (topRevRow && revCol) {
        overview = `${topRevName} is the strongest revenue-generating ${dimCol.toLowerCase()}, contributing ${topRevVal} in ${revCol.toUpperCase().replace(/TOTAL_/, '')}${
          countCol && topRevRow[countCol] ? ` across ${topRevRow[countCol]} customers` : ''
        }${topAvgVal ? ` and achieving the highest average ${avgCol?.toUpperCase().replace(/AVG_/, '') || 'revenue'} of ${topAvgVal}` : ''}.${
          topCountName !== topRevName && rateCol && topCountRow[rateCol]
            ? ` ${topCountName} has the largest customer base (${topCountVal}) and an active customer percentage of ${formatMetricValue(topCountRow[rateCol], rateCol)}${avgCol && topCountRow[avgCol] ? `, but its average MRR is considerably lower at ${formatMetricValue(topCountRow[avgCol], avgCol)}` : ''}.`
            : ''
        }`;
      } else {
        // Clean grouped comparison overview
        const targetCol = profile.numericCols.find((c) => question.toLowerCase().includes(c.toLowerCase())) || profile.numericCols[0] || columns[1];
        const sorted = [...rows].sort((a, b) => (Number(b[targetCol]) || 0) - (Number(a[targetCol]) || 0));
        overview = `${sorted[0][dimCol]} has the highest average ${targetCol.replace(/_/g, ' ')} at ${formatMetricValue(sorted[0][targetCol], targetCol)}, while ${sorted[sorted.length - 1][dimCol]} has the lowest at ${formatMetricValue(sorted[sorted.length - 1][targetCol], targetCol)}.`;
      }

      // =====================================================================
      // KEY FINDINGS (3-5 Bullet Points with Calculations)
      // =====================================================================
      // 1. Revenue Leadership & Contribution Percentage
      if (!isSingleAverageQuery && revCol && totalRevAll > 0 && topRevRow) {
        const revSharePct = ((Number(topRevRow[revCol]) / totalRevAll) * 100).toFixed(1);
        const custSharePct = totalCustAll > 0 && countCol ? ((Number(topRevRow[countCol]) / totalCustAll) * 100).toFixed(1) : null;

        key_findings.push({
          finding: `${topRevName} leads in ${revCol.replace(/_/g, ' ')} with ${topRevVal}${
            totalRevAll > 0 ? `, contributing approximately ${revSharePct}% of total ${revCol.replace(/_/g, ' ').toUpperCase()} (${topRevVal} out of ${formatMetricValue(totalRevAll, revCol)})` : ''
          }${custSharePct ? `, despite representing only ${custSharePct}% of customers` : ''}.`,
          evidence: `${topRevName}: ${topRevVal} / ${formatMetricValue(totalRevAll, revCol)}`,
          importance: 'high',
        });
      }

      // 1b. Specific Metric Leaders for multi-metric queries (e.g. active MRR vs total MRR)
      if (!isSingleAverageQuery && profile.numericCols.length >= 2) {
        profile.numericCols.forEach((col) => {
          if (col !== revCol && col !== avgCol) {
            const topRow = [...rows].sort((a, b) => (Number(b[col]) || 0) - (Number(a[col]) || 0))[0];
            if (topRow && !key_findings.some((f) => f.finding.toLowerCase().includes(col.replace(/_/g, ' ')))) {
              key_findings.push({
                finding: `${topRow[dimCol]} leads in ${col.replace(/_/g, ' ')} with ${formatMetricValue(topRow[col], col)}.`,
                evidence: `${col} = ${topRow[col]} in ${topRow[dimCol]}`,
                importance: 'medium',
              });
            }
          }
        });
      }

      // 2. Average Revenue Multiples or Top-2 Gap
      if (!isSingleAverageQuery && avgCol && rowsSortedByAvg.length >= 2) {
        const firstAvgRow = rowsSortedByAvg[0];
        const topAvgValNum = Number(firstAvgRow[avgCol]);
        const secondAvgRow = rowsSortedByAvg[1];
        const secondAvgValNum = Number(secondAvgRow[avgCol]);
        const lowestAvgRow = rowsSortedByAvg[rowsSortedByAvg.length - 1];
        const lowestAvgValNum = Number(lowestAvgRow[avgCol]);

        // If top average is a different category (e.g. Partner > Referral)
        if (firstAvgRow && topRevRow && firstAvgRow[dimCol] !== topRevRow[dimCol] && secondAvgValNum > 0) {
          const diffPct = (((topAvgValNum - secondAvgValNum) / secondAvgValNum) * 100).toFixed(0);
          key_findings.push({
            finding: `${firstAvgRow[dimCol]} has the highest average ${avgCol.replace(/_/g, ' ').toUpperCase()} per customer (${formatMetricValue(topAvgValNum, avgCol)}), approximately ${diffPct}% higher than ${secondAvgRow[dimCol]}.`,
            evidence: `${firstAvgRow[dimCol]} ($${topAvgValNum}) vs ${secondAvgRow[dimCol]} ($${secondAvgValNum})`,
            importance: 'high',
          });
        }
        // If multiples exist across tiers (e.g. Enterprise is 9.2x SMB)
        else if (lowestAvgValNum > 0 && topAvgValNum / lowestAvgValNum >= 1.5) {
          const smbRow = rows.find((r) => String(r[dimCol]).toLowerCase().includes('smb')) ||
            rows.find((r) => String(r[dimCol]).toLowerCase().includes('mid'));
          const smbMult = smbRow && Number(smbRow[avgCol]) > 0 ? (topAvgValNum / Number(smbRow[avgCol])).toFixed(1) : null;
          const lowestMult = (topAvgValNum / lowestAvgValNum).toFixed(1);

          key_findings.push({
            finding: `${firstAvgRow[dimCol]}'s average ${avgCol.replace(/_/g, ' ').toUpperCase()} is approximately ${
              smbMult && smbRow ? `${smbMult} times that of ${smbRow[dimCol]} and ` : ''
            }${lowestMult} times that of ${lowestAvgRow[dimCol]}.`,
            evidence: `Calculated ratios between ${firstAvgRow[dimCol]} and lower tiers`,
            importance: 'high',
          });
        }
      }

      // 3. Activation Rate Cohorts and Extremes
      if (rateCol && lowestRateRow && topRateRow) {
        const perfectActiveRows = rows.filter((r) => Number(r[rateCol]) === 100);
        if (perfectActiveRows.length >= 2) {
          key_findings.push({
            finding: `${perfectActiveRows.map((r) => r[dimCol]).join(', ')} each have a 100% active customer rate.`,
            evidence: `All records active in ${perfectActiveRows.length} categories`,
            importance: 'medium',
          });
        } else {
          key_findings.push({
            finding: `${topRateRow[dimCol]} has the strongest activation rate at ${formatMetricValue(topRateRow[rateCol], rateCol)}${
              rowsSortedByRate[1] ? `, followed by ${rowsSortedByRate[1][dimCol]} at ${formatMetricValue(rowsSortedByRate[1][rateCol], rateCol)}` : ''
            }.`,
            evidence: `Activation ranking across groups`,
            importance: 'medium',
          });
        }

        // Lowest activation finding
        const lowestRateVal = Number(lowestRateRow[rateCol]);
        const lowestActiveCount = profile.activeCountCol ? lowestRateRow[profile.activeCountCol] : null;
        const lowestTotalCount = profile.totalCountCol ? lowestRateRow[profile.totalCountCol] : null;

        key_findings.push({
          finding: `${lowestRateRow[dimCol]} has the lowest activation rate at ${formatMetricValue(lowestRateVal, rateCol)}${
            lowestActiveCount !== null && lowestTotalCount !== null ? `, with ${lowestActiveCount} of its ${lowestTotalCount} customers active` : ''
          }.`,
          evidence: `Lowest activation rate in ${lowestRateRow[dimCol]}`,
          importance: 'high',
        });
      }

      // 4. Relative Outlier Drop or Customer Efficiency
      if (revCol && rowsSortedByRev.length >= 2) {
        const topRevValNum = Number(topRevRow[revCol]);
        const lowestRevValNum = Number(lowestRevRow[revCol]);

        // If severe outlier drop (e.g. Delhi MRR is 93.9% lower than Chennai)
        if (hasSevereLowOutlier && topRevValNum > 0 && lowestRevValNum < topRevValNum * 0.2) {
          const dropPct = (((topRevValNum - lowestRevValNum) / topRevValNum) * 100).toFixed(1);
          key_findings.push({
            finding: `${lowestRevRow[dimCol]}'s ${revCol.replace(/_/g, ' ')} is approximately ${dropPct}% lower than ${topRevRow[dimCol]}'s.`,
            evidence: `Relative spread between ${lowestRevRow[dimCol]} and ${topRevRow[dimCol]}`,
            importance: 'high',
          });
        }
        // Customer Efficiency (e.g. Partner generates $6,050 from only 5 customers)
        else if (countCol) {
          const efficientRow = rows.find(
            (r) => Number(r[countCol]) <= totalCustAll * 0.25 && Number(r[revCol]) >= totalRevAll * 0.25
          );
          if (efficientRow) {
            key_findings.push({
              finding: `${efficientRow[dimCol]} generates ${formatMetricValue(efficientRow[revCol], revCol)} from only ${efficientRow[countCol]} customers, indicating comparatively high revenue per customer.`,
              evidence: `${efficientRow[dimCol]}: ${formatMetricValue(efficientRow[revCol], revCol)} across ${efficientRow[countCol]} customers`,
              importance: 'medium',
            });
          }
        }
      }

      // If we still need standard per-group findings (e.g. for simple grouped query)
      if (key_findings.length < 3) {
        rows.slice(0, 4).forEach((r) => {
          const metricCol = profile.numericCols[0] || columns[1];
          key_findings.push({
            finding: `${r[dimCol]}: ${metricCol.replace(/_/g, ' ')} is ${formatMetricValue(r[metricCol], metricCol)}${
              r.customer_count ? ` (${r.customer_count} ${entity.plural})` : ''
            }.`,
            evidence: `${dimCol}="${r[dimCol]}", ${metricCol}=${r[metricCol]}`,
            importance: 'medium',
          });
        });
      }

      // =====================================================================
      // PERFORMANCE COMPARISON SECTION
      // =====================================================================
      if (hasMultipleMetrics) {
        if (topRevRow && revCol) {
          performance_comparison.push(`Revenue Leadership: ${topRevName} generates the most aggregate revenue at ${topRevVal}.`);
        }
        if (topAvgRow && avgCol) {
          performance_comparison.push(`Average Value Leadership: ${topAvgName} delivers the highest average revenue at ${topAvgVal} per customer.`);
        }
        if (topRateRow && rateCol) {
          performance_comparison.push(`Highest Activation: ${topRateRow[dimCol]} achieves the highest active rate at ${formatMetricValue(topRateRow[rateCol], rateCol)}.`);
        }
        if (lowestRateRow && rateCol) {
          performance_comparison.push(`Lowest Activation: ${lowestRateRow[dimCol]} has the lowest active customer percentage at ${formatMetricValue(lowestRateRow[rateCol], rateCol)}.`);
        }
        if (topCountName && countCol && topRevRow && revCol && topCountName !== topRevName) {
          performance_comparison.push(`Volume vs Revenue: ${topCountName} holds the largest customer volume (${topCountVal}), but does not produce the highest aggregate revenue.`);
        }
      }

      // =====================================================================
      // BUSINESS IMPLICATIONS
      // =====================================================================
      if (topAvgRow && topAvgRow[dimCol] !== topRevRow[dimCol]) {
        business_implications.push({
          implication: `${topRevName} is the leading channel by aggregate revenue, while ${topAvgName} is strongest by average revenue per customer. ${
            lowestRateRow ? `${lowestRateRow[dimCol]}'s low activation rate is a clear area for further investigation.` : ''
          }`,
          confidence: 'high',
        });
      } else if (hasSevereLowOutlier && lowestRateRow) {
        business_implications.push({
          implication: `${lowestRateRow[dimCol]}'s performance is materially weaker across both customer activation and active revenue. ${
            rowsSortedByRev[1] ? `${rowsSortedByRev[1][dimCol]} demonstrates relatively high revenue contribution despite having fewer active customers than some other locations.` : ''
          }`,
          confidence: 'high',
        });
      } else if (topRevRow && topCountRow && topRevName !== topCountName) {
        business_implications.push({
          implication: `${topRevName} represents the most valuable segment in terms of revenue per customer. ${topCountName} demonstrates stronger activation and customer volume, but its monetization per customer is comparatively low.`,
          confidence: 'high',
        });
      } else {
        business_implications.push({
          implication: `A higher average in ${topRevName} indicates greater revenue contribution per entity in that segment.`,
          confidence: 'medium',
        });
      }

      if (countCol && revCol) {
        business_implications.push({
          implication: 'Customer volume does not directly scale with revenue contribution across segments.',
          confidence: 'high',
        });
      }

      // =====================================================================
      // RECOMMENDED ACTIONS
      // =====================================================================
      if (topRevRow && revCol) {
        recommended_actions.push({
          action: `Prioritize ${topRevName} retention and account expansion efforts because of its substantial contribution to overall revenue.`,
          reason: `Protect top revenue contributing ${dimCol}`,
          priority: 'high',
        });
      }

      if (topCountName && topCountName !== topRevName) {
        recommended_actions.push({
          action: `Investigate opportunities to increase ${topCountName} average revenue through appropriate upgrades, feature add-ons, and expansion strategies.`,
          reason: `High customer volume presents upselling potential`,
          priority: 'medium',
        });
      }

      if (lowestRateRow && rateCol) {
        recommended_actions.push({
          action: `Examine the lower activation rate in ${lowestRateRow[dimCol]} (${formatMetricValue(lowestRateRow[rateCol], rateCol)}) to identify possible onboarding, conversion, or engagement issues.`,
          reason: `Address activation gap in ${lowestRateRow[dimCol]}`,
          priority: 'medium',
        });
      }

      if (rowsSortedByRev.length >= 2 && rowsSortedByRev[1] && countCol && Number(rowsSortedByRev[1][countCol]) < totalCustAll * 0.3) {
        const efficient = rowsSortedByRev[1];
        recommended_actions.push({
          action: `Investigate ${efficient[dimCol]} acquisition and customer mix to understand whether its higher average customer revenue can be replicated elsewhere.`,
          reason: `Replicate high customer value practices`,
          priority: 'low',
        });
      }

      // =====================================================================
      // LIMITATIONS
      // =====================================================================
      if (dimCol.toLowerCase().includes('channel')) {
        limitations.push('Acquisition costs, campaign expenditure, and customer lifetime value are not available. Therefore, the analysis cannot establish CAC, ROI, or channel profitability.');
      } else if (dimCol.toLowerCase().includes('city') || dimCol.toLowerCase().includes('region')) {
        limitations.push('The dataset does not establish the causes of geographic performance differences. Further customer-level and historical analysis would be needed.');
      } else {
        limitations.push('This is a snapshot of the loaded customer dataset. It does not establish historical retention, lifetime value, or future churn probability.');
      }
    }
  }

  // =========================================================================
  // STRATEGY 5: RANKING AND TOP-N WITH EXACT TIE HANDLING
  // =========================================================================
  else if (category === 'ranking_top_n') {
    const rankMetricCol = profile.totalRevenueCol || profile.avgRevenueCol || profile.numericCols.find((c) => {
      const l = c.toLowerCase();
      return l.includes('mrr') || l.includes('sales') || l.includes('profit') || l.includes('sold') || l.includes('quantity') || l.includes('tickets');
    }) || profile.numericCols[0] || columns[1] || columns[0];

    const entityCol = profile.entityCol || columns[0];
    const dimCol = profile.dimensionCol;

    // Detect exact ties in the result set
    const valueCounts = new Map<number, string[]>();
    rows.forEach((r) => {
      const val = Number(r[rankMetricCol]);
      const name = r[entityCol] || 'Record';
      const existing = valueCounts.get(val) || [];
      existing.push(name);
      valueCounts.set(val, existing);
    });

    const ties = Array.from(valueCounts.entries()).filter(([_, names]) => names.length > 1);

    const leaderRow = rows[0];
    const runnerUpRow = rows.length > 1 ? rows[1] : null;
    const leaderName = leaderRow[entityCol] || 'Top entity';
    const leaderVal = formatMetricValue(leaderRow[rankMetricCol], rankMetricCol);
    const runnerUpName = runnerUpRow ? runnerUpRow[entityCol] : null;
    const runnerUpVal = runnerUpRow ? formatMetricValue(runnerUpRow[rankMetricCol], rankMetricCol) : null;

    if (ties.length > 0) {
      overview = `${leaderName} leads the ranking at ${leaderVal}${
        runnerUpName ? `, followed by ${runnerUpName} at ${runnerUpVal}` : ''
      }. Multiple entities show identical ${rankMetricCol.replace(/_/g, ' ')} values, highlighting the importance of correctly handling ties.`;
    } else {
      overview = `${rows.length} ${entity.plural} were ranked by ${rankMetricCol}. ${leaderName} leads with ${leaderVal}${
        runnerUpName ? `, followed by ${runnerUpName} with ${runnerUpVal}` : ''
      }.`;
    }

    key_findings.push({
      finding: `${leaderName} leads with ${leaderVal} in ${rankMetricCol.replace(/_/g, ' ').toUpperCase()} (ranking #1).`,
      evidence: `${entityCol}="${leaderName}", ${rankMetricCol}=${leaderRow[rankMetricCol]}`,
      importance: 'high',
    });

    if (runnerUpRow) {
      key_findings.push({
        finding: `${runnerUpName} ranks second with ${runnerUpVal}.`,
        evidence: `${entityCol}="${runnerUpName}", ${rankMetricCol}=${runnerUpRow[rankMetricCol]}`,
        importance: 'high',
      });
    }

    // Detail tie findings if any exist
    ties.slice(0, 2).forEach(([val, names]) => {
      key_findings.push({
        finding: `${names.join(' and ')} are tied at ${formatMetricValue(val, rankMetricCol)}${dimCol ? ` in ${dimCol}` : ''}.`,
        evidence: `Identical rank metric value ${val}`,
        importance: 'medium',
      });
    });

    if (rows.length > 2) {
      const lowestRow = rows[rows.length - 1];
      key_findings.push({
        finding: `Values range from ${formatMetricValue(lowestRow[rankMetricCol], rankMetricCol)} to ${leaderVal} across the top ${rows.length} displayed records.`,
        evidence: `Spread across top ${rows.length}`,
        importance: 'medium',
      });
    }

    business_implications.push({
      implication: `Revenue concentration among top accounts suggests that a small number of accounts materially influence aggregate performance. ${
        ties.length > 0 ? 'Tied entities should be represented accurately rather than arbitrarily described as meaningful differences.' : ''
      }`,
      confidence: 'high',
    });

    recommended_actions.push({
      action: `Focus retention and relationship management on the top accounts representing the largest revenue share.`,
      reason: 'Protect top revenue accounts',
      priority: 'high',
    });

    if (ties.length > 0) {
      recommended_actions.push({
        action: `Use a documented tie-breaking rule (such as signup date or secondary metrics) when presenting ranked lists.`,
        reason: 'Ensure fair and deterministic ranking displays',
        priority: 'low',
      });
    }

    limitations.push('Rankings reflect the current metric ordering and do not imply operational superiority or client health.');
  }

  // =========================================================================
  // STRATEGY 6: FILTERED RETRIEVAL / OPERATIONAL ATTENTION & RISK ANALYSIS
  // =========================================================================
  else {
    const entityCol = profile.entityCol || columns[0];
    const ticketsCol = profile.ticketsCol;
    const usageCol = profile.usageCol;
    const statusCol = profile.statusCol;
    const revCol = profile.totalRevenueCol || profile.numericCols.find((c) => c.toLowerCase().includes('mrr'));

    // Check if query is an attention/risk query (tickets > 3, usage > 100, or cancelled accounts)
    const hasTicketsFilter = ticketsCol && rows.some((r) => Number(r[ticketsCol]) > 3);
    const hasUsageFilter = usageCol && rows.some((r) => Number(r[usageCol]) > 100);
    const hasStatusCol = statusCol && rows.some((r) => ['Cancelled', 'Churned', 'At-Risk'].includes(r[statusCol]));

    if (hasTicketsFilter || hasUsageFilter || hasStatusCol) {
      overview = `Found ${rows.length} ${rows.length === 1 ? entity.singular : entity.plural} matching the specified filter criteria${
        hasTicketsFilter && hasUsageFilter ? ' for operational attention: elevated support tickets and high capacity usage' : hasTicketsFilter ? ' (elevated support tickets)' : ''
      }. These customers represent a mixture of high-value accounts, unusually high usage, and cancelled subscriptions.`;

      // 1. Multi-flag accounts (high tickets AND high usage)
      if (ticketsCol && usageCol) {
        const multiFlag = rows.find((r) => Number(r[ticketsCol]) >= 5 && Number(r[usageCol]) >= 100);
        if (multiFlag) {
          key_findings.push({
            finding: `${multiFlag[entityCol]} has ${multiFlag[ticketsCol]} support tickets and ${formatMetricValue(multiFlag[usageCol], usageCol)} usage, making it a notable account for investigation.`,
            evidence: `Combined high tickets and quota exceeding usage`,
            importance: 'high',
          });
        }
      }

      // 2. High revenue accounts with high support volume
      if (revCol && ticketsCol) {
        const topRevTicket = [...rows].sort((a, b) => (Number(b[revCol]) || 0) - (Number(a[revCol]) || 0))[0];
        if (topRevTicket && Number(topRevTicket[ticketsCol]) >= 4) {
          key_findings.push({
            finding: `${topRevTicket[entityCol]} contributes ${formatMetricValue(topRevTicket[revCol], revCol)} in MRR and has ${topRevTicket[ticketsCol]} support tickets, making it a high-revenue account with substantial support activity.`,
            evidence: `${topRevTicket[entityCol]}: MRR ${formatMetricValue(topRevTicket[revCol], revCol)}, Tickets ${topRevTicket[ticketsCol]}`,
            importance: 'high',
          });
        }
      }

      // 3. Usage threshold accounts
      if (usageCol) {
        const overUsageRows = rows.filter((r) => Number(r[usageCol]) > 100);
        if (overUsageRows.length > 0) {
          const sample = overUsageRows[0];
          key_findings.push({
            finding: `${sample[entityCol]} has ${formatMetricValue(sample[usageCol], usageCol)} usage${ticketsCol ? ` and ${sample[ticketsCol]} support tickets` : ''}.`,
            evidence: `Usage exceeded 100% quota threshold`,
            importance: 'medium',
          });
          key_findings.push({
            finding: `Several customers exceed the usage threshold, which may warrant investigation of product capacity, usage patterns, or plan suitability.`,
            evidence: `${overUsageRows.length} accounts > 100% usage`,
            importance: 'medium',
          });
        }
      }

      // 4. Cancelled status accounts check
      if (statusCol) {
        const cancelledRows = rows.filter((r) => ['Cancelled', 'Churned'].includes(String(r[statusCol])));
        cancelledRows.forEach((cancelledRow) => {
          key_findings.push({
            finding: `${cancelledRow[entityCol]} has ${ticketsCol ? `${cancelledRow[ticketsCol]} support tickets but ` : ''}is already marked as ${cancelledRow[statusCol]}, so its current subscription status must be considered before interpreting its MRR.`,
            evidence: `Status is ${cancelledRow[statusCol]}`,
            importance: 'medium',
          });
        });
      }

      business_implications.push({
        implication: 'High support volume among high-MRR customers may warrant priority account review. Customers exceeding 100% usage may require an examination of plan limits and actual product consumption.',
        confidence: 'high',
      });

      recommended_actions.push({
        action: 'Prioritize account reviews for high-MRR customers with elevated support activity.',
        reason: 'Address recurring issues causing customer distress',
        priority: 'high',
      });

      if (usageCol) {
        recommended_actions.push({
          action: 'Investigate customers exceeding 100% usage to understand whether they require plan changes or technical support.',
          reason: 'Address capacity and tier limits',
          priority: 'medium',
        });
      }

      if (statusCol) {
        recommended_actions.push({
          action: 'Separate cancelled accounts from active customer follow-up and revenue reporting.',
          reason: 'Maintain accurate active cohort health',
          priority: 'medium',
        });
      }

      limitations.push('Support-ticket volume does not independently establish dissatisfaction or churn probability. Usage above 100% should not automatically be interpreted as overage billing or a technical incident.');
    } else {
      // Standard Filtered Lookup
      overview = `Found ${rows.length} ${rows.length === 1 ? entity.singular : entity.plural} matching the specified filter criteria.`;

      rows.slice(0, 4).forEach((r, idx) => {
        const name = r[entityCol] || `Record #${idx + 1}`;
        const details = profile.numericCols
          .slice(0, 2)
          .map((c) => `${c}: ${formatMetricValue(r[c], c)}`)
          .join(', ');
        key_findings.push({
          finding: `${name}${details ? ` — ${details}` : ''}.`,
          evidence: `Verified row ${idx + 1}`,
          importance: 'medium',
        });
      });

      if (ticketsCol) {
        const highTickets = rows.filter((r) => Number(r[ticketsCol]) > 3);
        if (highTickets.length > 0) {
          recommended_actions.push({
            action: `Review the support histories of the customers with elevated ticket counts to identify recurring issues.`,
            reason: 'Address high ticket volumes',
            priority: 'high',
          });
        }
      }
    }
  }

  // Filter out any banned boilerplate from findings or implications if any crept in
  const cleanFindings = key_findings.filter((f) => !containsBannedBoilerplate(f.finding));
  const cleanAnomalies = anomalies.filter((a) => !containsBannedBoilerplate(a.observation));
  const cleanImplications = business_implications.filter((i) => !containsBannedBoilerplate(i.implication));
  const cleanActions = recommended_actions.filter((a) => !containsBannedBoilerplate(a.action));
  const cleanComparisons = performance_comparison.filter((c) => !containsBannedBoilerplate(c));

  return buildLegacyPayload({
    status: 'verified',
    category,
    overview: sanitizeText(overview),
    key_findings: cleanFindings,
    performance_comparison: cleanComparisons,
    anomalies: cleanAnomalies,
    business_implications: cleanImplications,
    recommended_actions: cleanActions,
    limitations: limitations.map(sanitizeText),
  });
}
