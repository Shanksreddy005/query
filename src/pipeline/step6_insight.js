/**
 * Step 6 — Insight Narrator
 * Reads query results summary and writes ONE sharp, specific business insight in exactly 2 sentences.
 */

function buildInsightPrompt({ question, columns, rows, rowCount }) {
  // Format summary of first few rows for model context
  let summary = `Total rows: ${rowCount}.\nColumns: ${columns.join(', ')}.\nData preview:\n`;
  const previewRows = rows.slice(0, 6);
  previewRows.forEach((row, i) => {
    summary += `Row ${i + 1}: ${row.join(' | ')}\n`;
  });

  return {
    systemPrompt: `You are an elite data analyst providing executive takeaways.
Rules:
1. Write ONE sharp, specific business insight in exactly 2 sentences.
2. Use concrete numbers from the data summary.
3. Use clear business and product analytics terminology (MRR, churn, conversion, revenue).
4. No hallucinations or unsupported claims.
5. Return ONLY the insight text — no preamble, no greeting, no quotes.`,
    userPrompt: `Question: "${question}"
Data Summary:
${summary}`
  };
}

function cleanInsightResponse(rawText) {
  let clean = rawText
    .replace(/^["']|["']$/g, '')
    .replace(/^Insight:?\s*/i, '')
    .trim();
  return clean;
}

module.exports = {
  buildInsightPrompt,
  cleanInsightResponse
};
