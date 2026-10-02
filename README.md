# QueryMind — Privacy-First Natural Language Analytics Engine

> **"Ask your CSV questions in plain English."**  
> A 100% client-side, browser-native analytics agent powered by **DuckDB-WASM** with multi-provider BYOK support for **Google Gemini** (Free Tier), **Groq** (Free Developer Tier), **Anthropic Claude**, and **OpenAI Responses API**.

[![Test Suite](https://img.shields.io/badge/tests-71%20passed-34c97b.svg)](file:///tests/)
[![Engine: DuckDB-WASM](https://img.shields.io/badge/Engine-DuckDB--WASM-FFF000.svg)](https://duckdb.org/docs/api/wasm/overview)
[![AI: Gemini | Groq | Claude | OpenAI](https://img.shields.io/badge/AI-Gemini%20%7C%20Groq%20%7C%20Claude%20%7C%20OpenAI-4f8ef7.svg)](file:///src/agent/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Static Deployment](https://img.shields.io/badge/Architecture-100%25%20Client--Side-34c97b.svg)](#architecture)

---

## 1. Overview & Core Philosophy

QueryMind bridges the gap between raw data files and executive business answers without compromising data privacy. 

Traditional AI-powered analytics tools force you to upload sensitive spreadsheets and enterprise databases to cloud servers. **QueryMind operates completely inside your browser:**

> ### 🔒 Data Privacy Guarantee:
> **The full uploaded dataset remains local. Only explicitly permitted AI context — user question, schema metadata, limited sample rows, SQL/tool interactions, and capped query results — may be sent to the configured AI provider (Google Gemini, Groq, Anthropic, or OpenAI).**

- **DuckDB-WASM** runs inside a Web Worker on your computer, parsing your CSV into an in-memory database and computing SQL aggregations locally.
- **Four-Provider BYOK Engine:**
  - **Google Gemini:** Direct browser access via Google AI Studio (`gemini-2.5-flash`, `gemini-2.5-flash-lite`). Supported with a **Free Tier** for eligible usage limits.
  - **Groq Cloud:** Ultra-fast open-weights inference (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`). Supported with a **Free Developer Tier**.
  - **Anthropic Claude:** Flagship analytical reasoning (`claude-sonnet-5-5`, `claude-haiku-4-5`).
  - **OpenAI Responses API:** High-intelligence structured tool planning (`gpt-4o`, `gpt-4o-mini`).
  *(Note: Free tiers and limits are managed by Google and Groq and subject to change).*
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

| Provider | Model | Model ID | Tier / Availability | Recommended Use |
|---|---|---|---|---|
| **Google Gemini** | Gemini 2.0 Flash | `gemini-2.0-flash` | Free Tier (Google AI Studio) | Primary Recommended · High intelligence & fast reasoning |
| **Google Gemini** | Gemini 1.5 Flash | `gemini-1.5-flash` | Free Tier (Google AI Studio) | Standard Free Tier · Universal availability & high capacity |
| **Google Gemini** | Gemini 1.5 Pro | `gemini-1.5-pro` | Free Tier (Google AI Studio) | Deep analytical reasoning & complex queries |
| **Google Gemini** | Gemini 2.0 Flash Lite | `gemini-2.0-flash-lite` | Free Tier (Google AI Studio) | Lightweight & ultra-fast throughput |
| **Google Gemini** | Gemini 2.5 Flash | `gemini-2.5-flash` | Preview | Next-Gen Preview (if enabled on account) |
| **Groq Cloud** | Llama 3.3 70B | `llama-3.3-70b-versatile` | Free Developer Tier | Primary · Fast open-weights analytical reasoning |
| **Groq Cloud** | Llama 3.1 8B | `llama-3.1-8b-instant` | Free Developer Tier | Fast · Millisecond inference & quick exploration |
| **Anthropic** | Claude Sonnet 5.5 | `claude-sonnet-5-5` | BYOK Paid | Flagship · Deep analytical synthesis & SQL reasoning |
| **Anthropic** | Claude Haiku 4.5 | `claude-haiku-4-5` | BYOK Paid | Fast · High speed & cost-effective |
| **OpenAI** | GPT-4o | `gpt-4o` | BYOK Paid | Flagship · Multimodal & structured reasoning |
| **OpenAI** | GPT-4o Mini | `gpt-4o-mini` | BYOK Paid | Fast · Affordable high-volume queries |

---

## 4. BYOK Security Model Disclosure

> **BYOK Security Model:**  
> The API key is supplied by the user and retained only in JavaScript runtime memory. QueryMind does not persist, transmit, or proxy the key through its own infrastructure. Because the key is used directly by the browser, users should only enter keys they are comfortable using in a client-side application. Closing or refreshing this tab wipes all keys immediately.

- **Zero Browser Storage:** Keys are never stored in `localStorage`, `sessionStorage`, `IndexedDB`, cookies, or browser cache.
- **Zero URL Leakage:** Keys are never passed via URL search parameters or `history.pushState`.
- **Zero Log Leakage:** Normalized error objects sanitize sensitive error bodies to prevent raw token display.
- **Independent Closures:** Storing keys for multiple providers maintains completely separate memory closures.
- **User-Controlled Fallback:** Optional fallback (Default: OFF) allowing seamless failover between configured providers upon rate limits or server errors.

---

## 5. Getting Started

### Prerequisites
- Node.js (v18 or later)
- An API key for your chosen provider:
  - [Google AI Studio](https://aistudio.google.com/) (Free Tier available)
  - [Groq Console](https://console.groq.com/) (Free Developer Tier available)
  - [Anthropic Console](https://console.anthropic.com/)
  - [OpenAI Platform](https://platform.openai.com/)

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

QueryMind includes a comprehensive test suite (**71 automated tests across 11 test suites**) verifying DuckDB ingestion, SQL Guard, memory-only key audits, the provider compatibility matrix, and analytical queries:

```bash
npm test
```

### Test Matrix:
1. `tests/provider_compatibility.test.js` (42 tests) — Symmetrical 10-point test matrix across all 4 providers (**Gemini**, **Groq**, **Claude**, **OpenAI**) verifying key lifecycle, provider/model selection, native tool schemas, `run_sql` call parsing, tool result formatting, error feedback, round bounds, result caps, and normalized error mapping, plus fallback tests.
2. `tests/byok_security.test.js` (8 tests) — Zero-persistence audits across storage mechanisms, closure isolation, header inspection, URL safety, and absence of backend files.
3. `tests/duckdb_engine.test.js` (6 tests) — In-memory DuckDB table creation, CSV parsing, dynamic schema extraction, and query execution.
4. `tests/sql_guard.test.js` (6 tests) — SELECT-only enforcement, mutation rejection, and injection guards.
5. `tests/agent_loop.test.js` (4 tests) — Client-side tool loop, schema prompt injection, and error correction.
6. `tests/analytical_queries.test.js` (5 tests) — 5 golden analytical queries executed against DuckDB.

---

## 7. License

MIT License. See [LICENSE](LICENSE) for details.

