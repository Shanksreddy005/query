# QueryMind — Privacy-First Natural Language Analytics Engine

> **"Ask your CSV questions in plain English."**  
> A 100% client-side, browser-native analytics agent powered by **DuckDB-WASM** and **BYOK Anthropic Claude**.

[![Test Suite](https://img.shields.io/badge/tests-26%20passed-34c97b.svg)](file:///tests/)
[![Engine: DuckDB-WASM](https://img.shields.io/badge/Engine-DuckDB--WASM-FFF000.svg)](https://duckdb.org/docs/api/wasm/overview)
[![AI: Claude BYOK](https://img.shields.io/badge/AI-Claude%20(Anthropic)-D97706.svg)](https://docs.anthropic.com/en/docs/initial-setup)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Static Deployment](https://img.shields.io/badge/Architecture-100%25%20Client--Side-4f8ef7.svg)](#architecture)

---

## 1. Overview & Core Philosophy

QueryMind bridges the gap between raw data files and executive business answers without compromising data privacy. 

Traditional AI-powered analytics tools force you to upload sensitive spreadsheets and enterprise databases to cloud servers. **QueryMind operates completely inside your browser:**

> ### 🔒 Data Privacy Guarantee:
> **The full uploaded dataset remains local. Only explicitly permitted AI context — user question, schema metadata, limited sample rows, SQL/tool interactions, and capped query results — may be sent to Anthropic.**

- **DuckDB-WASM** runs inside a Web Worker on your computer, parsing your CSV into an in-memory database and computing SQL aggregations locally.
- **Claude (Anthropic API)** acts as an expert query planner and data analyst, generating verified SQL queries and summarizing results.
- **Zero Application Backend:** There is no server, database, or serverless compute processing your files. The app is 100% static.

---

## 2. Architecture & Data Flow

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

### The Separation of Responsibilities:
- **Claude:** Understands the question, inspects the schema, generates SQL, requests tool execution, and interprets capped results.
- **DuckDB-WASM:** Owns the dataset, executes SQL locally in WebAssembly, and returns formatted rows.
- **Browser JavaScript:** Controls permissions, validates SQL safety, enforces row limits, and coordinates the UI.

---

## 3. Key Features

- **Bring Your Own Key (BYOK):** Direct connection to Anthropic Claude via client-side CORS headers (`anthropic-dangerous-direct-browser-access: true`).
- **Memory-Only Key Storage:** API keys reside exclusively in JavaScript runtime closure. Zero storage in `localStorage`, `IndexedDB`, or cookies.
- **Dynamic CSV Ingestion:** Drag-and-drop any `.csv` file. DuckDB infers column types (`INTEGER`, `DOUBLE`, `VARCHAR`, `DATE`, `TIMESTAMP`) automatically.
- **Client-Side Tool Calling:** Claude requests the `run_sql` tool, which browser JavaScript validates with a SELECT-only SQL Guard and executes in DuckDB.
- **Automatic Error Correction Loop:** If DuckDB throws a syntax or column error, the error context is sent back to Claude to self-correct within `MAX_AGENT_ROUNDS = 5`.
- **Capped Result Limits:** Protects token usage and browser performance with `MAX_CLAUDE_ROWS = 25` and `MAX_DISPLAY_ROWS = 100`.
- **6-Stage Process Trace:** Real-time typewriter trace (`waiting` → `running` → `done`).
- **AI Business Takeaways:** Executive 2-sentence summary grounded strictly in the returned query records.
- **Built-in Demo Mode:** Bundled sample dataset (`sample-data/customers.csv`) for instant testing without an immediate CSV upload.

---

## 4. Getting Started

### Prerequisites
- Node.js (v18 or later)
- An Anthropic Claude API key ([Get an API key](https://console.anthropic.com/))

### Installation
```bash
# Clone the repository
git clone https://github.com/your-username/QueryMind.git
cd QueryMind

# Install dependencies
npm install
```

### Development Server
```bash
npm run dev
# Opens at http://localhost:3000 with hot module reloading
```

### Production Build (Static Site)
```bash
npm run build
# Outputs static files to dist/
```

You can preview the production build locally:
```bash
npm run preview
# Serves dist/ statically with COOP/COEP headers
```

---

## 5. BYOK Security & Billing Warning

> [!WARNING]
> **API Key Ownership & Billing**
> When you enter your Anthropic API key into QueryMind:
> 1. Requests are made directly from your browser to `https://api.anthropic.com/v1/messages`.
> 2. You are directly responsible for your own Anthropic API usage and billing costs.
> 3. Your key is stored **only in memory** for the active browser session. Refreshing or closing the tab wipes it immediately.
> 4. Never enter an API key on an untrusted or shared device.

Supported Models:
- `claude-sonnet-5-5` (Default · High Capability)
- `claude-haiku-4-5` (Fast · Lower Cost)

---

## 6. Testing

QueryMind includes a comprehensive test suite covering DuckDB execution, CSV loading, dynamic schema extraction, SQL guard enforcement, memory-only key audits, and analytical queries.

```bash
npm test
```

Test Suites:
1. `tests/duckdb_engine.test.js` — DuckDB table creation, CSV parsing, and query execution.
2. `tests/sql_guard.test.js` — SELECT-only enforcement, mutation rejection, and injection guards.
3. `tests/byok_security.test.js` — Zero-persistence audit, closure memory verification, and row capping.
4. `tests/agent_loop.test.js` — Tool-use lifecycle, error-correction loop, and max 5 rounds termination.
5. `tests/analytical_queries.test.js` — 5 representative analytical questions executed on `sample-data/customers.csv`.

---

## 7. Limitations

- **File Formats:** Currently accepts `.csv` files. Support for `.parquet` and `.json` is on the roadmap.
- **Dataset Size:** Datasets up to 100MB / ~500,000 rows run comfortably within browser WebAssembly memory limits.
- **Browser Compatibility:** Requires a modern browser supporting WebAssembly and Web Workers (Chrome, Firefox, Safari, Edge).

---

## 8. License

MIT License. See [LICENSE](LICENSE) for details.
