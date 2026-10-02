/**
 * Client-Side Tool Definitions for Anthropic & OpenAI
 * Both models request the client-side `run_sql` tool to execute queries.
 * The browser agent controller validates and executes the query through DuckDB-WASM locally.
 * Neither model executes SQL directly.
 */

import { PROVIDERS } from './models.js';

/**
 * Anthropic Claude Native Tool Definition
 */
export const ANTHROPIC_RUN_SQL_TOOL = {
  name: 'run_sql',
  description: 'Execute a read-only SQL SELECT query against the local DuckDB table in the browser. Always use table names and columns from the provided schema. Returns column names, row counts, and capped result rows.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The DuckDB SQL SELECT query to execute locally in the browser.'
      }
    },
    required: ['query']
  }
};

export const ANTHROPIC_TOOLS = [ANTHROPIC_RUN_SQL_TOOL];
export const AGENT_TOOLS = ANTHROPIC_TOOLS; // Backward compatibility alias
export const RUN_SQL_TOOL = ANTHROPIC_RUN_SQL_TOOL; // Backward compatibility alias

/**
 * OpenAI Responses API Native Tool Definition
 * Adheres to OpenAI Responses API tool specification (type: "function" with top-level name & parameters).
 */
export const OPENAI_RESPONSES_RUN_SQL_TOOL = {
  type: 'function',
  name: 'run_sql',
  description: 'Execute a read-only SQL SELECT query against the local DuckDB table in the browser. Always use table names and columns from the provided schema. Returns column names, row counts, and capped result rows.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The DuckDB SQL SELECT query to execute locally in the browser.'
      }
    },
    required: ['query']
  }
};

export const OPENAI_RESPONSES_TOOLS = [OPENAI_RESPONSES_RUN_SQL_TOOL];

/**
 * Returns native tool specifications for the selected provider
 * @param {string} provider
 * @returns {Array<Object>}
 */
export function getToolsForProvider(provider) {
  if (provider === PROVIDERS.OPENAI) {
    return OPENAI_RESPONSES_TOOLS;
  }
  return ANTHROPIC_TOOLS;
}
