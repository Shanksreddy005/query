/**
 * Step 2 — Schema Mapper
 * Maps intent JSON to exact schema references and identifies necessary joins.
 */

const { getSchemaContext } = require('../schema/saas_db');

function buildSchemaMapperPrompt(intentData) {
  const schemaContext = getSchemaContext();
  return {
    systemPrompt: `You map query intent to exact schema tables, columns, and foreign key joins.
Schema:
${schemaContext}

Return ONLY a valid JSON object matching:
{
  "tables": ["array of table names needed from schema"],
  "joins": ["array of exact join clauses needed, e.g. orders JOIN customers ON customers.id = orders.customer_id"],
  "reason_for_each_join": "concise explanation of why the tables must be joined"
}
Rules:
- Reference ONLY tables and columns from the schema.
- Foreign keys: orders.customer_id -> customers.id, subscriptions.customer_id -> customers.id, events.customer_id -> customers.id.
- Return raw JSON only, no markdown code blocks.`,
    userPrompt: `Given intent: ${JSON.stringify(intentData, null, 2)}`
  };
}

function parseSchemaMapperResponse(rawText) {
  try {
    let clean = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);
    return {
      success: true,
      data: {
        tables: Array.isArray(parsed.tables) ? parsed.tables : ['customers'],
        joins: Array.isArray(parsed.joins) ? parsed.joins : [],
        reason_for_each_join: parsed.reason_for_each_join || 'Direct lookup'
      }
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse schema mapper JSON: ${err.message}`,
      data: {
        tables: ['customers'],
        joins: [],
        reason_for_each_join: 'Default lookup'
      }
    };
  }
}

module.exports = {
  buildSchemaMapperPrompt,
  parseSchemaMapperResponse
};
