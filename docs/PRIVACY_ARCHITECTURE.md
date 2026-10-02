# QueryMind — Privacy & Data Architecture Specification

## 1. Core Privacy Architecture

QueryMind is engineered as a **100% client-side web application** with **zero application backend**. There is no QueryMind server, serverless function, or cloud database processing your data.

> ### The QueryMind Data Privacy Guarantee:
> **The full uploaded dataset remains local. Only explicitly permitted AI context — user question, schema metadata, limited sample rows, SQL/tool interactions, and capped query results — may be sent to Anthropic.**

---

## 2. What Stays Strictly Local

The following data **never leaves your browser**:

1. **The Full Uploaded CSV Dataset:**
   - When you select or drag-and-drop a CSV file, the browser reads it directly into WebAssembly memory via the standard JavaScript `FileReader` API.
   - The file is never transmitted to QueryMind, Anthropic, or any third-party server.
2. **The DuckDB Analytical Database:**
   - DuckDB-WASM instantiates an embedded analytical database entirely inside a browser Web Worker.
   - Table storage resides in the browser's temporary memory virtual filesystem (`memfs`).
3. **Local SQL Query Execution:**
   - All SQL queries are parsed, optimized, and executed natively inside your browser's WebAssembly sandbox.
   - Aggregations, joins, window functions, and filters are computed using your computer's local CPU.
4. **The Complete Query Result Set:**
   - If a query matches 50,000 rows, all 50,000 rows are processed locally. Only a small, capped slice is ever shared with the AI model.

---

## 3. What Leaves the Browser (and Who Receives It)

QueryMind uses the Anthropic Claude API for natural language understanding and SQL authoring. 

To enable this, the browser transmits a strictly bounded operational context directly to **`https://api.anthropic.com/v1/messages`**:

| Data Element | Purpose | Bound / Limit |
|---|---|---|
| **User Natural Language Question** | Enables Claude to understand what analytics the user wants. | The user's input string. |
| **Table & Column Schema Metadata** | Informs Claude of the available table name, column names, and inferred data types. | Column names and types only. |
| **Representative Sample Rows** | Helps Claude understand column formatting (e.g., date formats, casing, currency symbols). | Exactly 5 sample rows maximum. |
| **Current Date / Time Anchor** | Provides temporal reference for queries like "last month" or "past 30 days". | Local date string (e.g. `2026-10-02`). |
| **Client-Side Tool Call (`run_sql`)** | Claude requests execution of generated SQL. | The SQL string. |
| **Capped Query Results** | Allows Claude to inspect the computed answers and synthesize a concise business summary. | Strictly capped at `MAX_CLAUDE_ROWS = 25`. |

### Recipient:
- **Anthropic PBC** via direct HTTPS requests using your Bring-Your-Own-Key (BYOK) Anthropic API key.
- Requests utilize Anthropic's official CORS mechanism:
  `anthropic-dangerous-direct-browser-access: true`

---

## 4. What QueryMind Does NOT Do

- ❌ QueryMind **does not operate a backend server**.
- ❌ QueryMind **does not operate a database**.
- ❌ QueryMind **does not store or cache your uploaded CSVs**.
- ❌ QueryMind **does not store, log, or persist your Anthropic API key**.
- ❌ QueryMind **does not track or log your natural language questions**.
- ❌ QueryMind **does not transmit full datasets to Anthropic**.

---

## 5. BYOK API Key Lifecycle & Zero-Persistence Guarantee

Your Anthropic API key is managed with strict security boundaries:

- **Runtime Memory Only:** The API key is held exclusively in private JavaScript runtime memory (closure) for the duration of the browser tab session.
- **Zero Browser Storage:** The key is **never** written to `localStorage`, `sessionStorage`, `IndexedDB`, cookies, or browser caches.
- **Zero URL Exposure:** The key is **never** appended to query strings, URLs, or hash fragments.
- **Zero Log Leakage:** The key is **never** logged to the browser console or exported in downloaded files.
- **Instant Revocation / Memory Wipe:** Clicking **"Clear API Key"** immediately nullifies the in-memory variable, drops the DuckDB session, and returns the application to the locked onboarding state.
- **User Ownership:** You retain complete control over your API key, rate limits, and billing directly in your Anthropic Console.
