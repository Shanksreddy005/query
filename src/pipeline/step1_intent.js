/**
 * Step 1 — Intent Parser
 * Extracts structured intent JSON from natural-language question.
 */

const { getSchemaContext } = require('../schema/saas_db');

function buildIntentPrompt(userQuestion) {
  const schemaContext = getSchemaContext();
  return {
    systemPrompt: `You extract query intent from natural language into structured JSON.
Schema:
${schemaContext}

Return ONLY a valid JSON object matching this schema:
{
  "entity": "primary table name (customers, orders, subscriptions, or events)",
  "metric": "description of metric to calculate or fields to retrieve",
  "filters": ["array of human-readable or SQL filter conditions"],
  "time_range": "time range if specified, otherwise null",
  "sort": "column and direction to sort, otherwise null",
  "limit": number or null
}
Do NOT include markdown fences, preambles, or conversational commentary. Return raw JSON only.`,
    userPrompt: `User question: "${userQuestion}"`
  };
}

function parseIntentResponse(rawText) {
  try {
    let clean = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);
    return {
      success: true,
      data: {
        entity: parsed.entity || 'customers',
        metric: parsed.metric || 'data records',
        filters: Array.isArray(parsed.filters) ? parsed.filters : [],
        time_range: parsed.time_range || null,
        sort: parsed.sort || null,
        limit: parsed.limit || null
      }
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse intent JSON: ${err.message}`,
      data: {
        entity: 'customers',
        metric: 'general query',
        filters: [],
        time_range: null,
        sort: null,
        limit: null
      }
    };
  }
}

module.exports = {
  buildIntentPrompt,
  parseIntentResponse
};
