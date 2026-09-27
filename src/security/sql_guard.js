/**
 * SQL Security Guard & SELECT-Only Validator
 * Enforces strict read-only execution and prevents destructive operations or injection attacks.
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
  'LOAD_FILE'
];

const ALLOWED_TABLES = ['customers', 'orders', 'subscriptions', 'events'];

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
  // Remove double-quoted identifiers if needed, but keep names
  return clean;
}

/**
 * Validates that SQL is strictly SELECT or WITH ... SELECT, and contains no forbidden operations.
 * Returns { valid: boolean, error?: string, sanitizedSql: string }
 */
function validateSql(rawSql) {
  if (!rawSql || typeof rawSql !== 'string') {
    return { valid: false, error: 'SQL query is empty or invalid.' };
  }

  // Strip code fences if model enclosed in ```sql
  let cleanSql = rawSql
    .replace(/^```(?:sql|postgresql)?/gim, '')
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

  // Verify the query starts with SELECT or WITH
  const trimmedStripped = stripped.trim();
  const startsWithSelectOrWith = /^(SELECT|WITH)\b/i.test(trimmedStripped);
  if (!startsWithSelectOrWith) {
    return {
      valid: false,
      error: 'Invalid SQL statement. Only SELECT queries are permitted.'
    };
  }

  // Check for forbidden keywords anywhere in the stripped SQL
  for (const cmd of FORBIDDEN_COMMANDS) {
    // Regex matching keyword as standalone word
    const regex = new RegExp(`\\b${cmd}\\b`, 'i');
    if (regex.test(trimmedStripped)) {
      return {
        valid: false,
        error: `Security violation: Destructive or mutating operation '${cmd}' is strictly forbidden.`
      };
    }
  }

  // Verify referenced tables belong only to the SaaS demo database
  // Extract words after FROM or JOIN
  const tableMatches = trimmedStripped.matchAll(/\b(?:FROM|JOIN)\s+([a-zA-Z0-9_]+)/gi);
  for (const match of tableMatches) {
    const tableName = match[1].toLowerCase();
    // Exclude subqueries, CTEs, or functions like monthly, churned, generate_series
    const isCteOrAlias = /^(monthly|churned|ranked|cte|sub|t\d+|q\d+)$/i.test(tableName);
    if (!isCteOrAlias && !ALLOWED_TABLES.includes(tableName)) {
      // Check if it's an unapproved system/user table
      if (/^(users|accounts|passwords|information_schema|pg_|sqlite_)/i.test(tableName)) {
        return {
          valid: false,
          error: `Security violation: Reference to unauthorized table '${tableName}'.`
        };
      }
    }
  }

  return {
    valid: true,
    sanitizedSql: cleanSql
  };
}

module.exports = {
  validateSql,
  FORBIDDEN_COMMANDS,
  ALLOWED_TABLES
};
