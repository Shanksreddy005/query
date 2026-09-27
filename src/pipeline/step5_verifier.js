/**
 * Step 5 — Query Verifier
 * Verifies column existence, join correctness, division-by-zero guards, and SELECT-only safety.
 */

const { getSchemaContext, SAAS_SCHEMA } = require('../schema/saas_db');
const { validateSql } = require('../security/sql_guard');

function buildVerifierPrompt(sql) {
  const schemaContext = getSchemaContext();
  return {
    systemPrompt: `You verify PostgreSQL queries against a strict database schema.
Schema:
${schemaContext}

Check:
1. Column names exist in schema
2. Table joins are syntactically valid on foreign keys
3. No ambiguous column references without table alias
4. Division-by-zero risks are handled (e.g. via NULLIF)
5. Query is strictly read-only SELECT

Return ONLY a JSON object matching:
{
  "valid": true or false,
  "issues": ["list of specific issues if any, otherwise empty"],
  "corrected_sql": "corrected PostgreSQL string if minor fixes needed, otherwise null"
}`,
    userPrompt: `Verify this SQL:
${sql}`
  };
}

/**
 * Deterministic schema and safety verifier (runs with or without LLM)
 */
function deterministicVerify(sql) {
  const guardResult = validateSql(sql);
  if (!guardResult.valid) {
    return {
      valid: false,
      issues: [guardResult.error],
      corrected_sql: null
    };
  }

  const issues = [];
  const s = sql.toLowerCase();

  // Check division by zero risk without NULLIF
  if (s.includes('/') && !s.includes('nullif')) {
    // Only warn if divisor looks like an aggregate or expression
    if (/\/\s*(?:sum|count|avg|total)/i.test(s)) {
      issues.push('Potential division-by-zero without NULLIF guard.');
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    corrected_sql: null
  };
}

function parseVerifierResponse(rawText, fallbackSql) {
  try {
    let clean = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);
    return {
      valid: parsed.valid === true,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      corrected_sql: parsed.corrected_sql || null
    };
  } catch (err) {
    // Fall back to deterministic verifier
    return deterministicVerify(fallbackSql);
  }
}

module.exports = {
  buildVerifierPrompt,
  deterministicVerify,
  parseVerifierResponse
};
