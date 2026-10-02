# QueryMind — Privacy-First Natural Language Analytics Engine

> **"Ask your CSV questions in plain English."**  
> A 100% client-side, browser-native analytics agent powered by **DuckDB-WASM** with multi-provider BYOK support for **Anthropic Claude** and **OpenAI Responses API**.

[![Test Suite](https://img.shields.io/badge/tests-49%20passed-34c97b.svg)](file:///tests/)
[![Engine: DuckDB-WASM](https://img.shields.io/badge/Engine-DuckDB--WASM-FFF000.svg)](https://duckdb.org/docs/api/wasm/overview)
[![AI: Claude & OpenAI](https://img.shields.io/badge/AI-Claude%20%7C%20OpenAI-4f8ef7.svg)](file:///src/agent/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Static Deployment](https://img.shields.io/badge/Architecture-100%25%20Client--Side-34c97b.svg)](#architecture)

---

## 1. Overview & Core Philosophy

QueryMind bridges the gap between raw data files and executive business answers without compromising data privacy. 

Traditional AI-powered analytics tools force you to upload sensitive spreadsheets and enterprise databases to cloud servers. **QueryMind operates completely inside your browser:**

> ### 🔒 Data Privacy Guarantee:
> **The full uploaded dataset remains local. Only explicitly permitted AI context — user question, schema metadata, limited sample rows, SQL/tool interactions, and capped query results — may be sent to the configured AI provider (Anthropic or OpenAI).**

- **DuckDB-WASM** runs inside a Web Worker on your computer, parsing your CSV into an in-memory database and computing SQL aggregations locally.
- **Provider-Neutral Agent Boundary:** Supports both **Anthropic Claude** (`claude-sonnet-5-5`, `claude-haiku-4-5`) and **OpenAI Responses API** (`gpt-4o`, `gpt-4o-mini`) via Bring-Your-Own-Key (BYOK).
- **Client-Side Tool Use (`run_sql`):** The LLM requests SQL execution via native tool schemas. The browser agent controller validates with SQL Guard, executes in DuckDB-WASM, and returns capped results (`MAX_AI_ROWS = 25`). Neither LLM executes SQL directly.
- **Zero Application Backend:** There is no server, database, proxy, or serverless compute processing your files. The app is 100% static.

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
   ┌───────────────────────┐                        ┌───────────────────────────┐
   │     DuckDB-WASM       │                        │     Provider Manager      │
   │  Browser Web Worker   │                        │ ┌───────────────┬───────┐ │
   │ (Virtual Filesystem)  │                        │ │ Claude Adapter│ OpenAI│ │
   └──────────┬────────────┘                        │ └───────┬───────┴───┬───┘ │
              │                                     └─────────┼───────────┼─────┘
              │ Local SQL Execution                           │           │
              │ (Full dataset stays local)                    ▼           ▼
              │                                       Anthropic API   OpenAI Responses API
              │                                       /v1/messages    /v1/responses
              │                                               │           │
              └─────────────────────────┬─────────────────────┴───────────┘
                                        │
                                        ▼
                         ┌─────────────────────────────┐
                         │    Agent Controller Loop    │
                         │  - Normalized AI Events     │
                         │  - Strict SELECT SQL Guard  │
                         │  - Auto Error Correction    │
                         │  - MAX_AGENT_ROUNDS = 5     │
                         │  - MAX_AI_ROWS = 25         │
                         │  - MAX_DISPLAY_ROWS = 100   │
                         │  - Business Insight         │
                         └─────────────────────────────┘
```

---

## 3. Supported Models & Providers

Configurable directly from the **Key Settings** modal:

| Provider | Model | Model ID | Recommended Use |
|---|---|---|---|
| **Anthropic** | Claude Sonnet 5.5 | `claude-sonnet-5-5` | Primary · Deep analytical reasoning & SQL generation |
| **Anthropic** | Claude Haiku 4.5 | `claude-haiku-4-5` | Fast · Lower cost & rapid iteration |
| **OpenAI** | GPT-4o | `gpt-4o` | Primary · Flagship high-intelligence model |
| **OpenAI** | GPT-4o Mini | `gpt-4o-mini` | Fast · Lightweight & cost-effective |

---

## 4. BYOK Security Model Disclosure

> **BYOK Security Model:**  
> The API key is supplied by the user and retained only in JavaScript runtime memory. QueryMind does not persist, transmit, or proxy the key through its own infrastructure. Because the key is used directly by the browser, users should only enter keys they are comfortable using in a client-side application. Closing or refreshing this tab wipes all keys immediately.

- **Zero Browser Storage:** Keys are never stored in `localStorage`, `sessionStorage`, `IndexedDB`, cookies, or browser cache.
- **Zero URL Leakage:** Keys are never passed via URL search parameters or `history.pushState`.
- **Zero Log Leakage:** Normalized error objects sanitize sensitive error bodies to prevent raw token display.
- **Independent Closures:** Storing or switching between Anthropic and OpenAI keys maintains completely separate memory closures.

---

## 5. Getting Started

### Prerequisites
- Node.js (v18 or later)
- An Anthropic API key ([Console](https://console.anthropic.com/)) or an OpenAI API key ([Platform](https://platform.openai.com/))

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
# Starts at http://localhost:3000 with HMR
```

### Production Build (Static Site)
```bash
npm run build
# Outputs pure static bundle to dist/
```

To preview the production build locally:
```bash
npm run preview
# Serves dist/ statically with COOP/COEP headers on http://localhost:3000
```

---

## 6. Testing

QueryMind includes a comprehensive test suite (49 automated tests across 8 test suites) verifying DuckDB ingestion, SQL Guard, memory-only key audits, the provider compatibility matrix, and analytical queries:

```bash
npm test
```

### Test Matrix:
1. `tests/provider_compatibility.test.js` — Symmetrical test matrix verifying key lifecycle, provider/model selection, native tool schemas, `run_sql` call parsing, tool result formatting, error feedback, round bounds, result caps, and normalized error mapping across both **Claude** and **OpenAI**.
2. `tests/byok_security.test.js` — Zero-persistence audits, closure isolation, header inspection, URL safety, and absence of backend files.
3. `tests/duckdb_engine.test.js` — In-memory DuckDB table creation, CSV parsing, dynamic schema extraction, and query execution.
4. `tests/sql_guard.test.js` — SELECT-only enforcement, mutation rejection, and injection guards.
5. `tests/agent_loop.test.js` — Client-side tool loop, schema prompt injection, and error correction.
6. `tests/analytical_queries.test.js` — 5 golden analytical queries executed against DuckDB.

---

## 7. License

MIT License. See [LICENSE](LICENSE) for details.
