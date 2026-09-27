# QueryMind — Implementation Notes & Engineering Decisions

## 1. Security Architecture & Serverless API Proxy
**Context:**  
The DOCX specification mentioned static HTML + vanilla JS with placeholders for API keys.  
**Engineering Decision:**  
To comply with the critical security requirement (*"Never expose Gemini, Groq, or secret keys in browser-side JavaScript; never hard-code credentials"*), QueryMind was structured with a lightweight server/serverless API boundary:
- In production on Vercel: `api/pipeline.js` and `api/health.js` execute as Vercel Serverless Functions.
- In local development: `server.js` serves static assets and mounts the `/api/*` endpoints with `dotenv`.
- In the browser: `public/js/pipeline_client.js` communicates with `/api/pipeline` without holding or receiving any secrets.
- Verification: An automated audit test (`tests/api_security.test.js`) inspects every file in `public/` to ensure `process.env` and API key tokens never exist in client-side code.

---

## 2. LLM Model Configurations & Routing
**Primary Model: Google AI Studio / Gemini**
- **Default Model:** `gemini-2.0-flash` (Google AI Studio v1beta API).
- **Environment Variable:** `GEMINI_API_KEY`.
- **Purpose:** Executes Steps 1–4 (Intent Parsing, Schema Mapping, Join Planning, SQL Generation) benefiting from strong relational reasoning.

**Secondary / Fast Model: Groq Cloud**
- **Default Model:** `llama-3.3-70b-versatile` (OpenAI-compatible chat completions endpoint).
- **Environment Variable:** `GROQ_API_KEY`.
- **Purpose:** Executes Step 5 (Query Verifier) and Step 6 (Insight Narrator) benefiting from sub-second latency for real-time typewriter narration.

**Fallback Cascade:**
1. Steps 1–4 call Gemini; if Gemini fails or is unconfigured, calls Groq.
2. Steps 5–6 call Groq; if Groq fails or is unconfigured, calls Gemini.
3. If both providers fail or are unconfigured (e.g. initial demo clone), QueryMind engages the baked-in golden presets or in-memory execution, clearly badged as `Sample` in the UI. Live outputs are distinctly badged as `Live · Gemini` or `Live · Groq`.

---

## 3. Database Execution & Dialect Normalization
**Context:**  
The specification mandates that the application must never fabricate results:
- For the 5 golden queries: use verified benchmark SQL and results where appropriate, clearly labeling sample behavior.
- For custom queries: execute them against the seeded SaaS Demo DB using a genuine, deterministic execution mechanism.
- If a query cannot be executed, report a clear notice rather than inventing rows.

**Implementation with `sql.js` (WebAssembly SQLite):**  
An in-memory relational engine was built (`src/database/in_memory_db.js`) seeded with realistic data across all four schema tables:
- Custom SQLite functions were registered to support standard PostgreSQL functions:
  - `now()`: Returns fixed benchmark timestamp `2024-11-30 12:00:00`.
  - `age(d1, d2)`: Computes month difference between timestamps.
  - `date_part(part, val)`: Extracts month, year, or day.
  - `date_trunc(unit, val)`: Truncates timestamp to start of month.
  - `to_char(val, fmt)`: Formats date to `Mon YYYY` format.
  - `concat(...)`: Concatenates string arguments.
- Safe syntax normalization:
  - `s.churned = true` is normalized to `s.churned = 1`.
  - `NOW() - INTERVAL '30 days'` is normalized to `datetime('2024-11-30 12:00:00', '-30 days')`.
  - `NOW() - INTERVAL '6 months'` is normalized to `datetime('2024-11-30 12:00:00', '-6 months')`.
- If an unsupported SQL construct is executed, the engine returns `{ success: false, error: 'Execution note: ...' }` and the UI honestly reports the execution limitation without fabricating rows.

---

## 4. Reasoning Trace Design
- The six-step trace displays user-facing operational steps, never exposing private chain-of-thought tokens or raw model deliberations.
- Animation timings strictly adhere to the specification:
  - Detail text typewriter effect at ~3 chars per 8ms.
  - 180–250ms pauses between step completion and the next step start.
  - Card status badge updates from `Running...` (blue pulsing) to `Complete ✓` (green).

---

## 5. Visual Styling & Polish
- Token consistency:
  - Background: `#0d0f12`
  - Surface cards: `#13161b`
  - Active blue: `#4f8ef7`
  - Success green: `#34c97b`
  - Monospace SQL font: `JetBrains Mono`
  - UI font: `Inter`
- Copy button copies clean, raw SQL text (not HTML markup or formatted spans).
- Mobile layout: Sidebar collapses into a sliding drawer toggleable via hamburger icon on screens ≤ 900px wide. No horizontal page overflow.
