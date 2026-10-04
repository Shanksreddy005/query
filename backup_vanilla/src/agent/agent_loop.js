/**
 * Client-Side Tool-Based Agent Loop
 * Coordinates AI reasoning, client-side SQL execution via DuckDB-WASM, and automatic self-correction.
 * Consumes normalized events from providerManager with zero provider-specific conditionals.
 * Hard capped at MAX_AGENT_ROUNDS = 5.
 */

import { providerManager, NormalizedConversation } from './provider_manager.js';
import { MAX_AGENT_ROUNDS } from './models.js';
import { buildSystemPrompt } from './prompts.js';
import { executeQuery } from '../duckdb/executor.js';

export { MAX_AGENT_ROUNDS };

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
  const conversation = new NormalizedConversation(q);

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

    // Normalized turn execution across active AI provider (Claude or OpenAI)
    const turnEvent = await providerManager.sendTurn(conversation, systemPrompt);

    // If model requested tool execution:
    if (turnEvent.type === 'tool_call' && turnEvent.toolName === 'run_sql') {
      const generatedSql = turnEvent.arguments?.query || '';
      finalSql = generatedSql;
      onSqlGenerated(generatedSql);

      // Process Trace Step 5: Running SQL locally in DuckDB
      onTraceStep(4, 'Running SQL locally in DuckDB', `Executing verified query against in-memory table...`);

      // CLIENT-SIDE EXECUTION IN DUCKDB-WASM
      const execResult = await executeQuery(conn, generatedSql, [datasetInfo.tableName]);

      if (execResult.success) {
        lastSuccessfulResults = execResult;

        // Process Trace Step 6: Checking results
        onTraceStep(5, 'Checking the results', `Retrieved ${execResult.totalRowCount} row(s) in ${execResult.executionTimeMs}ms`);

        // Send capped results back to AI model
        conversation.addToolResult({
          toolCallId: turnEvent.toolCallId,
          toolName: 'run_sql',
          isError: false,
          content: JSON.stringify({
            status: 'success',
            execution_time_ms: execResult.executionTimeMs,
            total_rows: execResult.totalRowCount,
            is_capped: execResult.isCapped,
            columns: execResult.columns,
            sample_rows: execResult.aiRows || execResult.claudeRows
          })
        });
      } else {
        // SQL ERROR CORRECTION LOOP
        onTraceStep(4, 'Correcting SQL query', `DuckDB error: ${execResult.error}. Sending error context to model for self-correction...`);

        conversation.addToolResult({
          toolCallId: turnEvent.toolCallId,
          toolName: 'run_sql',
          isError: true,
          content: `DuckDB execution failed with error: ${execResult.error}. Please inspect the table schema and column names, correct the SQL query, and call run_sql again.`
        });
      }
    } else if (turnEvent.type === 'final') {
      // Model provided final analytical narrative
      finalAnswer = turnEvent.text || '';
      break;
    } else {
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
