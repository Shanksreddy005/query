# Security, Privacy & Compliance Architecture
**QueryMind Analytic Platform** — *Zero-Cloud Data Strategy Spec*

QueryMind uses an isolated, browser-bound processing architecture designed for strict corporate data compliance standard environments. This document serves as a compliance framework guide for InfoSec, Data Protection Officers (DPOs), and system auditors reviewing QueryMind's interaction boundaries with sensitive relational datasets.

---

## 1. Compliance Executive Summary

| Requirement Vector | Architectural Strategy | Compliance Alignment |
| :--- | :--- | :--- |
| **Data Residency** | 100% Client-Side Sandbox (Browser Process Memory) | GDPR (Art. 25/32), HIPAA |
| **AI Inference Privacy** | Structural Metadating Data Scrubbing (No Row Egress) | SOC 2 Type II CC6.1/CC6.3 |
| **Credential Safety** | Ephemeral Browser State (Volatile Memory / Local BYOK) | ISO 27001 A.10.1 / A.14.2 |
| **Collaboration** | Non-Telemetry JSON Payload Schemas (Zero-Cloud Storage) | CCPA / CPRA Consumer Exclusions |

---

## 2. Client-Side Execution Boundary (Zero-Cloud Architecture)

QueryMind eliminates corporate database risk by removing server infrastructure entirely from the collection loop.

```
┌───────────────────────────────── Browser Sandbox ──────────────────────────────────┐
│                                                                                    │
│  [ Local File / CSV ] ──► (PapaParse Ingest) ──► [ DuckDB-WASM ] ──► Data Table   │
│                                                       │                            │
│                                                       ▼                            │
│                                            (Local Profiler Matrix)                 │
└────────────────────────────────────────────────────────────────────────────────────┘
                                                        │ (Structural Layout Only)
                                                        ▼
                                              [ Remote LLM Provider ]
```

*   **Local WebAssembly Isolation:** Datasets (CSV, TSV, JSON, or custom text blobs) are parsed locally via `PapaParse` and committed directly to an in-memory virtual instance of `duckdb-wasm` running within a sandboxed Web Worker thread.
*   **Zero Server Telemetry:** QueryMind hosts no database backend, caching clusters, logging systems, or analytics relays. Raw business records never touch any external network interfaces or systems controlled by QueryMind.
*   **Origin Sandboxing:** Data inside browser RAM is protected by the browser's native **Same-Origin Policy (SOP)**, preventing external cross-script tampering.

---

## 3. Metadata-Only LLM Egress Mitigation

QueryMind uses a two-stage structural abstraction framework to prevent Large Language Models (LLMs) from viewing or training on proprietary dataset rows.

### Turn 1: SQL Compilation Pass
Before generating a prompt payload to be sent to external LLM providers (Google Gemini, Groq, OpenAI), QueryMind passes the schema through `schemaProfiler.ts`. 
*   **Row Stripping:** The system prompt explicitly strips out individual business transaction values.
*   **Cardinality Capping:** Only column labels, structural types (e.g., `VARCHAR`, `TIMESTAMP`), and low-cardinality categorical enums consisting exclusively of structural classification markers under 10 counts (e.g., `plan_tier = ['Enterprise', 'Growth', 'Free']`) are passed to provide syntax context. 

### Turn 2: Insights Analysis Pass
When generating qualitative analytics context:
*   QueryMind computes summary statistics locally on the client main thread using JavaScript mathematical primitives (`pandas-style summaries`).
*   The LLM receives only a high-level statistical overview (such as row counts, distribution profiles, delta ratios, and outlier coordinates) instead of full dataset tables.

---

## 4. True BYOK (Bring-Your-Own-Key) Cryptographic Isolation

QueryMind acts as a direct, unmediated gateway to your authorized LLM endpoints, keeping access controls entirely in your hands.

*   **No Proxy Intermediate Routing:** API calls use native client-side `fetch()` loops routed directly from the client's network adapter to the end-provider's official REST API gateways (`https://api.groq.com`, `https://api.openai.com`, or `https://generativelanguage.googleapis.com`).
*   **Volatile Storage Constraints:** Keys are retained inside the application's runtime state memory or local browser space. No keys are ever transmitted back to QueryMind or any third-party infrastructure.
*   **Network Perimeter Alignment:** Because all connections originate from the user's local browser instance, corporate security engineers can audit, whitelist, or throttle egress traffic using standard enterprise **Secure Web Gateways (SWG)** or **Cloud Access Security Brokers (CASB)**.

---

## 5. Sandboxed Local Query Library & Collaboration Privacy

The local query persistence system is designed to remember structural blueprints while keeping them strictly separated from the actual customer data rows.

*   **Structural Context Fingerprinting:** When an analyst chooses to save a query pattern, the system runs `getFingerprint()`. This routine sorts the active schema columns into a hashed identifier string (e.g., `customer_id,mrr,plan_tier`).
*   **Safe Serialization:** `localStorage` saves *only* the user's natural language question string and the successfully validated DuckDB SQL template. It does not capture or store the database matrix rows.
*   **Secure File-Based Sharing:** Team sharing is entirely human-mediated. The `LibraryShareEngine` packages verified structural analytical blueprints into a clean JSON configuration file. Teams can share these templates manually via internal corporate communication tools without needing any cloud storage connections.
