# Security, Privacy & Compliance Architecture
**QueryMind Analytic Platform** — *Technical Specification & Data Sovereignty Model*

This document defines QueryMind's security architecture, technical verification boundaries, outbound data policies, and threat model. It distinguishes between **verified technical guarantees**, **architectural designs**, and **user/environment responsibilities**.

---

## 1. Architectural Posture & Verification Status

| Dimension | Architectural Implementation | Verification Status |
| :--- | :--- | :--- |
| **Data Locality** | In-memory vectorized analytics executed via `DuckDB-WASM` inside client browser Web Worker. | **Verified in Code & Automated Tests** |
| **Outbound Data Policy** | Strict metadata-only prompt formatting; zero raw data rows or result records egress to AI providers. | **Verified via Outbound Telemetry Auditor & Test Suite** |
| **SQL Sandboxing** | AST structural parsing, comment stripping, parenthesis balancing, single-statement read-only enforcement, table isolation, and DuckDB external filesystem operation blocking. | **Verified via Adversarial Unit & Integration Tests** |
| **Credential Management** | Client-side Bring-Your-Own-Key (BYOK); direct provider REST dispatch without intermediary server proxies. | **Verified in Architecture** |
| **Persistence Boundary** | Local sandboxed query blueprints saved to browser `localStorage`; sanitized JSON schema import/export. | **Verified in Test Suite** |
| **Compliance Posture** | Technical controls align with data minimization (GDPR Art. 25/32 principles), but QueryMind is a client-side tool and is **not** an externally certified SOC 2 or HIPAA cloud service. | **Accurately Scoped — No Unverified Certification Claims** |

---

## 2. Client-Side Execution Boundary

QueryMind executes analytical queries without intermediate database servers, caching relays, or cloud compute.

```
┌───────────────────────────────────── Client Browser Sandbox ──────────────────────────────────────┐
│                                                                                                    │
│  [ Uploaded CSV ] ──► (PapaParse Engine) ──► [ DuckDB-WASM Worker ] ──► Verified Data Table        │
│                                                           │                                        │
│                                                           ▼                                        │
│                                              (Client Schema Profiler)                              │
│                                                           │                                        │
│                         (Structural Metadata & Masked Categories ONLY)                             │
└───────────────────────────────────────────────────────────┼────────────────────────────────────────┘
                                                            │
                                                            ▼
                                              [ User's Configured LLM ]
                                             (Gemini, Groq, or OpenAI)
```

1. **Local WebAssembly Worker**: Datasets are loaded into a sandboxed `DuckDB-WASM` worker thread. The engine runs compiled C++ binaries inside WebAssembly, operating directly on client memory.
2. **Zero Analytics/Telemetry Servers**: QueryMind does not operate application analytics relays, error telemetry servers, tracking beacons, or backend logging databases.
3. **Network Boundary Isolation**: Network traffic is strictly limited to:
   - Initial static asset delivery (HTML/JS/WASM bundles).
   - Direct HTTPS calls from the browser to the user's selected LLM provider endpoint (`generativelanguage.googleapis.com`, `api.groq.com`, or `api.openai.com`).

---

## 3. Outbound Data Policy & Prompt Privacy

QueryMind enforces strict data boundary controls when interacting with third-party LLM providers:

### What IS Transmitted to the Model
- The user's natural language question string.
- Column names and data types (e.g. `mrr: number`, `plan_tier: string`).
- Inferred column roles (`MEASURE`, `DIMENSION`, `TEMPORAL`, `IDENTIFIER`).
- Low-cardinality categorical values (under 15 distinct categories, e.g. `plan_tier = ['Enterprise', 'Professional', 'Starter']`) strictly necessary for generating accurate SQL `WHERE` clauses.

### What is NEVER Transmitted to the Model
- **Zero Raw Rows**: User transaction rows, financial values, or table data records are never included in prompts.
- **Zero Result Rows**: Output rows returned by DuckDB execution remain local in client memory.
- **PII Masking**: Columns identified as PII (emails, phone numbers, SSNs, credit cards, user IDs, full names) have their sample values replaced with synthetic masks (e.g. `[Protected PII: Synthetic values only]`).
- **High-Cardinality Identifiers**: Customer IDs, account numbers, and primary keys are scrubbed and replaced with generic metadata tokens.

---

## 4. SQL Security & Sandbox Defense in Depth

To prevent malicious prompts or misaligned models from escaping the analytical boundary:

1. **AST Tokenizer & Lexical Parsing**:
   - Queries must strictly begin with `SELECT` or `WITH ... SELECT`.
   - Multi-statement SQL (separated by semicolons) is rejected.
   - Parentheses balance is verified to catch truncated or malformed AST expressions.
2. **Comment Stripping & Inspection**:
   - Both single-line (`--`) and multi-line (`/* */`) comments are stripped and analyzed to prevent hidden payload concealment or bypass attempts.
3. **Forbidden Operations Allowlist**:
   - Blocks all DDL/DML (`DROP`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, `CREATE`, `TRUNCATE`).
   - Blocks DuckDB extension and filesystem commands: `READ_CSV`, `READ_PARQUET`, `READ_JSON`, `SCAN_CSV`, `HTTPFS`, `COPY`, `INSTALL`, `LOAD`, `ATTACH`, `DETACH`, `PRAGMA`, `SYSTEM`.
4. **Table & Relation Isolation**:
   - Every `FROM` and `JOIN` clause is checked against the active dataset table and declared CTE aliases. Querying arbitrary or system tables is blocked.
5. **Execution Timeout & Resource Protection**:
   - DuckDB queries are bounded by a 15-second execution timeout to prevent runaway Cartesian joins from freezing browser threads.
   - Result row materialization is capped at 5,000 rows with explicit truncation indicators.

---

## 5. BYOK Credential Storage & Threat Model

- **Storage**: User API keys are stored in browser `localStorage` or session memory. Keys are never transmitted to QueryMind authors, proxies, or logging services.
- **Direct Dispatch**: Requests use client-side `fetch()` with authorization headers directly targeting official provider APIs.
- **Threat Model & Residual Risks**:
  - *Browser Environment Security*: An analyst using an untrusted browser, malicious extensions, or a compromised machine is vulnerable to client-side extraction.
  - *Third-Party LLM Provider Logging*: While QueryMind transmits zero raw records, the user's natural language question and column schema are subject to the data retention policies of the user's configured provider (Google, Groq, OpenAI). Users in regulated environments should configure enterprise zero-data-retention agreements with their respective providers.
