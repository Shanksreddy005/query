/**
 * Client-Side Tool-Based Agent Loop
 * Coordinates Claude reasoning, client-side SQL execution via DuckDB-WASM, and automatic self-correction.
 * Hard capped at MAX_AGENT_ROUNDS = 5.
 */

import { callClaudeMessages } from './claude_client.js';
import { AGENT_TOOLS } from './tools.js';
import { buildSystemPrompt } from './prompts.js';
import { executeQuery } from '../duckdb/executor.js';

export const MAX_AGENT_ROUNDS = 5;

/**
 * Runs the full natural-language to SQL analytical loop
 * @param {Object} params
 * @param {string} params.question - The natural language query from the user
 * @param {Object} params.conn - Active DuckDB connection
 * @param {Object} params.datasetInfo - { tableName, columns, sampleRows, totalRows }
 * @param {Function} [params.onTraceStep] - Callback for user-facing process trace updates: (stepIndex, label, detail) => void
 * @param {Function} [params.onSqlGenerated] - Callback when SQL is generated: (sql) => void
 * @returns {Promise<{
 *   success: boolean,
 *   sql?: string,
 *   results?: Object,
 *   insight?: string,
 *   roundsUsed: number,
 *   error?: string
 * }>}
 */
export async function runAgentLoop({
  question,
  conn,
  datasetInfo,
  onTraceStep = () => {},
  onSqlGenerated = () => {}
}) {
  const q = (question || '').trim();
  if (!q) {
    return { success: false, error: 'Question is empty. Please enter an analytical question.' };
  }

  // 1. Process Trace Step 1: Understanding question
  onTraceStep(0, 'Understanding your question', `Analyzing intent for metrics, dimensions, and filters...`);

  // 2. Process Trace Step 2: Inspecting schema
  onTraceStep(1, 'Inspecting the dataset schema', `Target table "${datasetInfo.tableName}" (${datasetInfo.columns.length} columns, ${datasetInfo.totalRows.toLocaleString()} rows)`);

  const systemPrompt = buildSystemPrompt(datasetInfo);

  // Initialize conversation history for this query
  const messages = [
    { role: 'user', content: q }
  ];

  let currentRound = 0;
  let finalSql = null;
  let lastSuccessfulResults = null;
  let finalAnswer = '';

  // 3. Process Trace Step 3: Planning SQL
  onTraceStep(2, 'Planning the SQL query', `Formulating analytical strategy for DuckDB...`);

  while (currentRound < MAX_AGENT_ROUNDS) {
    currentRound++;

    // Process Trace Step 4: Generating SQL
    onTraceStep(3, 'Generating SQL', `Synthesizing DuckDB SQL query (Turn ${currentRound}/${MAX_AGENT_ROUNDS})...`);

    // Call Anthropic Messages API
    const response = await callClaudeMessages({
      system: systemPrompt,
      tools: AGENT_TOOLS,
      messages: messages
    });

    const assistantContent = response.content || [];
    messages.push({ role: 'assistant', content: assistantContent });

    // Look for tool_use blocks
    const toolUseBlocks = assistantContent.filter(b => b.type === 'tool_use' && b.name === 'run_sql');
    const textBlocks = assistantContent.filter(b => b.type === 'text');

    if (textBlocks.length > 0) {
      finalAnswer += textBlocks.map(b => b.text).join('\n\n');
    }

    // If Claude called the client-side run_sql tool:
    if (toolUseBlocks.length > 0) {
      const toolUse = toolUseBlocks[0];
      const generatedSql = toolUse.input?.query || '';
      finalSql = generatedSql;
      onSqlGenerated(generatedSql);

      // Process Trace Step 5: Running SQL locally in DuckDB
      onTraceStep(4, 'Running SQL locally in DuckDB', `Executing verified query against in-memory table...`);

      // CLIENT-SIDE EXECUTION
      const execResult = await executeQuery(conn, generatedSql, [datasetInfo.tableName]);

      if (execResult.success) {
        lastSuccessfulResults = execResult;

        // Process Trace Step 6: Checking results
        onTraceStep(5, 'Checking the results', `Retrieved ${execResult.totalRowCount} row(s) in ${execResult.executionTimeMs}ms`);

        // Send capped results back to Claude
        messages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({
                status: 'success',
                execution_time_ms: execResult.executionTimeMs,
                total_rows: execResult.totalRowCount,
                is_capped: execResult.isCapped,
                columns: execResult.columns,
                sample_rows: execResult.claudeRows
              })
            }
          ]
        });
      } else {
        // SQL ERROR CORRECTION LOOP
        onTraceStep(4, 'Correcting SQL query', `DuckDB error: ${execResult.error}. Sending error context to Claude for self-correction...`);

        messages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              is_error: true,
              content: `DuckDB execution failed with error: ${execResult.error}. Please inspect the table schema and column names, correct the SQL query, and call run_sql again.`
            }
          ]
        });
      }
    } else {
      // Claude produced a final text response without requesting another tool call
      break;
    }
  }

  if (currentRound >= MAX_AGENT_ROUNDS && !lastSuccessfulResults) {
    return {
      success: false,
      error: `I reached the maximum analysis steps (${MAX_AGENT_ROUNDS} rounds) without completing execution. Please refine your question or simplify the query.`,
      roundsUsed: currentRound
    };
  }

  // Extract insight from finalAnswer or synthesize takeaway
  let insight = finalAnswer.trim();
  const insightMatch = insight.match(/(?:AI\s*Business\s*Insight|Insight|Takeaway):\s*([\s\S]*?)$/i);
  if (insightMatch) {
    insight = insightMatch[1].trim();
  }

  // Fallback insight if empty
  if (!insight && lastSuccessfulResults) {
    insight = `Analysis executed successfully, returning ${lastSuccessfulResults.totalRowCount} row(s) in ${lastSuccessfulResults.executionTimeMs}ms.`;
  }

  return {
    success: true,
    sql: finalSql || lastSuccessfulResults?.sanitizedSql,
    results: lastSuccessfulResults,
    insight: insight,
    fullText: finalAnswer,
    roundsUsed: currentRound
  };
}
