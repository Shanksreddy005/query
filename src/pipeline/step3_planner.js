/**
 * Step 3 — Join Planner
 * Generates a concise 1–2 sentence operational query plan for the user-facing reasoning trace.
 */

function buildJoinPlannerPrompt({ tables, joins, question }) {
  return {
    systemPrompt: `You write a concise, plain-English operational execution plan for an analyst.
Rules:
- 1 to 2 sentences maximum.
- Be clear, practical, and operational (e.g. "I will join orders to customers on customer_id, filter to Q3 2024, then SUM amount per customer.").
- Do NOT expose internal reasoning, hidden thoughts, or chain-of-thought tokens.
- Return ONLY the 1-2 sentences with no preamble.`,
    userPrompt: `User question: "${question}"
Tables required: ${tables.join(', ')}
Joins: ${joins.join('; ') || 'None (single table)'}`
  };
}

function parseJoinPlannerResponse(rawText) {
  let clean = rawText
    .replace(/^["']|["']$/g, '')
    .replace(/^Here is the plan:?\s*/i, '')
    .trim();
  return clean || 'Plan query execution across requested tables and compute target metrics.';
}

module.exports = {
  buildJoinPlannerPrompt,
  parseJoinPlannerResponse
};
