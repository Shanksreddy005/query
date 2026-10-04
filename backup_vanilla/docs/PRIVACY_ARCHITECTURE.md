# QueryMind — Privacy & Multi-Provider BYOK Architecture Specification

## 1. Core Privacy Architecture

QueryMind is engineered as a **100% client-side web application** with **zero application backend**. There is no QueryMind server, serverless function, proxy, or cloud database processing your data.

> ### The QueryMind Data Privacy Guarantee:
> **The full uploaded dataset remains local. Only explicitly permitted AI context — user question, schema metadata, limited sample rows, SQL/tool interactions, and capped query results — may be sent to the configured AI provider (Google Gemini, Groq, Anthropic, or OpenAI).**

---

## 2. BYOK Security Model Disclosure

> **BYOK Security Model:**  
> The API key is supplied by the user and retained only in JavaScript runtime memory. QueryMind does not persist, transmit, or proxy the key through its own infrastructure. Because the key is used directly by the browser, users should only enter keys they are comfortable using in a client-side application. Closing or refreshing this tab immediately wipes all keys from runtime memory.

---

## 3. What Stays Strictly Local

The following data **never leaves your browser**:

1. **The Full Uploaded CSV Dataset:**
   - When you select or drag-and-drop a CSV file, the browser reads it directly into WebAssembly memory via the standard JavaScript `FileReader` API.
   - The file is never transmitted to QueryMind, Google, Groq, Anthropic, OpenAI, or any third-party server.
2. **The DuckDB Analytical Database:**
   - DuckDB-WASM instantiates an embedded analytical database entirely inside a browser Web Worker.
   - Table storage resides in the browser's temporary memory virtual filesystem (`memfs`).
3. **Local SQL Query Execution:**
   - All SQL queries are parsed, validated with SQL Guard, optimized, and executed natively inside your browser's WebAssembly sandbox.
   - Aggregations, joins, window functions, and filters are computed using your computer's local CPU.
4. **The Complete Query Result Set:**
   - If a query matches 50,000 rows, all 50,000 rows are processed locally. Only a small, capped slice is ever shared with the AI model.

---

## 4. What Leaves the Browser (and Who Receives It)

QueryMind supports four user-selected AI providers for natural language understanding and SQL authoring:
- **Google Gemini:** Google AI Studio (Free Tier for supported models/rate limits; availability subject to provider policy). Direct CORS endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}`
- **Groq Cloud:** Groq Console (Free Developer Tier with supported open models; limits subject to provider terms). Direct CORS endpoint: `POST https://api.groq.com/openai/v1/chat/completions` (with `Authorization: Bearer <key>`)
- **Anthropic Claude:** Direct CORS endpoint: `POST https://api.anthropic.com/v1/messages` (with `anthropic-dangerous-direct-browser-access: true`)
- **OpenAI Responses API:** Direct CORS endpoint: `POST https://api.openai.com/v1/responses` (with `Authorization: Bearer <key>`)

To enable query planning, the browser transmits a strictly bounded operational context directly to the selected provider endpoint:

| Data Element | Purpose | Bound / Limit |
|---|---|---|
| **User Natural Language Question** | Enables the model to understand what analytics the user wants. | The user's input string. |
| **Table & Column Schema Metadata** | Informs the model of the available table name, column names, and inferred data types. | Column names and types only. |
| **Representative Sample Rows** | Helps the model understand column formatting (e.g., date formats, casing, currency symbols). | Exactly 5 sample rows maximum. |
| **Current Date / Time Anchor** | Provides temporal reference for queries like "last month" or "past 30 days". | Local date string (e.g. `2026-10-02`). |
| **Client-Side Tool Call (`run_sql`)** | The model requests execution of generated SQL. | The SQL string. |
| **Capped Query Results** | Allows the model to inspect the computed answers and synthesize a concise business summary. | Strictly capped at `MAX_AI_ROWS = 25`. |

---

## 5. What QueryMind Does NOT Do

- ❌ QueryMind **does not operate a backend server or proxy**.
- ❌ QueryMind **does not operate a database**.
- ❌ QueryMind **does not store or cache your uploaded CSVs**.
- ❌ QueryMind **does not store, log, or persist your API keys**.
- ❌ QueryMind **does not track or log your natural language questions**.
- ❌ QueryMind **does not transmit full datasets to Google, Groq, Anthropic, or OpenAI**.
- ❌ QueryMind **does not promise free access in perpetuity** — free tiers and rate limits are governed directly by Google AI Studio and Groq Cloud.

---

## 6. BYOK API Key Lifecycle & Zero-Persistence Guarantee

All four provider keys are managed with strict security boundaries:

- **Runtime Memory Only:** The API key is held exclusively in private JavaScript runtime memory (closure) for the duration of the browser tab session.
- **Zero Browser Storage:** The key is **never** written to `localStorage`, `sessionStorage`, `IndexedDB`, cookies, or browser caches.
- **Zero URL Exposure:** The key is **never** appended to query strings, URLs, or hash fragments (except Gemini where Google's public REST endpoint requires `?key=...`, executed strictly in a private browser `fetch`).
- **Zero Log Leakage:** The key is **never** logged to the browser console or exported in downloaded files.
- **Independent Key Closures:** Storing keys for multiple providers (e.g., Gemini and Groq) retains each in a separate, isolated memory closure without cross-over or accidental overwrites.
- **Instant Revocation / Memory Wipe:** Clicking **"Clear Key"** or refreshing the page immediately nullifies all in-memory variables.

