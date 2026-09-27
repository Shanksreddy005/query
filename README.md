# QueryMind — NL → SQL Engine

> An enterprise-grade Natural Language to PostgreSQL query engine featuring an interactive 6-step reasoning trace, deterministic in-memory query execution, SQL safety verification, and AI-narrated executive business insights.

[![Test Suite](https://img.shields.io/badge/tests-30%20passed-34c97b.svg)](file:///tests/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PostgreSQL](https://img.shields.io/badge/Dialect-PostgreSQL-336791.svg)](file:///src/schema/saas_db.js)
[![Vercel Ready](https://img.shields.io/badge/Deployment-Vercel-black.svg)](vercel.json)

---

## 1. Problem Statement
Business analysts and data analysts spend **60–70% of their query time** writing and debugging SQL that could be stated in one sentence. Non-technical stakeholders struggle to extract insights directly, while black-box LLM SQL generators often produce unverified queries, introduce security vulnerabilities, hallucinate non-existent columns, or leave users uncertain about whether the query accurately answers their business question.

---

## 2. The Solution
QueryMind bridges the gap between natural language questions and database analytics with complete transparency:
1. **Interactive 6-Step Process Trace**: Animates character-by-character through intent extraction, schema mapping, join planning, SQL generation, safety verification, and result narration.
2. **Clause-Commented PostgreSQL**: Produces clean, readable SQL queries with syntax highlighting and instant clipboard copying.
3. **Deterministic Query Results**: Real-time tabular visualization with highlighted financial/metric columns (`.nc`).
4. **AI-Narrated Business Insights**: Two-sentence executive takeaways delivered with an engaging typewriter animation and blinking cursor.

---

## 3. The Six-Step LLM Reasoning Pipeline

```
Natural Language Question
         │
         ▼
[Step 1: Intent Parser]       ──► Extracts entity, metric, filters, time window, limit
         │
         ▼
[Step 2: Schema Mapper]       ──► Maps attributes to SaaS Demo DB tables & foreign keys
         │
         ▼
[Step 3: Join Planner]        ──► Plain-English operational plan for the analyst
         │
         ▼
[Step 4: SQL Generator]       ──► PostgreSQL with inline clause comments (SELECT-only)
         │
         ▼
[Security & Guard Validator]  ──► Enforces read-only safety; rejects DROP/INSERT/UPDATE
         │
         ▼
[Step 5: Query Verifier]      ──► Validates column existence, joins, and div/0 guards
         │
         ▼
[Database Execution Engine]   ──► Executes against in-memory SaaS Demo DB
         │
         ▼
[Step 6: Insight Narrator]    ──► Synthesizes 2-sentence executive business takeaway
```

---

## 4. SaaS Demo DB Schema

Every LLM prompt strictly receives this relational context:

| Table | Columns | Keys / Constraints | Description |
| :--- | :--- | :--- | :--- |
| **`customers`** | `id`, `name`, `email`, `plan`, `mrr`, `status`, `created_at` | `id` PK; `plan` IN ('starter', 'professional', 'enterprise', 'trial'); `status` IN ('active', 'churned', 'paused') | Customer accounts and subscription tiers |
| **`orders`** | `id`, `customer_id`, `amount`, `ordered_at`, `product` | `id` PK; `customer_id` FK → `customers.id` | Product purchases and transactions |
| **`subscriptions`** | `id`, `customer_id`, `plan`, `started_at`, `cancelled_at`, `churned` | `id` PK; `customer_id` FK → `customers.id`; `churned` boolean | Subscription lifecycle and churn timestamps |
| **`events`** | `customer_id`, `event_type`, `occurred_at`, `properties` | `customer_id` FK → `customers.id`; `properties` jsonb | Product usage and feature interaction logs |

---

## 5. Five Predefined Acceptance Queries

QueryMind includes 5 pre-loaded golden queries accessible via interactive chips:

1. **Top 5 by revenue last quarter**:
   ```sql
   SELECT RANK() OVER (ORDER BY SUM(o.amount) DESC) AS rank,
          c.name, c.plan, SUM(o.amount) AS total_revenue,
          COUNT(o.id) AS order_count, c.mrr
   FROM   orders o JOIN customers c ON c.id = o.customer_id
   WHERE  o.ordered_at BETWEEN '2024-07-01' AND '2024-09-30'
   GROUP BY c.id, c.name, c.plan, c.mrr
   ORDER BY total_revenue DESC LIMIT 5;
   ```
2. **Churned Enterprise customers**:
   Filters `s.churned = true AND c.plan = 'enterprise' AND s.cancelled_at >= NOW() - INTERVAL '30 days'` and computes tenure via `DATE_PART('month', AGE(s.cancelled_at, c.created_at))`.
3. **Avg MRR by plan tier**:
   Calculates customer counts, average MRR, total MRR, and revenue share percentage using `SUM(SUM(c.mrr)) OVER ()`.
4. **Trial customers with 3+ orders**:
   Joins customers to orders, filters `c.plan = 'trial'`, and uses `HAVING COUNT(o.id) > 3` to identify high-intent conversion prospects.
5. **Monthly revenue growth**:
   Uses CTEs for new revenue and churned MRR, performs a `LEFT JOIN`, and computes month-over-month growth with `LAG(m.new_rev) OVER (ORDER BY m.mo)` guarded by `NULLIF`.

---

## 6. Technology Stack

- **Frontend**: Vanilla JavaScript (ES2024), HTML5, CSS3 with custom design tokens. Zero external UI bundle bloat.
- **Typography**: Inter (UI) & JetBrains Mono (Code/SQL).
- **Backend / API Boundary**: Node.js HTTP server + Vercel Serverless Functions (`/api/pipeline`, `/api/health`).
- **Database Engine**: In-memory relational database (`sql.js` WebAssembly SQLite) with PostgreSQL function helpers (`now`, `age`, `date_trunc`, `date_part`, `to_char`, `concat`).
- **Primary LLM**: Google Gemini 2.0 Flash (`GEMINI_API_KEY`) via Google AI Studio.
- **Secondary / Fast LLM**: Groq Cloud Llama 3.3 70B (`GROQ_API_KEY`) for fast verification and insight narration.
- **Testing**: Native Node.js test runner (`node --test`).

---

## 7. Security Architecture

- **Air-Gapped Secrets**: API keys (`GEMINI_API_KEY`, `GROQ_API_KEY`) are accessed strictly on the server/serverless layer. The browser client never sees or imports API keys.
- **Strict SELECT-Only Enforcement**: QueryMind's SQL Guard rejects `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`, `GRANT`, `REVOKE`, `EXEC`, and semicolon-chained multi-statements.
- **Input Sanitization**: User questions and LLM outputs are escaped before DOM insertion to prevent XSS.
- **Git Protection**: `.env` is strictly ignored by `.gitignore` and audited by test suites.

---

## 8. Local Setup & Quickstart

### Prerequisites
- Node.js (v18.0.0 or higher, tested on Node v24.15.0)
- npm (v9.0.0 or higher)

### 1. Clone & Install
```bash
git clone https://github.com/your-username/querymind-prototype.git
cd querymind-prototype
npm install
```

### 2. Configure Environment (Optional for Live API Keys)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Populate your API keys (the app runs seamlessly in demo benchmark mode if keys are omitted):
```env
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
PORT=3000
```

### 3. Run the Local Server
```bash
npm start
```
Open your browser to:
```
http://localhost:3000
```

---

## 9. Running the Automated Test Suite

QueryMind includes 30 automated tests across 5 comprehensive test suites:

```bash
npm test
```

### Test Coverage Summary:
- `tests/sql_guard.test.js`: Verifies SELECT-only constraints, rejects destructive commands and injection attempts.
- `tests/presets.test.js`: Verifies all 5 DOCX golden queries against expected SQL, schema, and row counts.
- `tests/pipeline.test.js`: Tests prompt construction and JSON parsing for all 6 pipeline stages.
- `tests/db_execution.test.js`: Validates in-memory execution, aggregations, joins, and error reporting.
- `tests/api_security.test.js`: Verifies zero secret leakage, safe healthcheck masking, and client bundle integrity.

---

## 10. Deployment Guide (Vercel & GitHub)

### One-Click Deploy to Vercel
1. Push your repository to GitHub:
   ```bash
   git add .
   git commit -m "feat: QueryMind NL to SQL Engine initial release"
   git remote add origin https://github.com/your-username/querymind-prototype.git
   git branch -M main
   git push -u origin main
   ```
2. In the Vercel Dashboard, select **Add New Project** and import the repository.
3. In **Project Settings → Environment Variables**, add:
   - `GEMINI_API_KEY`: Your Google AI Studio API key
   - `GROQ_API_KEY`: Your Groq Cloud API key
4. Deploy. Vercel auto-deploys `public/` assets and `/api` serverless functions.

---

## 11. Limitations & Future Roadmap

- **Current Prototype Scope**: Focuses on the SaaS Demo DB (customers, orders, subscriptions, events).
- **Future Database Connectors**: Direct integration with external PostgreSQL / Supabase databases via Supabase MCP connection.
- **Visual Charting**: Automatic generation of bar and line charts from query result sets.
- **Export Options**: One-click export to CSV, JSON, and Google Sheets.
