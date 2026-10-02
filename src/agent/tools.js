/**
 * Client-Side Tool Definition for Claude Messages API
 * Claude requests this tool to execute SQL queries.
 * Browser JavaScript validates and executes the query through DuckDB-WASM.
 */

export const RUN_SQL_TOOL = {
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

export const AGENT_TOOLS = [RUN_SQL_TOOL];
