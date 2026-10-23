import { QueryPlan } from './queryPlan';
import { SemanticSchema } from './schemaProfiler';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  passedChecks?: string[];
  needsClarification?: boolean;
  clarificationMessage?: string;
}

const FORBIDDEN_SQL_PATTERNS = [
  /\bDROP\b/i,
  /\bDELETE\b/i,
  /\bUPDATE\b/i,
  /\bINSERT\b/i,
  /\bALTER\b/i,
  /\bCREATE\b/i,
  /\bTRUNCATE\b/i,
  /\bEXEC\b/i,
  /\bEXECUTE\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
];

/**
 * Checks whether a requested metric is defined and available in the dataset schema.
 * Prevents silent metric substitution (e.g. substituting current MRR for lost MRR).
 */
export function checkMetricAvailability(
  question: string,
  schema: SemanticSchema
): { isAvailable: boolean; missingMetric?: string; clarification?: string; caveat?: string } {
  const lowerQ = question.toLowerCase();

  // Test Group C: "Show the top five customers by lost MRR"
  // When question asks for lost MRR without explicit definition
  const asksForLostMrr = /\b(lost\s+mrr|lost\s+revenue)\b/i.test(lowerQ);
  if (asksForLostMrr) {
    const hasExplicitLostCol = schema.columns.some((c) =>
      c.name.toLowerCase().includes('lost_mrr') || c.name.toLowerCase().includes('lost_revenue')
    );
    if (!hasExplicitLostCol) {
      return {
        isAvailable: false,
        missingMetric: 'lost MRR',
        clarification:
          'The dataset contains current MRR ("mrr") and lifecycle status ("churn_status"), but does not contain a dedicated "lost MRR" measure. To avoid silent metric substitution, please clarify whether you wish to analyze current MRR for churned accounts (churn_status = \'Churned\') or another definition.',
        caveat:
          'The dataset contains current MRR but does not provide a separate lost-MRR measure.',
      };
    }
  }

  // Check for net operating margin
  const asksForNetOperatingMargin = /\bnet\s+operating\s+margin\b/i.test(lowerQ);
  if (asksForNetOperatingMargin) {
    const hasNom = schema.columns.some((c) => c.name.toLowerCase().includes('net_operating_margin'));
    if (!hasNom) {
      return {
        isAvailable: false,
        missingMetric: 'net operating margin',
        clarification:
          'The dataset does not contain an official "net operating margin" metric. Standard margin (profit / sales) is available, but operating margin requires operating expense data not present in this schema.',
        caveat:
          'The dataset provides sales and profit, but does not define net operating margin.',
      };
    }
  }

  return { isAvailable: true };
}

/**
 * Validates generated SQL against the QueryPlan, dataset schema, and user question before execution.
 * Enforces the strict analytical contract (Phase 2).
 */
export function validateSqlIntent(
  sql: string,
  plan: QueryPlan,
  schema: SemanticSchema,
  question?: string
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const passedChecks: string[] = [];
  const trimmedSql = sql.trim();
  const upperSql = trimmedSql.toUpperCase();
  const lowerSql = trimmedSql.toLowerCase();

  // 1. Safety Guard
  if (!upperSql.startsWith('SELECT') && !upperSql.startsWith('WITH')) {
    errors.push('Security Guard: Query must begin with SELECT or WITH (read-only query permitted).');
  } else {
    passedChecks.push('Read-only statement safety');
  }

  for (const forbidden of FORBIDDEN_SQL_PATTERNS) {
    if (forbidden.test(trimmedSql)) {
      errors.push(`Security Guard: Disallowed SQL keyword detected (${forbidden.source.replace(/\\b/g, '')}).`);
    }
  }

  // Check for multiple semicolon-separated statements
  const statements = trimmedSql.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
  if (statements.length > 1) {
    errors.push('Security Guard: Only single-statement queries are permitted.');
  }

  // 2. Metric Availability Check (Test Group C)
  let needsClarification = false;
  let clarificationMessage: string | undefined;

  if (question) {
    const metricCheck = checkMetricAvailability(question, schema);
    if (!metricCheck.isAvailable) {
      needsClarification = true;
      clarificationMessage = metricCheck.clarification;
      errors.push(`Undefined Metric: ${metricCheck.clarification}`);
    }
  }

  // 3. Table Name Check
  const validTableNames = [
    schema.tableName.toLowerCase(),
    'dataset',
    `"${schema.tableName.toLowerCase()}"`,
    '"dataset"',
  ];
  const fromMatches = trimmedSql.match(/FROM\s+([a-zA-Z0-9_"']+)/gi) || [];
  let referencesValidTable = false;
  for (const match of fromMatches) {
    const rawTable = match.replace(/FROM\s+/i, '').trim().toLowerCase();
    const cleanTable = rawTable.replace(/["'`]/g, '');
    if (validTableNames.includes(rawTable) || validTableNames.includes(cleanTable) || rawTable.startsWith('ranked_')) {
      referencesValidTable = true;
    }
  }
  if (fromMatches.length > 0 && !referencesValidTable) {
    warnings.push(`Query may not reference active table "${schema.tableName}".`);
  } else {
    passedChecks.push('Target table references verified');
  }

  // 4. Plan Intent Conformance
  // Intent: Top N per group (e.g. "most sold product in each region")
  if (plan.intent === 'top_n_per_group') {
    const hasWindow =
      lowerSql.includes('row_number()') ||
      lowerSql.includes('rank()') ||
      lowerSql.includes('dense_rank()');
    const hasPartitionBy = lowerSql.includes('partition by');

    if (!hasWindow) {
      errors.push(
        'Intent Validation Error: Grouped ranking ("in each group") requires a window function like ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...).'
      );
    }

    if (!hasPartitionBy) {
      errors.push(
        'Intent Validation Error: Grouped ranking requires PARTITION BY to separate rankings per group/region.'
      );
    }

    // Check partition column
    if (plan.partition_by && plan.partition_by.length > 0) {
      for (const partCol of plan.partition_by) {
        if (!lowerSql.includes(partCol.toLowerCase())) {
          errors.push(
            `Intent Validation Error: Partition column "${partCol}" must appear in PARTITION BY clause.`
          );
        }
      }
    }

    // Check item entity (e.g. product)
    if (plan.item_entity && !lowerSql.includes(plan.item_entity.toLowerCase())) {
      errors.push(
        `Intent Validation Error: Target item column "${plan.item_entity}" is missing from the query.`
      );
    }

    // Check metric
    if (plan.metric && !lowerSql.includes(plan.metric.toLowerCase())) {
      errors.push(
        `Intent Validation Error: Target metric column "${plan.metric}" must be aggregated in the ranking order.`
      );
    }

    // Check rank filter (e.g. rank = 1 or rank <= N or rank_idx = 1)
    const hasRankFilter =
      /rank\s*=\s*\d+/i.test(trimmedSql) ||
      /rank\s*<=\s*\d+/i.test(trimmedSql) ||
      /row_num\s*=\s*\d+/i.test(trimmedSql) ||
      /row_num\s*<=\s*\d+/i.test(trimmedSql) ||
      /rank_idx\s*=\s*\d+/i.test(trimmedSql) ||
      /rank_idx\s*<=\s*\d+/i.test(trimmedSql);
    if (!hasRankFilter) {
      errors.push(
        'Intent Validation Error: Outer query must filter on rank (e.g. WHERE rank = 1 or rank <= limit) to return only top items per group.'
      );
    } else {
      passedChecks.push('Window ranking partition constraint verified');
    }
  }

  // Intent: Ranking (global)
  if (plan.intent === 'ranking') {
    if (!lowerSql.includes('order by')) {
      errors.push('Intent Validation Error: Ranking queries require an ORDER BY clause.');
    } else {
      passedChecks.push('Ordering clause verified');
    }
    if (!lowerSql.includes('limit')) {
      warnings.push('Ranking queries should include a LIMIT clause to bound results.');
    }
  }

  // Intent: Aggregate by dimension
  if (plan.intent === 'aggregate_by_dimension' && plan.dimensions.length > 0) {
    if (!lowerSql.includes('group by')) {
      errors.push('Intent Validation Error: Dimension aggregation requires a GROUP BY clause.');
    } else {
      passedChecks.push(`Group by ${plan.dimensions.join(', ')} verified`);
    }
  }

  // Intent: Filter lookup (Raw records)
  if (plan.intent === 'filter_lookup') {
    if (plan.filters && plan.filters.length > 0 && !lowerSql.includes('where')) {
      errors.push('Intent Validation Error: Filter query requires a WHERE clause.');
    }
    // Prevent unintended aggregation for raw record questions
    if (question) {
      const lowerQ = question.toLowerCase();
      const isRecordLevel =
        lowerQ.includes('which customer') ||
        lowerQ.includes('list all') ||
        lowerQ.includes('show all') ||
        lowerQ.includes('which order');

      if (isRecordLevel && lowerSql.includes('group by') && !lowerSql.includes('customer_id') && !lowerSql.includes('company_name') && !lowerSql.includes('order_id')) {
        errors.push('Intent Validation Error: Unintended aggregation detected for record-level lookup question.');
      } else {
        passedChecks.push('Record-level fidelity verified');
      }
    }
  }

  // 5. Query Plan Filter Verification (Checking all plan.filters in SQL)
  if (plan.filters && plan.filters.length > 0) {
    for (const f of plan.filters) {
      const colLower = f.column.toLowerCase();
      if (!lowerSql.includes(colLower)) {
        errors.push(`Intent Validation Error: Requested filter column "${f.column}" is missing from SQL WHERE clause.`);
        continue;
      }

      if (Array.isArray(f.value)) {
        for (const val of f.value) {
          if (!lowerSql.includes(String(val).toLowerCase())) {
            errors.push(`Intent Validation Error: Filter value "${val}" for column "${f.column}" is missing from SQL.`);
          }
        }
      } else if (f.value !== undefined && f.value !== null) {
        const valStr = String(f.value).toLowerCase();
        if (!lowerSql.includes(valStr)) {
          errors.push(`Intent Validation Error: Filter value "${f.value}" for column "${f.column}" is missing from SQL.`);
        }
      }
    }
    if (errors.length === 0) {
      passedChecks.push(`All ${plan.filters.length} requested filter constraints verified`);
    }
  }

  // 6. Question-to-SQL Semantic Alignment Checks
  if (question) {
    const lowerQ = question.toLowerCase();

    // 6a. Explicit Limit Check
    let requestedLimit = plan.limit;
    const numberWords: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    };
    const wordMatch = lowerQ.match(/\btop\s+(one|two|three|four|five|six|seven|eight|nine|ten)\b/);
    if (wordMatch) {
      requestedLimit = numberWords[wordMatch[1]];
    } else {
      const topMatch =
        lowerQ.match(/\btop\s+(\d+)\b/) ||
        lowerQ.match(/\bfirst\s+(\d+)\b/) ||
        lowerQ.match(/\b(\d+)\s+(customers|orders|products|items|accounts|records|rows)\b/);

      if (topMatch) {
        requestedLimit = parseInt(topMatch[1], 10);
      }
    }

    if (requestedLimit !== undefined && requestedLimit > 0) {
      const limitMatch = lowerSql.match(/\blimit\s+(\d+)\b/);
      if (limitMatch) {
        const actualLimit = parseInt(limitMatch[1], 10);
        if (actualLimit !== requestedLimit) {
          errors.push(
            `Intent Validation Error: Question explicitly requested top ${requestedLimit}, but SQL specifies LIMIT ${actualLimit}. Change LIMIT to ${requestedLimit}.`
          );
        } else {
          passedChecks.push(`LIMIT ${requestedLimit} matches requested top-N`);
        }
      } else if (!lowerSql.includes('limit') && plan.intent !== 'top_n_per_group') {
        errors.push(
          `Intent Validation Error: Question explicitly requested top ${requestedLimit}, but SQL is missing LIMIT ${requestedLimit}.`
        );
      }
    }

    // 6b. Schema Categorical Value Alignment Check
    for (const col of schema.columns) {
      if (col.type === 'string' && col.sampleValues && col.sampleValues.length > 0) {
        for (const sampleVal of col.sampleValues) {
          if (typeof sampleVal === 'string' && sampleVal.length >= 3) {
            const valLower = sampleVal.toLowerCase();
            const wordRegex = new RegExp(`\\b${valLower.replace(/[-_]/g, '[-_]?')}\\b`, 'i');
            if (wordRegex.test(lowerQ)) {
              if (!lowerSql.includes(valLower)) {
                errors.push(
                  `Intent Validation Error: Question explicitly specifies "${sampleVal}" (a categorical value in column "${col.name}"), but the SQL does not filter on "${col.name}". Include "${col.name} = '${sampleVal}'" in your WHERE clause.`
                );
              }
            }
          }
        }
      }
    }

    // 6c. High Support Tickets / Qualification Check
    if (
      (lowerQ.includes('high support tickets') || lowerQ.includes('high ticket') || lowerQ.includes('with support tickets')) &&
      schema.columns.some((c) => c.name === 'support_tickets')
    ) {
      if (!lowerSql.includes('support_tickets')) {
        errors.push(
          'Intent Validation Error: Question specifies high support tickets, but SQL WHERE clause does not filter on support_tickets (e.g. support_tickets >= 5).'
        );
      } else {
        passedChecks.push('Support ticket threshold condition verified');
      }
    }

    // 6d. Churn Status Check (for churned / at-risk questions)
    if (
      (lowerQ.includes('at-risk or churned') || lowerQ.includes('churned or at-risk') || lowerQ.includes('at risk or churned')) &&
      schema.columns.some((c) => c.name === 'churn_status')
    ) {
      if (!lowerSql.includes('churn_status') || !lowerSql.includes('churned') || !lowerSql.includes('at-risk')) {
        errors.push(
          'Intent Validation Error: Question requests At-Risk or Churned customers, but SQL does not filter on both statuses (e.g. churn_status IN (\'Churned\', \'At-Risk\')).'
        );
      } else {
        passedChecks.push('Churn status (At-Risk & Churned) filter verified');
      }
    }

    // 6e. NPS Score Filter Check (e.g. NPS under 6)
    if (
      (lowerQ.includes('nps score under 6') || lowerQ.includes('nps < 6') || lowerQ.includes('nps under 6') || lowerQ.includes('nps below 6')) &&
      schema.columns.some((c) => c.name === 'nps_score')
    ) {
      const hasNpsUnder6 = /nps_score\s*<\s*6/i.test(trimmedSql) || /nps_score\s*<=\s*5/i.test(trimmedSql);
      if (!hasNpsUnder6) {
        errors.push('Intent Validation Error: Question specifies NPS score under 6, but SQL does not filter "nps_score < 6".');
      } else {
        passedChecks.push('NPS score (< 6) filter verified');
      }
    }

    // 6f. Ranking Direction Check
    const wantsDesc = plan.ranking_direction === 'DESC' || lowerQ.includes('top') || lowerQ.includes('highest') || lowerQ.includes('most');
    if (wantsDesc) {
      if (lowerSql.includes('order by') && /\border\s+by\s+[^;]+?\basc\b/i.test(trimmedSql) && !/\bdesc\b/i.test(trimmedSql)) {
        errors.push('Intent Validation Error: Top/highest ranking requests require DESC order, but SQL specifies ASC.');
      } else if (lowerSql.includes('order by')) {
        passedChecks.push('Ranking direction (DESC) verified');
      }
    }
    const wantsAsc = plan.ranking_direction === 'ASC' || lowerQ.includes('bottom') || lowerQ.includes('lowest') || lowerQ.includes('least');
    if (wantsAsc) {
      if (lowerSql.includes('order by') && /\border\s+by\s+[^;]+?\bdesc\b/i.test(trimmedSql)) {
        errors.push('Intent Validation Error: Bottom/lowest ranking requests require ASC order, but SQL specifies DESC.');
      } else if (lowerSql.includes('order by')) {
        passedChecks.push('Ranking direction (ASC) verified');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    passedChecks,
    needsClarification,
    clarificationMessage,
  };
}

/**
 * Validates DuckDB execution results against QueryPlan constraints post-execution.
 * Ensures returned rows adhere to the requested filter constraints, limits, and aggregation granularity.
 */
export function validateExecutionResult(
  rows: Record<string, any>[],
  columns: string[],
  plan: QueryPlan,
  schema: SemanticSchema
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const passedChecks: string[] = [];
  const lowerCols = columns.map((c) => c.toLowerCase());

  // 1. Result Row Count
  if (rows.length === 0 && schema.rowCount > 0 && plan.intent !== 'filter_lookup') {
    errors.push('Execution Result Error: Query returned 0 rows, but dataset contains records.');
  }

  // 1b. Limit Check (for global ranking or overview queries, not per-group partition queries)
  if (plan.intent !== 'top_n_per_group' && plan.limit && rows.length > plan.limit) {
    errors.push(
      `Execution Result Error: Query returned ${rows.length} rows, exceeding requested limit of ${plan.limit}.`
    );
  } else if (plan.intent !== 'top_n_per_group' && plan.limit) {
    passedChecks.push(`Result row count (${rows.length}) within requested limit of ${plan.limit}`);
  }

  // 2. Expected Columns for Top N per group
  if (plan.intent === 'top_n_per_group') {
    if (plan.partition_by && plan.partition_by.length > 0) {
      for (const partCol of plan.partition_by) {
        if (!lowerCols.includes(partCol.toLowerCase())) {
          errors.push(
            `Execution Result Error: Result is missing required partition column "${partCol}". Returned columns: [${columns.join(', ')}].`
          );
        }
      }
    }

    if (plan.item_entity && !lowerCols.includes(plan.item_entity.toLowerCase())) {
      errors.push(
        `Execution Result Error: Result is missing target item column "${plan.item_entity}". Returned columns: [${columns.join(', ')}].`
      );
    }

    // Partition Cardinality Constraint
    if (plan.partition_by && plan.partition_by.length > 0 && (plan.limit === 1 || !plan.limit)) {
      const partColName = plan.partition_by[0].toLowerCase();
      const actualCol = columns.find((c) => c.toLowerCase() === partColName);

      if (actualCol) {
        const seenValues = new Set<any>();
        const duplicates = new Set<any>();

        for (const row of rows) {
          const val = row[actualCol];
          if (val !== undefined && val !== null) {
            if (seenValues.has(val)) {
              duplicates.add(val);
            }
            seenValues.add(val);
          }
        }

        if (duplicates.size > 0) {
          errors.push(
            `Execution Result Error: Constraint violated. Expected at most 1 row per "${actualCol}", but found duplicate entries for: ${Array.from(duplicates).join(', ')}. Ensure "WHERE rank = 1" is applied in outer query.`
          );
        } else {
          passedChecks.push(`1 row per ${actualCol} partition constraint verified`);
        }
      }
    }
  }

  // 3. Row-Level Filter Constraint Verification (Test Group A & B)
  if (plan.filters && plan.filters.length > 0 && rows.length > 0) {
    for (const f of plan.filters) {
      const targetCol = columns.find((c) => c.toLowerCase() === f.column.toLowerCase());
      if (targetCol) {
        for (let rIdx = 0; rIdx < rows.length; rIdx++) {
          const rowVal = rows[rIdx][targetCol];

          if (f.operator === '=') {
            if (String(rowVal).toLowerCase() !== String(f.value).toLowerCase()) {
              errors.push(
                `Execution Result Error: Row ${rIdx + 1} has ${targetCol} = "${rowVal}", violating filter "${targetCol} = ${f.value}".`
              );
              break;
            }
          } else if (f.operator === '<') {
            if (!(Number(rowVal) < Number(f.value))) {
              errors.push(
                `Execution Result Error: Row ${rIdx + 1} has ${targetCol} = ${rowVal}, which is NOT strictly < ${f.value}.`
              );
              break;
            }
          } else if (f.operator === '<=') {
            if (!(Number(rowVal) <= Number(f.value))) {
              errors.push(
                `Execution Result Error: Row ${rIdx + 1} has ${targetCol} = ${rowVal}, which is NOT <= ${f.value}.`
              );
              break;
            }
          } else if (f.operator === '>') {
            if (!(Number(rowVal) > Number(f.value))) {
              errors.push(
                `Execution Result Error: Row ${rIdx + 1} has ${targetCol} = ${rowVal}, which is NOT > ${f.value}.`
              );
              break;
            }
          } else if (f.operator === '>=') {
            if (!(Number(rowVal) >= Number(f.value))) {
              errors.push(
                `Execution Result Error: Row ${rIdx + 1} has ${targetCol} = ${rowVal}, which is NOT >= ${f.value}.`
              );
              break;
            }
          } else if (f.operator === 'IN' && Array.isArray(f.value)) {
            const allowed = f.value.map((v: any) => String(v).toLowerCase());
            if (!allowed.includes(String(rowVal).toLowerCase())) {
              errors.push(
                `Execution Result Error: Row ${rIdx + 1} has ${targetCol} = "${rowVal}", which is not in [${f.value.join(', ')}].`
              );
              break;
            }
          }
        }
      }
    }

    if (errors.length === 0) {
      passedChecks.push('All returned rows satisfy query filter constraints');
    }
  }

  // 4. Aggregation Uniqueness Constraint (Test Group D)
  // E.g. "Show total MRR by plan tier": exactly 1 row per unique plan tier
  if (plan.intent === 'aggregate_by_dimension' && plan.dimensions.length > 0 && rows.length > 0) {
    const primaryDim = columns.find((c) => c.toLowerCase() === plan.dimensions[0].toLowerCase());
    if (primaryDim) {
      const seenDims = new Set<string>();
      const dupDims = new Set<string>();

      for (const row of rows) {
        const val = String(row[primaryDim] ?? '');
        if (seenDims.has(val)) {
          dupDims.add(val);
        }
        seenDims.add(val);
      }

      if (dupDims.size > 0) {
        errors.push(
          `Execution Result Error: Aggregation uniqueness violated. Multiple rows found for category "${primaryDim}": ${Array.from(dupDims).join(', ')}. Must aggregate to exactly 1 row per unique category.`
        );
      } else {
        passedChecks.push(`Exactly 1 row per unique ${primaryDim} verified`);
      }
    }
  }

  // 5. Non-Null Sanity
  if (rows.length > 0 && columns.length > 0) {
    const firstCol = columns[0];
    const allNull = rows.every((r) => r[firstCol] === null || r[firstCol] === undefined);
    if (allNull) {
      warnings.push(`Primary column "${firstCol}" contains all NULL values in output.`);
    } else {
      passedChecks.push('Non-null primary column data integrity verified');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    passedChecks,
  };
}
