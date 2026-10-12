import { ColumnMeta, Dataset } from '../types';

export type ColumnRole = 'dimension' | 'measure' | 'identifier' | 'temporal';

export interface SemanticColumnMeta extends ColumnMeta {
  role: ColumnRole;
  semanticMeaning?: string;
  isNumeric: boolean;
  isCategorical: boolean;
  cardinality: number;
}

export interface SemanticSchema {
  tableName: string;
  datasetName: string;
  rowCount: number;
  columns: SemanticColumnMeta[];
  dimensions: SemanticColumnMeta[];
  measures: SemanticColumnMeta[];
  identifiers: SemanticColumnMeta[];
  temporals: SemanticColumnMeta[];
  columnByName: Map<string, SemanticColumnMeta>;
}

/**
 * Infers semantic role and business meaning of a column.
 */
function inferColumnRole(col: ColumnMeta, totalRows: number): { role: ColumnRole; semanticMeaning: string } {
  const name = col.name.toLowerCase();

  // 1. Temporals (dates, timestamps)
  if (
    col.type === 'date' ||
    name.endsWith('_date') ||
    name.endsWith('_time') ||
    name.endsWith('_at') ||
    name === 'date' ||
    name === 'timestamp' ||
    name === 'year' ||
    name === 'month' ||
    name === 'day'
  ) {
    return { role: 'temporal', semanticMeaning: 'time / date attribute' };
  }

  // 2. Identifiers (primary keys, IDs, unique names)
  if (
    name.endsWith('_id') ||
    name.startsWith('id_') ||
    name === 'id' ||
    (col.uniqueCount === totalRows && col.type === 'string' && totalRows > 5)
  ) {
    return { role: 'identifier', semanticMeaning: 'unique entity identifier' };
  }

  // 3. Measures (numerical metrics that can be aggregated)
  if (col.type === 'number') {
    // Special case: numeric IDs or zip codes or years
    if (name.endsWith('_id') || name.endsWith('zip') || name.endsWith('code')) {
      return { role: 'identifier', semanticMeaning: 'numeric identifier' };
    }
    if (name === 'year') {
      return { role: 'temporal', semanticMeaning: 'calendar year' };
    }

    let meaning = 'numeric metric';
    if (name.includes('sales') || name.includes('revenue') || name.includes('mrr') || name.includes('arr') || name.includes('price')) {
      meaning = 'monetary amount / revenue';
    } else if (name.includes('qty') || name.includes('quantity') || name.includes('unit') || name.includes('volume') || name.includes('sold')) {
      meaning = 'physical volume / units sold';
    } else if (name.includes('profit') || name.includes('margin') || name.includes('gain') || name.includes('net')) {
      meaning = 'net profitability / margin';
    } else if (name.includes('discount')) {
      meaning = 'discount rate / price reduction';
    } else if (name.includes('ticket') || name.includes('issue') || name.includes('score') || name.includes('nps')) {
      meaning = 'performance or service rating score';
    } else if (name.includes('user') || name.includes('count') || name.includes('seat')) {
      meaning = 'user / seat count';
    }

    return { role: 'measure', semanticMeaning: meaning };
  }

  // 4. Dimensions (categorical attributes, groups, geography, status)
  let meaning = 'categorical dimension';
  if (name.includes('region') || name.includes('territory') || name.includes('zone') || name.includes('country') || name.includes('state') || name.includes('city')) {
    meaning = 'geographic territory';
  } else if (name.includes('product') || name.includes('item') || name.includes('sku') || name.includes('merchandise')) {
    meaning = 'product or item entity';
  } else if (name.includes('category') || name.includes('department') || name.includes('segment')) {
    meaning = 'classification category';
  } else if (name.includes('status') || name.includes('churn') || name.includes('stage')) {
    meaning = 'lifecycle or operational status';
  } else if (name.includes('plan') || name.includes('tier') || name.includes('subscription')) {
    meaning = 'pricing or subscription tier';
  } else if (name.includes('industry') || name.includes('vertical')) {
    meaning = 'business vertical or industry';
  } else if (name.includes('customer') || name.includes('company') || name.includes('client') || name.includes('account')) {
    meaning = 'customer or client organization';
  }

  return { role: 'dimension', semanticMeaning: meaning };
}

/**
 * Profiles a dataset's columns into a rich SemanticSchema.
 */
export function profileDatasetSchema(dataset: Dataset): SemanticSchema {
  const semanticColumns: SemanticColumnMeta[] = dataset.columns.map((col) => {
    const { role, semanticMeaning } = inferColumnRole(col, dataset.rowCount);
    return {
      ...col,
      role,
      semanticMeaning,
      isNumeric: col.type === 'number',
      isCategorical: role === 'dimension' || col.type === 'string' || col.type === 'boolean',
      cardinality: col.uniqueCount,
    };
  });

  const dimensions = semanticColumns.filter((c) => c.role === 'dimension');
  const measures = semanticColumns.filter((c) => c.role === 'measure');
  const identifiers = semanticColumns.filter((c) => c.role === 'identifier');
  const temporals = semanticColumns.filter((c) => c.role === 'temporal');

  const columnByName = new Map<string, SemanticColumnMeta>();
  semanticColumns.forEach((c) => {
    columnByName.set(c.name.toLowerCase(), c);
  });

  return {
    tableName: dataset.tableName,
    datasetName: dataset.name,
    rowCount: dataset.rowCount,
    columns: semanticColumns,
    dimensions,
    measures,
    identifiers,
    temporals,
    columnByName,
  };
}

/**
 * Builds a prompt-friendly semantic description of the schema.
 */
export function formatSemanticSchemaPrompt(schema: SemanticSchema): string {
  const formatCols = (cols: SemanticColumnMeta[]) =>
    cols
      .map((c) => {
        let line = `  - "${c.name}" (${c.type}, role: ${c.role.toUpperCase()}) -> ${c.semanticMeaning || ''}`;
        if (c.sampleValues && c.sampleValues.length > 0) {
          line += ` [Distinct: ${c.cardinality}, Samples: ${c.sampleValues.slice(0, 4).map((v) => JSON.stringify(v)).join(', ')}]`;
        }
        if (c.min !== undefined && c.max !== undefined) {
          line += ` [Range: ${c.min} to ${c.max}]`;
        }
        return line;
      })
      .join('\n');

  return `
TABLE: "${schema.tableName}" (alias: "dataset")
TOTAL ROWS: ${schema.rowCount}

MEASURES / METRICS (Aggregatable Numbers):
${formatCols(schema.measures) || '  (none)'}

DIMENSIONS (Grouping & Filtering Categories):
${formatCols(schema.dimensions) || '  (none)'}

IDENTIFIERS (Unique Entity Keys):
${formatCols(schema.identifiers) || '  (none)'}

TEMPORAL / DATES:
${formatCols(schema.temporals) || '  (none)'}
`.trim();
}
