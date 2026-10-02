/**
 * DuckDB SQL Executor & Result Formatter
 * Safely executes validated SELECT queries, measures latency, and caps result sets for privacy and display.
 */

import { validateSql } from '../security/sql_guard.js';

export const MAX_CLAUDE_ROWS = 25;
export const MAX_DISPLAY_ROWS = 100;

/**
 * Normalizes any cell value into a displayable string or clean primitive
 * @param {*} cell
 * @returns {string}
 */
export function formatCellValue(cell) {
  if (cell === null || cell === undefined) {
    return 'NULL';
  }
  if (typeof cell === 'bigint') {
    return cell.toString();
  }
  if (cell instanceof Date) {
    return cell.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  }
  if (typeof cell === 'number') {
    return Number.isInteger(cell) ? cell.toString() : cell.toFixed(2);
  }
  return String(cell);
}

/**
 * Executes a SQL query against the local DuckDB connection
 * @param {Object} conn - Active DuckDB connection
 * @param {string} rawSql - User or Claude generated SQL
 * @param {string[]} [allowedTables] - Optional permitted table list
 * @returns {Promise<{
 *   success: boolean,
 *   columns?: string[],
 *   rows?: string[][],
 *   claudeRows?: Object[],
 *   totalRowCount?: number,
 *   displayRowCount?: number,
 *   isCapped?: boolean,
 *   executionTimeMs?: number,
 *   sanitizedSql?: string,
 *   error?: string
 * }>}
 */
export async function executeQuery(conn, rawSql, allowedTables = null) {
  const startTime = performance.now();

  // 1. Client-Side SQL Security Validation
  const guard = validateSql(rawSql, allowedTables);
  if (!guard.valid) {
    return {
      success: false,
      error: guard.error,
      executionTimeMs: Math.round(performance.now() - startTime)
    };
  }

  const sqlToRun = guard.sanitizedSql;

  try {
    // 2. Local DuckDB Execution
    const result = await conn.query(sqlToRun);
    const executionTimeMs = Math.round((performance.now() - startTime) * 10) / 10;

    const rawRows = result.toArray ? result.toArray() : (Array.isArray(result) ? result : []);
    const totalRowCount = rawRows.length;

    // Determine columns
    let columns = [];
    if (result.schema && result.schema.fields) {
      columns = result.schema.fields.map(f => f.name);
    } else if (rawRows.length > 0 && typeof rawRows[0] === 'object') {
      columns = Object.keys(rawRows[0]);
    }

    // 3. Format rows for display (up to MAX_DISPLAY_ROWS)
    const displayRows = rawRows.slice(0, MAX_DISPLAY_ROWS).map(row => {
      if (Array.isArray(row)) {
        return row.map(formatCellValue);
      }
      return columns.map(col => formatCellValue(row[col]));
    });

    // 4. Format capped rows for Claude inspection (up to MAX_CLAUDE_ROWS)
    const claudeRows = rawRows.slice(0, MAX_CLAUDE_ROWS).map(row => {
      const obj = {};
      columns.forEach(col => {
        const val = row[col];
        if (typeof val === 'bigint') {
          obj[col] = Number(val);
        } else if (val instanceof Date) {
          obj[col] = val.toISOString().split('T')[0];
        } else {
          obj[col] = val;
        }
      });
      return obj;
    });

    return {
      success: true,
      columns,
      rows: displayRows,
      claudeRows,
      totalRowCount,
      displayRowCount: displayRows.length,
      isCapped: totalRowCount > MAX_DISPLAY_ROWS,
      executionTimeMs,
      sanitizedSql: sqlToRun
    };
  } catch (err) {
    const executionTimeMs = Math.round((performance.now() - startTime) * 10) / 10;
    return {
      success: false,
      error: err.message || 'Execution error in DuckDB query.',
      executionTimeMs,
      sanitizedSql: sqlToRun
    };
  }
}
