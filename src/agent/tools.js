/**
 * Client-Side Tool Definitions for all 4 Providers
 * Anthropic, OpenAI, Google Gemini, and Groq.
 *
 * All four providers share ONE logical QueryMind tool: `run_sql`.
 * The browser agent controller validates and executes the query through DuckDB-WASM locally.
 * Neither model executes SQL directly.
 */

import { PROVIDERS } from './models.js';

export const TOOL_NAME = 'run_sql';
export const TOOL_DESCRIPTION = 'Execute a read-only DuckDB SQL query against the user\'s local dataset in the browser. Always use table names and columns from the provided schema. Returns column names, row counts, and capped result rows.';

/**
 * Anthropic Claude Native Tool Definition
 */
export const ANTHROPIC_RUN_SQL_TOOL = {
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
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
 */
export const OPENAI_RESPONSES_RUN_SQL_TOOL = {
  type: 'function',
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
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
export const OPENAI_AGENT_TOOLS = OPENAI_RESPONSES_TOOLS;

/**
 * Google Gemini Native Tool Definition
 * Formatted for Google Generative Language API functionDeclarations
 */
export const GEMINI_RUN_SQL_TOOL = {
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
  parameters: {
    type: 'OBJECT',
    properties: {
      query: {
        type: 'STRING',
        description: 'The DuckDB SQL SELECT query to execute locally in the browser.'
      }
    },
    required: ['query']
  }
};

export const GEMINI_TOOLS = [
  {
    functionDeclarations: [GEMINI_RUN_SQL_TOOL]
  }
];
export const GEMINI_AGENT_TOOLS = GEMINI_TOOLS;

/**
 * Groq Cloud Native Tool Definition
 * Uses standard OpenAI-compatible Chat Completions function calling format
 */
export const GROQ_RUN_SQL_TOOL = {
  type: 'function',
  function: {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
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
  }
};

export const GROQ_TOOLS = [GROQ_RUN_SQL_TOOL];
export const GROQ_AGENT_TOOLS = GROQ_TOOLS;

/**
 * Returns native tool specifications for any of the 4 providers
 * @param {string} provider
 * @returns {Array<Object>}
 */
export function getToolsForProvider(provider) {
  switch (provider) {
    case PROVIDERS.GEMINI:
      return GEMINI_TOOLS;
    case PROVIDERS.GROQ:
      return GROQ_TOOLS;
    case PROVIDERS.OPENAI:
      return OPENAI_RESPONSES_TOOLS;
    case PROVIDERS.ANTHROPIC:
    default:
      return ANTHROPIC_TOOLS;
  }
}
