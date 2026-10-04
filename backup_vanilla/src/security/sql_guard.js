/**
 * SQL Security Guard & SELECT-Only Validator
 * Enforces strict read-only execution in DuckDB-WASM and prevents destructive operations or injection attacks.
 */

const FORBIDDEN_COMMANDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'GRANT',
  'REVOKE',
  'EXEC',
  'EXECUTE',
  'CALL',
  'MERGE',
  'REPLACE',
  'RENAME',
  'ATTACH',
  'DETACH',
  'PRAGMA',
  'VACUUM',
  'REINDEX',
  'INTO OUTFILE',
  'LOAD_FILE',
  'COPY',
  'EXPORT',
  'INSTALL',
  'LOAD',
  'CHECKPOINT'
];

/**
 * Strips comments and string literals to perform keyword inspection safely
 */
function stripCommentsAndLiterals(sql) {
  // Remove block comments /* ... */
  let clean = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Remove line comments -- ...
  clean = clean.replace(/--.*$/gm, ' ');
  // Remove string literals '...'
  clean = clean.replace(/'(?:''|[^'])*'/g, "''");
  return clean;
}

/**
 * Validates that SQL is strictly SELECT or WITH ... SELECT, and contains no forbidden operations.
 * @param {string} rawSql
 * @param {string[]} [allowedTables] - Optional list of permitted tables in the current session
 * @returns {{ valid: boolean, error?: string, sanitizedSql: string }}
 */
function validateSql(rawSql, allowedTables = null) {
  if (!rawSql || typeof rawSql !== 'string') {
    return { valid: false, error: 'SQL query is empty or invalid.' };
  }

  // Strip markdown code fences if model enclosed in ```sql
  let cleanSql = rawSql
    .replace(/^```(?:sql|duckdb|postgresql)?/gim, '')
    .replace(/```$/gim, '')
    .trim();

  // Strip trailing semicolons
  cleanSql = cleanSql.replace(/;+\s*$/g, '');

  if (!cleanSql) {
    return { valid: false, error: 'Empty SQL query.' };
  }

  // Check for multiple statements (semicolon chaining)
  const stripped = stripCommentsAndLiterals(cleanSql);
  if (stripped.includes(';')) {
    const parts = stripped.split(';').map(p => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      return {
        valid: false,
        error: 'Multiple SQL statements detected. QueryMind permits only single SELECT queries.'
      };
    }
  }

  // Check for forbidden keywords anywhere in the stripped SQL
  const trimmedStripped = stripped.trim();
  for (const cmd of FORBIDDEN_COMMANDS) {
    const regex = new RegExp(`\\b${cmd}\\b`, 'i');
    if (regex.test(trimmedStripped)) {
      return {
        valid: false,
        error: `Security violation: Destructive, mutating, or administrative operation '${cmd}' is strictly forbidden.`
      };
    }
  }

  // Verify the query starts with SELECT or WITH
  const startsWithSelectOrWith = /^(SELECT|WITH)\b/i.test(trimmedStripped);
  if (!startsWithSelectOrWith) {
    return {
      valid: false,
      error: 'Security violation: Only SELECT queries are permitted.'
    };
  }

  // If explicit allowedTables provided, verify no unauthorized system tables
  if (allowedTables && Array.isArray(allowedTables) && allowedTables.length > 0) {
    const lowerAllowed = allowedTables.map(t => t.toLowerCase());
    const tableMatches = trimmedStripped.matchAll(/\b(?:FROM|JOIN)\s+([a-zA-Z0-9_]+)/gi);
    for (const match of tableMatches) {
      const tableName = match[1].toLowerCase();
      // Exclude standard subquery aliases, CTEs, or generate_series/range functions
      const isCteOrFunction = /^(monthly|churned|ranked|cte|sub|t\d+|q\d+|range|generate_series|read_csv|read_csv_auto|read_parquet)$/i.test(tableName);
      if (!isCteOrFunction && !lowerAllowed.includes(tableName)) {
        if (/^(information_schema|duckdb_|sqlite_|pg_|system)/i.test(tableName)) {
          return {
            valid: false,
            error: `Security violation: Reference to unauthorized system table '${tableName}'.`
          };
        }
      }
    }
  }

  return {
    valid: true,
    sanitizedSql: cleanSql
  };
}

// Support both ES Module and CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateSql,
    FORBIDDEN_COMMANDS
  };
}

export { validateSql, FORBIDDEN_COMMANDS };
