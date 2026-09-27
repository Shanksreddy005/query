/**
 * Step 4 — SQL Generator
 * Generates production-ready PostgreSQL with inline clause comments.
 */

const { getSchemaContext } = require('../schema/saas_db');

function buildSqlGenPrompt({ question, joinPlan }) {
  const schemaContext = getSchemaContext();
  return {
    systemPrompt: `You are a PostgreSQL expert.
Database Schema:
${schemaContext}

Rules:
1. SELECT only. Never generate INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, or CREATE.
2. Reference ONLY existing tables and columns from the schema above.
3. Include brief, helpful inline SQL comments (-- comment) explaining key clauses.
4. Output raw SQL only. Do NOT include markdown fences (\`\`\`sql ... \`\`\`), greetings, or explanations.
5. Use proper PostgreSQL syntax (e.g. INTERVAL, DATE_PART, DATE_TRUNC, RANK() OVER, etc.).`,
    userPrompt: `Query plan: ${joinPlan}
Write a PostgreSQL query answering: "${question}"`
  };
}

function cleanSqlResponse(rawText) {
  let clean = rawText
    .replace(/^```(?:sql|postgresql)?/gim, '')
    .replace(/```$/gim, '')
    .trim();
  return clean;
}

module.exports = {
  buildSqlGenPrompt,
  cleanSqlResponse
};
