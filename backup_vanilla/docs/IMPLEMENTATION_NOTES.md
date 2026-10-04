# QueryMind — Implementation Notes & Engineering Decisions

## 1. Zero-Backend Architecture
**Context:**  
The master architecture mandates a **100% client-side web application** with zero application backend. There is no server, database, or serverless function processing user data.  
**Implementation:**  
- QueryMind is structured as a static frontend built with **Vite** and Vanilla JavaScript.
- Decommissioned all server files (`server.js`, `api/pipeline.js`, `api/health.js`, etc.).
- Static builds (`npm run build`) output to `dist/`, fully deployable to GitHub Pages, Vercel Static, Netlify, or any static host.

---

## 2. DuckDB-WASM In-Browser Analytical Database
**Context:**  
User datasets must remain strictly inside the browser. Queries must execute genuinely without fabricating rows.  
**Implementation with `@duckdb/duckdb-wasm`:**  
- In the browser, DuckDB-WASM is initialized inside a dedicated Web Worker via `selectBundle()`.
- Uploaded CSV files are read into an in-memory `Uint8Array` buffer and mounted directly into the DuckDB virtual filesystem (`registerFileBuffer`).
- The database table is created dynamically using DuckDB's automatic sniffer:
  `CREATE OR REPLACE TABLE "<tableName>" AS SELECT * FROM read_csv_auto('<virtualFilename>', header=true);`
- Dynamic schema extraction inspects columns and types via `DESCRIBE "<tableName>"`, and 5 representative sample rows are retrieved via `SELECT * FROM "<tableName>" LIMIT 5;`.
- Execution latency is measured in milliseconds via `performance.now()`.
- Dual environment compatibility: For automated Node.js unit tests (`npm test`), native `duckdb` connects to `:memory:`, providing identical execution behavior without requiring a headless browser.

---

## 3. BYOK (Bring Your Own Key) Claude Integration
**Context:**  
The user provides their own Anthropic Claude API key. Claude is the sole LLM provider (no Gemini, no Groq).  
**Security & CORS Model:**  
- Direct browser calls to `https://api.anthropic.com/v1/messages` are enabled by Anthropic's official browser header:
  `anthropic-dangerous-direct-browser-access: true`
- **Memory-Only Key Storage:** The API key is stored strictly in a JavaScript closure variable in `src/agent/claude_client.js`. It is **never** written to `localStorage`, `sessionStorage`, `IndexedDB`, cookies, URL parameters, or logs.
- Clicking "Clear API Key" immediately nullifies the variable and locks the workspace.
- **Supported Models:**
  - `claude-sonnet-5-5` (Primary · High Capability)
  - `claude-haiku-4-5` (Fast · Lower Cost)

---

## 4. Client-Side Tool-Based Agent Loop & Self-Correction
**Context:**  
Claude must not touch the database directly; it acts as an analyst writing SQL instructions for browser JavaScript to validate and execute.  
**Tool Execution Loop:**  
1. Claude requests the `run_sql({ query })` tool.
2. Browser JavaScript validates the query using `src/security/sql_guard.js`.
3. DuckDB-WASM executes the query locally.
4. **Self-Correction:** If DuckDB throws an error (e.g. unknown column), browser returns `tool_result` with `is_error: true`. Claude analyzes the error and self-corrects the query.
5. **Safety Bounds:**
   - `MAX_AGENT_ROUNDS = 5` (hard limit on tool turns).
   - `MAX_CLAUDE_ROWS = 25` (capped result payload sent to Claude).
   - `MAX_DISPLAY_ROWS = 100` (capped result preview in the UI).
6. Claude outputs the final answer and a 2-sentence executive business takeaway.

---

## 5. SQL Guard Security
- Enforces strictly read-only queries (SELECT and WITH CTEs).
- Rejects mutations: `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`.
- Rejects administrative & filesystem commands: `COPY`, `EXPORT`, `INSTALL`, `LOAD`, `ATTACH`, `DETACH`, `PRAGMA`, `CALL`.
- Blocks statement chaining (semicolon injection).

---

## 6. UI & Design System
- Retains QueryMind dark SaaS visual language (`#0d0f12` background, navy/slate cards).
- 6-stage operational trace with status indicators (`waiting` → `running` → `done`) and typewriter animation.
- JetBrains Mono syntax-highlighted SQL card with clipboard copy.
- Interactive results table with numeric green formatting (`.nc`) and row-capping notice.
- AI Insight card with typewriter animation and cursor `▋`.
- Memory-only query history in sidebar.
- Visible 🔒 Privacy-First Architecture indicator widget.
