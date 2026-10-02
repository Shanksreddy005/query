# QueryMind — Client-Side Architecture Specification

## 1. Executive Summary

QueryMind is a 100% client-side, browser-native Natural Language to SQL analytics agent.

**Core Architectural Tenets:**
1. **Zero Application Backend:** No server, database, or serverless compute processes the user's data. QueryMind is deployable as static HTML, CSS, and JavaScript.
2. **Local Analytical Engine:** DuckDB-WASM runs locally inside a browser Web Worker, ingesting user-uploaded CSV files into an in-memory virtual filesystem and executing real SQL queries directly on the client machine.
3. **Bring Your Own Key (BYOK):** The user supplies their Anthropic Claude API key, which is kept exclusively in runtime memory (JavaScript closure) and never persisted to browser storage.
4. **Data Privacy Guarantee:**
   > **The full uploaded dataset remains local. Only explicitly permitted AI context — user question, schema metadata, limited sample rows, SQL/tool interactions, and capped query results — may be sent to Anthropic.**
5. **Client-Side Tool-Based Agent Loop:** Claude functions as an analytical query planner. Claude requests the `run_sql` tool; browser JavaScript validates and executes the query through DuckDB-WASM locally, returning capped results or execution errors back to Claude for verification or self-correction (hard capped at `MAX_AGENT_ROUNDS = 5`).

```
                    ┌───────────────────────────────────┐
                    │         QueryMind Browser UI       │
                    │    (HTML + CSS + Vanilla JS)      │
                    └─────────────────┬─────────────────┘
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            │                                                   │
            ▼                                                   ▼
 ┌───────────────────────┐                           ┌─────────────────────┐
 │     DuckDB-WASM       │                           │  Claude API (BYOK)  │
 │  Browser Web Worker   │                           │ Anthropic /messages │
 │ (Virtual Filesystem)  │                           │ direct CORS request │
 └──────────┬────────────┘                           └──────────┬──────────┘
            │                                                   │
            │ Local SQL Execution                               │ Tool Call:
            │ (Full dataset stays local)                        │ run_sql({query})
            │                                                   │
            └─────────────────────────┬─────────────────────────┘
                                      │
                                      ▼
                       ┌─────────────────────────────┐
                       │    Agent Controller Loop    │
                       │  - MAX_AGENT_ROUNDS = 5     │
                       │  - Strict SELECT SQL Guard  │
                       │  - Auto Error Correction    │
                       │  - MAX_CLAUDE_ROWS = 25     │
                       │  - MAX_DISPLAY_ROWS = 100   │
                       │  - Business Insight         │
                       └─────────────────────────────┘
```

---

## 2. Component Breakdown

### 2.1 Browser UI (`index.html`, `src/ui/`)
- **BYOK Modal / Key Manager:** Password input with show/hide toggle. Validates key via 1-token probe. Stored strictly in memory closure. "Clear API Key" wipes credentials immediately.
- **Dataset Dropzone & Metadata Banner:** Drag-and-drop CSV parser. Shows table name, row count, column count, and inferred DuckDB types.
- **Privacy Guarantee Card:** Visual status indicators verifying local CSV parsing, local DuckDB-WASM SQL execution, and zero backend transmission.
- **Process Trace:** 6-stage operational trace with status icons (`waiting` → `running` → `done`), vertical connector, and typewriter animation.
- **Generated SQL Card:** Monospace JetBrains Mono syntax highlighting with pure-text clipboard copy and engine badge (`DuckDB-WASM · Local`).
- **Results Table:** Displays up to `MAX_DISPLAY_ROWS = 100`, execution time in milliseconds, formatted numbers and dates, and null handling.
- **AI Insight Card:** Executive business takeaway synthesized by Claude based on returned query rows.
- **Sidebar:** Dynamic dataset schema explorer with sample rows preview and recent query history (in-memory only).

### 2.2 Local Analytical Database (`src/duckdb/`)
- **`init.js`**: Initializes `@duckdb/duckdb-wasm` using `selectBundle()`, creates worker blob, instantiates `AsyncDuckDB`, and manages database connection pool.
- **`csv_loader.js`**: Reads client `File` or `ArrayBuffer`, mounts it into DuckDB virtual filesystem via `registerFileBuffer()`, sanitizes table name, and executes:
  ```sql
  CREATE OR REPLACE TABLE dataset_table AS SELECT * FROM read_csv_auto('dataset.csv', header=true);
  ```
- **`schema.js`**: Extracts column names and inferred types via `DESCRIBE <table_name>`, fetches 5–10 representative sample rows via `SELECT * ... LIMIT 5`, and formats the schema context.
- **`executor.js`**: Executes validated SQL queries, converts Apache Arrow record batches into JavaScript arrays, measures latency via `performance.now()`, and enforces `MAX_DISPLAY_ROWS` (100) and `MAX_CLAUDE_ROWS` (25).

### 2.3 SQL Security Guard (`src/security/sql_guard.js`)
- Enforces strictly read-only operations.
- Rejects mutating/destructive commands: `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`.
- Rejects administrative and filesystem commands: `COPY`, `EXPORT`, `INSTALL`, `LOAD`, `ATTACH`, `DETACH`, `PRAGMA`, `CALL`.
- Blocks statement chaining (semicolon injection).
- Permits CTEs (`WITH ... SELECT ...`).

### 2.4 Claude Agent & Client-Side Tool Loop (`src/agent/`)
- **`claude_client.js`**: Direct browser `fetch` to Anthropic Messages API (`https://api.anthropic.com/v1/messages`) utilizing the official CORS header `anthropic-dangerous-direct-browser-access: true`.
  - Primary Model: `claude-sonnet-5-5`
  - Fast / Low-Cost Model: `claude-haiku-4-5`
- **`tools.js`**: Declares client-side `run_sql` tool definition:
  ```json
  {
    "name": "run_sql",
    "description": "Execute a read-only DuckDB SQL query against the local dataset table.",
    "input_schema": {
      "type": "object",
      "properties": {
        "query": { "type": "string", "description": "The SQL SELECT statement to execute." }
      },
      "required": ["query"]
    }
  }
  ```
- **`prompts.js`**: Formulates system instructions with dynamic schema injection, 5 sample rows, current date anchor, and 2-sentence insight instructions.
- **`agent_loop.js`**: Coordinates the conversational turns:
  1. Claude requests `tool_use: run_sql`.
  2. Browser validates SQL using `sql_guard.js`.
  3. DuckDB-WASM executes query locally.
  4. If DuckDB reports an error, browser returns `tool_result` with `is_error: true`. Claude receives error and self-corrects the query.
  5. If query succeeds, browser returns capped rows (`MAX_CLAUDE_ROWS = 25`) as `tool_result`.
  6. Claude generates the final business insight text.
  7. Hard termination at `MAX_AGENT_ROUNDS = 5`.

---

## 3. Data Flow & Security Boundary

```
User Browser
┌──────────────────────────────────────────────────────────────┐
│  CSV File (Local Disk)                                       │
│    │                                                         │
│    ▼ FileReader (in-memory ArrayBuffer)                      │
│  DuckDB-WASM (Virtual Filesystem in Web Worker)              │
│    ├── Full Dataset (Stays 100% in browser)                  │
│    ├── Local SQL Execution (Native WebAssembly)              │
│                                                              │
│  Context Prepared for Claude:                                │
│    ├── User Natural Language Question                        │
│    ├── Schema (Table & Column Names, Inferred Types)         │
│    ├── 5 Sample Rows                                         │
│    └── Capped Query Results (Max 25 Rows)                    │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTPS POST /v1/messages
                               │ Header: anthropic-dangerous-direct-browser-access: true
                               │ Header: x-api-key: [Memory-Only BYOK Key]
                               ▼
                    ┌─────────────────────┐
                    │ Anthropic Cloud API │
                    │ (Claude LLM Engine) │
                    └─────────────────────┘
```

---

## 4. UI States

| State | Name | Description |
|---|---|---|
| State 1 | `API_KEY_REQUIRED` | Initial modal prompting user for Anthropic API key. CSV uploader locked. |
| State 2 | `API_KEY_CONFIGURED` | Key verified via probe request. Held in memory only. CSV uploader unlocked. |
| State 3 | `UPLOAD_CSV` | Drag-and-drop zone ready for `.csv` file. Option for bundled Demo Mode. |
| State 4 | `LOADING_DUCKDB` | Web Worker and Wasm bundles initializing. |
| State 5 | `ANALYZING_DATASET` | `read_csv_auto` running; schema and sample rows being extracted. |
| State 6 | `DATASET_READY` | Table badge, column list, row count, and sample preview visible. |
| State 7 | `WAITING_FOR_QUESTION` | Query input enabled with dynamic dataset suggestions. |
| State 8 | `AGENT_RUNNING` | 6-step animated process trace active. Claude planning query. |
| State 9 | `EXECUTING_SQL` | DuckDB-WASM executing `run_sql` locally. |
| State 10 | `RESULTS_READY` | Table rendered, highlighted SQL card displayed, AI insight shown. |
| State 11 | `ERROR` | Human-readable explanation with self-correction feedback. |
| State 12 | `KEY_CLEARED` | Key removed from memory; application reset to State 1. |
