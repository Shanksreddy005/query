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
    const formatted = absVal >= 1000 ? absVal.toLocaleString('en-US', { maximumFractionDigits: 2 }) : absVal.toFixed(absVal % 1 === 0 ? 0 : 2);
    return isNeg ? `-$${formatted}` : `$${formatted}`;
  }

  if (isPercentage) {
    // If between -1 and 1 (exclusive of 0 and exact 1 where likely a fraction like 0.15 for 15%)
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

  // 1. Negative Values where typically unexpected (e.g. MRR, Quantity, Active Users, Support Tickets)
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

  // 2. Check for unexpected nulls/undefined in returned rows
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

  // 3. Operational Outliers: High Support Tickets
  const ticketCol = columns.find((c) => c.toLowerCase().includes('ticket'));
  if (ticketCol) {
    const highTicketRows = rows.filter((r) => typeof r[ticketCol] === 'number' && r[ticketCol] >= 10);
    if (highTicketRows.length > 0 && category === 'filtering_retrieval') {
      const entityCol = columns.find((c) => c.toLowerCase().includes('name') || c.toLowerCase().includes('company')) || columns[0];
      const names = highTicketRows.slice(0, 3).map((r) => `${r[entityCol]} (${r[ticketCol]} tickets)`).join(', ');
      anomalies.push({
        observation: `Elevated ticket volume detected: ${highTicketRows.length} account(s) have 10+ support tickets.`,
        evidence: `Notable accounts: ${names}`,
        severity: 'medium',
        type: 'operational',
      });
    }
  }

  return anomalies;
}

/**
 * Formats a clean list of strings or structures, ensuring backwards compatibility.
 */
function buildLegacyPayload(
  insight: QueryInsight
): QueryInsight {
  const findingsList = insight.key_findings ? insight.key_findings.map((f) => f.finding) : (insight.findings || []);
  const anomaliesList = insight.anomalies ? insight.anomalies.map((a) => (typeof a === "string" ? a : a.observation)) : (insight.critical_anomalies || []);
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
 * Formulates deterministic, grounded executive summaries strictly from executed results.
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

  // 5. Generate Evidence-Based Summary By Analytical Category
  let overview = '';
  const key_findings: KeyFinding[] = [];
  const anomalies: AnomalyObservation[] = detectEvidenceAnomalies(rows, columns, category);
  const business_implications: BusinessImplication[] = [];
  const recommended_actions: RecommendedAction[] = [];
  const limitations: string[] = [];

  // Helper: Find primary numeric and dimension columns
  const numericCols = columns.filter((c) => {
    const val = rows[0]?.[c];
    return typeof val === 'number';
  });
  const textCols = columns.filter((c) => !numericCols.includes(c));
  const primaryEntityCol = textCols.find((c) => {
    const l = c.toLowerCase();
    return l.includes('name') || l.includes('company') || l.includes('product') || l.includes('id');
  }) || textCols[0] || columns[0];

  const primaryDimensionCol = textCols.find((c) => {
    const l = c.toLowerCase();
    return l.includes('tier') || l.includes('industry') || l.includes('segment') || l.includes('region') || l.includes('category') || l.includes('city');
  }) || textCols[0];

  switch (category) {
    case 'simple_count': {
      // Find the count value from rows[0]
      const countCol = columns.find((c) => {
        const l = c.toLowerCase();
        return l.includes('count') || l.includes('total') || l.includes('num');
      }) || columns[0];
      const countVal = rows[0][countCol] !== undefined ? rows[0][countCol] : rowCount;
      const formattedCount = formatMetricValue(countVal);

      // Distinguish distinct whole-dataset count vs filtered count
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

      // No mandatory anomaly section. No commercial risk statement.
      // Optional, relevant action
      recommended_actions.push({
        action: `Consider segment-level or geographic breakdowns to understand the ${entity.singular} base in greater detail.`,
        reason: 'Gain deeper distribution visibility',
        priority: 'low',
      });
      break;
    }

    case 'total_sum': {
      const sumCol = columns.find((c) => {
        const l = c.toLowerCase();
        return l.includes('sum') || l.includes('total') || l.includes('mrr') || l.includes('sales') || l.includes('profit') || l.includes('revenue');
      }) || numericCols[0] || columns[0];

      const sumVal = rows[0][sumCol];
      const formattedSum = formatMetricValue(sumVal, sumCol);
      const totalEntities = semanticSchema?.rowCount || rows.length;

      overview = `Total ${sumCol.replace(/^(total_|sum_)/i, '').toUpperCase()} across all ${totalEntities} ${entity.plural} is ${formattedSum}.`;

      key_findings.push({
        finding: `Aggregate ${sumCol.replace(/^(total_|sum_)/i, '')}: ${formattedSum} across verified ${entity.plural}.`,
        evidence: `${sumCol} = ${sumVal}`,
        importance: 'high',
      });

      limitations.push('Historical revenue trends or comparisons cannot be established from single-period snapshot data.');
      break;
    }

    case 'statistical_aggregation': {
      const avgCol = columns.find((c) => {
        const l = c.toLowerCase();
        return l.includes('avg') || l.includes('mean') || l.includes('median') || l.includes('min') || l.includes('max');
      }) || numericCols[0] || columns[0];

      const avgVal = rows[0][avgCol];
      const formattedAvg = formatMetricValue(avgVal, avgCol);

      overview = `Average ${avgCol.replace(/^(avg_|average_)/i, '').toUpperCase()} across ${entity.plural} is ${formattedAvg}.`;

      key_findings.push({
        finding: `Calculated average: ${formattedAvg}.`,
        evidence: `${avgCol} = ${avgVal}`,
        importance: 'high',
      });

      limitations.push('Averages can be influenced by outlier values in skewed distributions.');
      break;
    }

    case 'ranking_top_n': {
      const rankMetricCol = numericCols.find((c) => {
        const l = c.toLowerCase();
        return l.includes('mrr') || l.includes('sales') || l.includes('profit') || l.includes('sold') || l.includes('quantity') || l.includes('tickets');
      }) || numericCols[0] || columns[1] || columns[0];

      const topItem = rows[0];
      const secondItem = rows.length > 1 ? rows[1] : null;
      const leaderName = topItem[primaryEntityCol] || 'Top entity';
      const leaderVal = formatMetricValue(topItem[rankMetricCol], rankMetricCol);

      const secondName = secondItem ? secondItem[primaryEntityCol] : null;
      const secondVal = secondItem ? formatMetricValue(secondItem[rankMetricCol], rankMetricCol) : null;

      overview = `${rows.length} ${entity.plural} were ranked by ${rankMetricCol}. ${leaderName} leads with ${leaderVal}${
        secondName ? `, followed by ${secondName} with ${secondVal}` : ''
      }.`;

      key_findings.push({
        finding: `${leaderName} leads the ranking with ${leaderVal}.`,
        evidence: `${primaryEntityCol}="${leaderName}", ${rankMetricCol}=${topItem[rankMetricCol]}`,
        importance: 'high',
      });

      if (rows.length > 1) {
        const lowestItem = rows[rows.length - 1];
        const lowestVal = formatMetricValue(lowestItem[rankMetricCol], rankMetricCol);
        key_findings.push({
          finding: `Values range from ${lowestVal} to ${leaderVal} across the top ${rows.length} displayed ${entity.plural}.`,
          evidence: `Spread between rank 1 and rank ${rows.length}`,
          importance: 'medium',
        });
      }

      // Check if tickets or churn are present
      const hasTickets = columns.some((c) => c.toLowerCase().includes('ticket'));
      if (hasTickets) {
        const highTicketAccounts = rows.filter((r) => r.support_tickets >= 5);
        if (highTicketAccounts.length > 0) {
          business_implications.push({
            implication: `High-value accounts with elevated support tickets may carry higher operational overhead or churn risk.`,
            confidence: 'high',
          });
          recommended_actions.push({
            action: `Review support histories of the customers with the highest ticket volumes to identify recurring issues.`,
            reason: 'Prevent churn in high-value accounts',
            priority: 'high',
          });
        }
      }
      break;
    }

    case 'grouped_comparison': {
      const dimCol = primaryDimensionCol;
      const qLower = question.toLowerCase();
      const targetMetricCol = numericCols.find((c) => {
        const cl = c.toLowerCase();
        if (qLower.includes('avg') || qLower.includes('average')) return cl.includes('avg') || cl.includes('mean');
        if (qLower.includes('total') || qLower.includes('sum')) return cl.includes('total') || cl.includes('sum');
        if (qLower.includes('mrr')) return cl.includes('mrr');
        if (qLower.includes('profit')) return cl.includes('profit');
        if (qLower.includes('sales')) return cl.includes('sales');
        if (qLower.includes('count') || qLower.includes('how many')) return cl.includes('count');
        return false;
      });
      const metricCol = targetMetricCol || numericCols.find((c) => !c.toLowerCase().includes('count')) || numericCols[0] || columns[1];
      if (!metricCol || !dimCol) {
        overview = `Grouped breakdown by ${dimCol || 'dimension'} across ${rows.length} segments.`;
        break;
      }

      // Sort rows by metric to find highest and lowest
      const sortedRows = [...rows].sort((a, b) => (Number(b[metricCol]) || 0) - (Number(a[metricCol]) || 0));
      const highest = sortedRows[0];
      const lowest = sortedRows[sortedRows.length - 1];

      const highestName = highest[dimCol] || 'Leading group';
      const highestVal = formatMetricValue(highest[metricCol], metricCol);
      const lowestName = lowest[dimCol] || 'Trailing group';
      const lowestVal = formatMetricValue(lowest[metricCol], metricCol);

      const metricLabel = metricCol.replace(/^(avg_|sum_|total_)/i, '').replace(/_/g, ' ');

      if (highestName !== lowestName) {
        overview = `${highestName} has the highest average ${metricLabel} at ${highestVal}, while ${lowestName} has the lowest at ${lowestVal}.`;
      } else {
        overview = `Segment breakdown across ${rows.length} categories for ${metricLabel}.`;
      }

      sortedRows.forEach((r) => {
        key_findings.push({
          finding: `${r[dimCol]}: ${metricLabel} is ${formatMetricValue(r[metricCol], metricCol)}${
            r.customer_count ? ` (${r.customer_count} ${entity.plural})` : ''
          }.`,
          evidence: `${dimCol}="${r[dimCol]}", ${metricCol}=${r[metricCol]}`,
          importance: 'medium',
        });
      });

      business_implications.push({
        implication: `A high average ${metricLabel} in ${highestName} indicates greater revenue contribution per customer in that segment.`,
        confidence: 'medium',
      });

      recommended_actions.push({
        action: `Evaluate expansion or retention strategies tailored to the performance differences between ${highestName} and ${lowestName}.`,
        reason: 'Address variation across tiers',
        priority: 'medium',
      });

      limitations.push('Differences across segments reflect observational groupings and do not establish causal factors.');
      break;
    }

    case 'segmentation':
    case 'multi_metric': {
      const dimCol = primaryDimensionCol;
      overview = `Multi-metric analysis compares ${columns.slice(1).join(', ')} across ${rows.length} ${dimCol} groups.`;

      // Identify leading segment for primary metrics
      numericCols.forEach((col) => {
        const topRow = [...rows].sort((a, b) => (Number(b[col]) || 0) - (Number(a[col]) || 0))[0];
        if (topRow) {
          key_findings.push({
            finding: `${topRow[dimCol]} leads in ${col.replace(/_/g, ' ')} with ${formatMetricValue(topRow[col], col)}.`,
            evidence: `${col} = ${topRow[col]} in ${topRow[dimCol]}`,
            importance: 'medium',
          });
        }
      });

      // Distinguish customer count from revenue contribution
      const countCol = columns.find((c) => c.toLowerCase().includes('count'));
      const revCol = columns.find((c) => c.toLowerCase().includes('mrr') || c.toLowerCase().includes('sales'));
      if (countCol && revCol) {
        business_implications.push({
          implication: 'Customer volume does not directly scale with revenue contribution across segments.',
          confidence: 'high',
        });
      }

      limitations.push('Multi-metric comparisons reflect current aggregate totals; historical run rates are not established.');
      break;
    }

    case 'filtering_retrieval':
    default: {
      overview = `Found ${rows.length} ${rows.length === 1 ? entity.singular : entity.plural} matching the specified filter criteria.`;

      // Highlight top 3 matching items
      rows.slice(0, 3).forEach((r, idx) => {
        const name = r[primaryEntityCol] || `Record #${idx + 1}`;
        const details = numericCols
          .slice(0, 2)
          .map((c) => `${c}: ${formatMetricValue(r[c], c)}`)
          .join(', ');
        key_findings.push({
          finding: `${name}${details ? ` — ${details}` : ''}.`,
          evidence: `Verified row ${idx + 1}`,
          importance: 'medium',
        });
      });

      // If support tickets filter
      const ticketCol = columns.find((c) => c.toLowerCase().includes('ticket'));
      if (ticketCol) {
        const highTickets = rows.filter((r) => r[ticketCol] > 3);
        if (highTickets.length > 0) {
          recommended_actions.push({
            action: `Review the support histories of the customers with elevated ticket counts to identify recurring issues.`,
            reason: 'Address high ticket volumes',
            priority: 'high',
          });
        }
      }
      break;
    }
  }

  // Filter out any banned boilerplate from findings or implications if any crept in
  const cleanFindings = key_findings.filter((f) => !containsBannedBoilerplate(f.finding));
  const cleanAnomalies = anomalies.filter((a) => !containsBannedBoilerplate(a.observation));
  const cleanImplications = business_implications.filter((i) => !containsBannedBoilerplate(i.implication));
  const cleanActions = recommended_actions.filter((a) => !containsBannedBoilerplate(a.action));

  return buildLegacyPayload({
    status: 'verified',
    category,
    overview: sanitizeText(overview),
    key_findings: cleanFindings,
    anomalies: cleanAnomalies,
    business_implications: cleanImplications,
    recommended_actions: cleanActions,
    limitations: limitations.map(sanitizeText),
  });
}
