# QueryMind — Client-Side Architecture Specification

## 1. Executive Summary

QueryMind is a 100% client-side, browser-native Natural Language to SQL analytics agent.

**Core Architectural Tenets:**
1. **Zero Application Backend:** No server, database, or serverless compute processes the user's data. QueryMind is deployable as pure static HTML, CSS, and JavaScript (`dist/`).
2. **Local Analytical Engine:** DuckDB-WASM runs locally inside a browser Web Worker, ingesting user-uploaded CSV files into an in-memory virtual filesystem (`memfs`) and executing real SQL queries directly on the client machine.
3. **Four-Provider Bring Your Own Key (BYOK):** The user supplies API keys for their choice of:
   - **Google Gemini:** Google AI Studio (Free Tier for supported models/rate limits)
   - **Groq Cloud:** Groq Console (Free Developer Tier with supported open models)
   - **Anthropic Claude:** Direct browser CORS via `anthropic-dangerous-direct-browser-access`
   - **OpenAI:** Direct browser CORS via Responses API
   
   *(Note: Free tiers and rate limits are set by the respective providers and subject to change).*
   All keys are kept exclusively in runtime memory (JavaScript closures) and are never persisted to browser storage.
4. **Data Privacy Guarantee:**
   > **The full uploaded dataset remains local. Only explicitly permitted AI context — user question, schema metadata, limited sample rows, SQL/tool interactions, and capped query results — may be sent to the configured AI provider (Google Gemini, Groq, Anthropic, or OpenAI).**
5. **Client-Side Tool-Based Agent Loop:** The AI model functions strictly as an analytical query planner. The model requests the logical `run_sql` tool; browser JavaScript validates and executes the query through DuckDB-WASM locally, returning capped results or execution errors back to the model for verification or self-correction (hard capped at `MAX_AGENT_ROUNDS = 5`).
6. **User-Controlled Fallback:** Optional fallback (Default: OFF). If enabled, QueryMind only falls back to secondary providers for which the user has explicitly entered an API key when a transient failure (rate limit, quota exceeded, 5xx server error) occurs.

```
                    ┌───────────────────────────────────┐
                    │         QueryMind Browser UI       │
                    │    (HTML + CSS + Vanilla JS)      │
                    └─────────────────┬─────────────────┘
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            │                                                   │
            ▼                                                   ▼
 ┌───────────────────────┐                        ┌───────────────────────────────┐
 │     DuckDB-WASM       │                        │       Provider Manager        │
 │  Browser Web Worker   │                        │ ┌──────────┬──────┬─────────┬───────┐ │
 │ (Virtual Filesystem)  │                        │ │  Gemini  │ Groq │ Claude  │OpenAI │ │
 └──────────┬────────────┘                        │ └────┬─────┴──┬───┴────┬────┴───┬───┘ │
            │                                     └──────┼────────┼────────┼────────┼─────┘
            │ Local SQL Execution                        │        │        │        │
            │ (Full dataset stays local)                 ▼        ▼        ▼        ▼
            │                                        Google AI   Groq    Anthropic OpenAI
            │                                         Studio    Cloud     Messages Responses
            │                                            │        │        │        │
            └─────────────────────────┬──────────────────┴────────┴────────┴────────┘
                                      │ Tool Call: run_sql({query})
                                      ▼
                       ┌─────────────────────────────┐
                       │    Agent Controller Loop    │
                       │  - Provider-Neutral Events  │
                       │  - Strict SELECT SQL Guard  │
                       │  - Auto Error Correction    │
                       │  - MAX_AGENT_ROUNDS = 5     │
                       │  - MAX_AI_ROWS = 25         │
                       │  - MAX_DISPLAY_ROWS = 100   │
                       │  - Business Insight         │
                       └─────────────────────────────┘
```

---

## 2. Component Breakdown

### 2.1 Browser UI (`index.html`, `src/ui/`)
- **BYOK Modal / Key Manager (`api_key_modal.js`):** 4-provider card selector grid (`gemini`, `groq`, `anthropic`, `openai`) with tier badges (`Free Tier`, `Free Developer Tier`, `BYOK`), provider-specific key inputs with show/hide toggles, model selector, validation probes, memory-only key management, and optional fallback configuration toggle (Default: OFF).
- **Dataset Dropzone & Metadata Banner:** Drag-and-drop CSV parser. Shows table name, row count, column count, and inferred DuckDB types.
- **Privacy Guarantee Card:** Visual status indicators verifying local CSV parsing, local DuckDB-WASM SQL execution, and zero backend transmission.
- **Process Trace:** 6-stage operational trace with status icons (`waiting` → `running` → `done`), vertical connector, and real-time execution animation.
- **Generated SQL Card:** Monospace JetBrains Mono syntax highlighting with pure-text clipboard copy and engine badge (`DuckDB-WASM · Local`).
- **Results Table:** Displays up to `MAX_DISPLAY_ROWS = 100`, execution time in milliseconds, formatted numbers and dates, and null handling.
- **AI Insight Card:** Executive business takeaway synthesized by the active model based on returned query rows.
- **Sidebar:** Dynamic dataset schema explorer with sample rows preview and recent query history (in-memory only).

### 2.2 Local Analytical Database (`src/duckdb/`)
- **`init.js`**: Initializes `@duckdb/duckdb-wasm` using `selectBundle()`, creates worker blob, instantiates `AsyncDuckDB`, and manages database connection pool.
- **`csv_loader.js`**: Reads client `File` or `ArrayBuffer`, mounts it into DuckDB virtual filesystem via `registerFileBuffer()`, sanitizes table name, and executes:
  ```sql
  CREATE OR REPLACE TABLE dataset_table AS SELECT * FROM read_csv_auto('dataset.csv', header=true);
  ```
- **`schema.js`**: Extracts column names and inferred types via `DESCRIBE <table_name>`, fetches 5–10 representative sample rows via `SELECT * ... LIMIT 5`, and formats the schema context.
- **`executor.js`**: Executes validated SQL queries, converts Apache Arrow record batches into JavaScript arrays, measures latency via `performance.now()`, and enforces `MAX_DISPLAY_ROWS` (100) and `MAX_AI_ROWS` (25).

### 2.3 SQL Security Guard (`src/security/sql_guard.js`)
- Enforces strictly read-only operations.
- Rejects mutating/destructive commands: `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`.
- Rejects administrative and filesystem commands: `COPY`, `EXPORT`, `INSTALL`, `LOAD`, `ATTACH`, `DETACH`, `PRAGMA`, `CALL`.
- Blocks statement chaining (semicolon injection).
- Permits CTEs (`WITH ... SELECT ...`).

### 2.4 Multi-Provider Agent Architecture (`src/agent/`)

#### Central Model Registry (`models.js`)
Centralized definition of supported models across all four providers:
- **Google Gemini:** `gemini-2.5-flash` (Primary), `gemini-2.5-flash-lite` (Fast) — Free Tier supported.
- **Groq:** `llama-3.3-70b-versatile` (Primary), `llama-3.1-8b-instant` (Fast) — Free Developer Tier supported.
- **Anthropic Claude:** `claude-sonnet-5-5` (Primary), `claude-haiku-4-5` (Fast) — BYOK.
- **OpenAI:** `gpt-4o` (Primary), `gpt-4o-mini` (Fast) — BYOK.

#### Tool Definitions (`tools.js`)
Defines one logical tool: `run_sql(query: string)` with provider-specific native schemas:
- `GEMINI_TOOLS`: `functionDeclarations` inside `toolConfig`
- `GROQ_TOOLS`: OpenAI Chat Completions function calling format (`type: "function"`)
- `ANTHROPIC_TOOLS`: Anthropic `tools` parameter format
- `OPENAI_RESPONSES_TOOLS`: OpenAI Responses API `tools` format

#### Unified Provider Manager (`provider_manager.js`)
- Coordinates adapter delegates (`geminiAdapter`, `groqAdapter`, `claudeAdapter`, `openAiAdapter`).
- Maintains normalized conversation history (`NormalizedConversation`) mapping provider-specific messages.
- Emits normalized turn events: `{ type: 'tool_call', toolName: 'run_sql', query }` or `{ type: 'final', text }`.
- Executes user-controlled fallback if primary provider encounters transient errors and fallback is enabled.

#### Error Normalizer (`error_normalizer.js`)
Maps provider-specific HTTP errors into standardized categories:
- `INVALID_API_KEY`, `RATE_LIMITED`, `QUOTA_EXCEEDED`, `MODEL_UNAVAILABLE`, `PROVIDER_ERROR`, `NETWORK_ERROR`, `CORS_ERROR`.
- Strictly sanitizes raw error bodies to ensure no credentials or secret tokens appear in UI notifications.

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
│  Context Prepared for Selected AI Provider:                  │
│    ├── User Natural Language Question                        │
│    ├── Schema (Table & Column Names, Inferred Types)         │
│    ├── 5 Sample Rows                                         │
│    └── Capped Query Results (Max 25 Rows)                    │
└──────────────────────────────┬───────────────────────────────┘
                               │ Direct HTTPS Browser Requests
                               │ (Credentials held strictly in runtime memory)
                               ▼
        ┌───────────────────────────────────────────────────────────┐
        │                 Selected AI Provider Endpoint             │
        │                                                           │
        │  • Google Gemini:                                         │
        │    POST /v1beta/models/{model}:generateContent?key={key}  │
        │                                                           │
        │  • Groq Cloud:                                            │
        │    POST https://api.groq.com/openai/v1/chat/completions   │
        │                                                           │
        │  • Anthropic Claude:                                      │
        │    POST https://api.anthropic.com/v1/messages             │
        │    (Header: anthropic-dangerous-direct-browser-access)    │
        │                                                           │
        │  • OpenAI Responses:                                      │
        │    POST https://api.openai.com/v1/responses              │
        └───────────────────────────────────────────────────────────┘
```

---

## 4. UI States

| State | Name | Description |
|---|---|---|
| State 1 | `API_KEY_REQUIRED` | Initial modal prompting user to select provider and enter API key. CSV uploader locked. |
| State 2 | `API_KEY_CONFIGURED` | Key verified via probe request. Held in memory only. CSV uploader unlocked. |
| State 3 | `UPLOAD_CSV` | Drag-and-drop zone ready for `.csv` file. Option for bundled Demo Mode. |
| State 4 | `LOADING_DUCKDB` | Web Worker and Wasm bundles initializing. |
| State 5 | `ANALYZING_DATASET` | `read_csv_auto` running; schema and sample rows being extracted. |
| State 6 | `DATASET_READY` | Table badge, column list, row count, and sample preview visible. |
| State 7 | `WAITING_FOR_QUESTION` | Query input enabled with dynamic dataset suggestions. |
| State 8 | `AGENT_RUNNING` | 6-step animated process trace active. AI planning query. |
| State 9 | `EXECUTING_SQL` | DuckDB-WASM executing `run_sql` locally. |
| State 10 | `RESULTS_READY` | Table rendered, highlighted SQL card displayed, AI insight shown. |
| State 11 | `ERROR` | Human-readable explanation with self-correction feedback and fallback status. |
| State 12 | `KEY_CLEARED` | Key removed from memory; application reset to State 1. |
