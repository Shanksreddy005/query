# QueryMind — Requirements Traceability Matrix

> **Primary Specification Source:** `QueryMind-Antigravity.docx` (v1.0, September 2026)  
> **Visual & Behavioral Reference:** `nl-to-sql.html`  
> **Status:** All core requirements implemented and tested with 100% test pass rate.

---

## Traceability Table

| DOCX Requirement | Category | Implementation Location | Test Verification | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Product Brief & Scope** | Product | `public/index.html`, `server.js` | Manual & end-to-end check | **`[IMPLEMENTED] [TESTED]`** |
| **Two-Column Layout** | UI Shell | `public/index.html`, `public/css/style.css` | Visual & CSS breakpoint check | **`[IMPLEMENTED] [TESTED]`** |
| **SaaS Demo DB Schema** | Database | `src/schema/saas_db.js`, `public/index.html` | `tests/db_execution.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| - `customers` (id, name, email, plan, mrr, status, created_at) | Schema | `src/schema/saas_db.js` | `tests/db_execution.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| - `orders` (id, customer_id, amount, ordered_at, product) | Schema | `src/schema/saas_db.js` | `tests/db_execution.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| - `subscriptions` (id, customer_id, plan, started_at, cancelled_at, churned) | Schema | `src/schema/saas_db.js` | `tests/db_execution.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| - `events` (customer_id, event_type, occurred_at, properties) | Schema | `src/schema/saas_db.js` | `tests/db_execution.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| **Step 1 — Intent Parser** | LLM Pipeline | `src/pipeline/step1_intent.js` | `tests/pipeline.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| **Step 2 — Schema Mapper** | LLM Pipeline | `src/pipeline/step2_schema.js` | `tests/pipeline.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| **Step 3 — Join Planner** | LLM Pipeline | `src/pipeline/step3_planner.js` | `tests/pipeline.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| **Step 4 — SQL Generator** | LLM Pipeline | `src/pipeline/step4_sqlgen.js` | `tests/pipeline.test.js`, `tests/presets.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| **Step 5 — Query Verifier** | LLM Pipeline | `src/pipeline/step5_verifier.js` | `tests/pipeline.test.js`, `tests/sql_guard.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| **Step 6 — Insight Narrator** | LLM Pipeline | `src/pipeline/step6_insight.js` | `tests/pipeline.test.js`, `tests/presets.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| **Reasoning Trace UI** | UI / Animation | `public/js/trace.js`, `public/css/style.css` | UI lifecycle & typewriter timing | **`[IMPLEMENTED] [TESTED]`** |
| - Step dot states (waiting -> running -> done) | Animation | `public/js/trace.js`, `.step-dot` | Tested in browser and trace script | **`[IMPLEMENTED] [TESTED]`** |
| - Vertical connector lines | CSS | `public/css/style.css` (`.step::before`) | Visual QA check | **`[IMPLEMENTED] [TESTED]`** |
| - Character typewriter effect (~3 chars / 8ms) | Animation | `public/js/trace.js` (`animateStep`) | Unit timing check | **`[IMPLEMENTED] [TESTED]`** |
| - 180–250ms step-to-step pause | Timing | `public/js/app.js`, `public/js/trace.js` | Runtime loop check | **`[IMPLEMENTED] [TESTED]`** |
| - Trace status badge ("Running..." -> "Complete ✓") | Badge | `public/js/trace.js` (`complete()`) | DOM assertion check | **`[IMPLEMENTED] [TESTED]`** |
| **No Private Chain-of-Thought** | Safety | `src/pipeline/`, `public/js/trace.js` | Prompt audits & output inspection | **`[IMPLEMENTED] [TESTED]`** |
| **SQL Syntax Highlighting** | UI / Code | `public/js/sql_highlighter.js` | Token span generation check | **`[IMPLEMENTED] [TESTED]`** |
| - JetBrains Mono monospace font | Typography | `public/index.html`, `public/css/style.css` | Font link & stylesheet check | **`[IMPLEMENTED] [TESTED]`** |
| - Copy Button (copies pure SQL, not HTML) | Feature | `public/js/sql_highlighter.js` (`copySQL`) | Clipboard utility test | **`[IMPLEMENTED] [TESTED]`** |
| **Results Table** | UI / Data | `public/js/results_table.js` | `tests/db_execution.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| - Metric highlight class (`.nc`) | Styling | `public/js/results_table.js` | Regex currency/percentage test | **`[IMPLEMENTED] [TESTED]`** |
| - Row count & data source label | Data | `public/js/results_table.js` | Row count formatting check | **`[IMPLEMENTED] [TESTED]`** |
| - Responsive horizontal scroll | Layout | `public/css/style.css` (`.table-wrap`) | Viewport overflow test | **`[IMPLEMENTED] [TESTED]`** |
| **AI Insight Card** | UI / Animation | `public/js/insight.js` | `tests/pipeline.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| - Typewriter animation (~4 chars / 11ms) | Animation | `public/js/insight.js` | Animation timer check | **`[IMPLEMENTED] [TESTED]`** |
| - Blinking cursor (`▋` while typing) | UI | `public/css/style.css` (`.typing-cursor`) | CSS animation check | **`[IMPLEMENTED] [TESTED]`** |
| **Golden Query 1: Top 5 by Revenue** | Golden Test | `src/pipeline/presets.js` | `tests/presets.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| **Golden Query 2: Churned Enterprise** | Golden Test | `src/pipeline/presets.js` | `tests/presets.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| **Golden Query 3: Avg MRR by Plan Tier** | Golden Test | `src/pipeline/presets.js` | `tests/presets.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| **Golden Query 4: Trial Customers 3+ Orders**| Golden Test | `src/pipeline/presets.js` | `tests/presets.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| **Golden Query 5: Monthly Revenue Growth** | Golden Test | `src/pipeline/presets.js` | `tests/presets.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| **Model Routing & Fallback** | AI Routing | `src/pipeline/router.js` | `tests/pipeline.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| - Gemini Primary (Steps 1–4) | Provider | `src/providers/gemini.js` | Mock & timeout check | **`[IMPLEMENTED] [TESTED]`** |
| - Groq Secondary / Fast (Steps 5–6) | Provider | `src/providers/groq.js` | Mock & timeout check | **`[IMPLEMENTED] [TESTED]`** |
| - Baked-in Golden Preset Fallback | Fallback | `src/pipeline/presets.js` | Preset verification test | **`[IMPLEMENTED] [TESTED]`** |
| - Badges: `Live · [Provider]` vs `Sample` | UI / Badge | `src/pipeline/router.js`, `public/js/app.js` | Status badge check | **`[IMPLEMENTED] [TESTED]`** |
| **Security & Credential Masking** | Security | `api/pipeline.js`, `api/health.js` | `tests/api_security.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| - No API keys in browser JavaScript | Security | `public/js/` | `tests/api_security.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| - `.gitignore` blocks `.env` | Security | `.gitignore` | `tests/api_security.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| - Strict SELECT-only SQL Guard | Security | `src/security/sql_guard.js` | `tests/sql_guard.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| - Rejection of DROP, INSERT, UPDATE, DELETE | Security | `src/security/sql_guard.js` | `tests/sql_guard.test.js` | **`[IMPLEMENTED] [TESTED]`** |
| **Query History in Sidebar** | Feature | `public/js/app.js` | History add and restore test | **`[IMPLEMENTED] [TESTED]`** |
| **Keyboard Shortcut (⌘↵ / Ctrl+Enter)** | UX | `public/js/app.js` | Keydown listener check | **`[IMPLEMENTED] [TESTED]`** |
| **Responsive Mobile Layout** | Responsiveness | `public/css/style.css`, `public/index.html` | CSS media query & toggle test | **`[IMPLEMENTED] [TESTED]`** |
| **Deployment Configuration** | DevOps | `vercel.json`, `package.json` | Vercel routing test | **`[IMPLEMENTED] [TESTED]`** |
