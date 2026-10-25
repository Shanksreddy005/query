# QueryMind — Final Release Candidate Verification & Production Hardening (Revised)

## 1. Executive Summary & Objectives
This plan incorporates all mandatory changes required for final release candidate verification:
1. Complete removal of API keys from Gemini request URLs, routing all key transmissions through `x-goog-api-key` headers for generation and validation.
2. Universal CSV export formula injection sanitizer (`escapeCsvValue`) applied across all export points, neutralizing formula prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`) while preserving original in-memory dataset values.
3. Strict telemetry privacy: complete removal of prompt prefixes from telemetry events by default, recording solely operational metadata (provider, model, duration, column count, row count).
4. Full validation and verification of the lexical/structural SQL safety boundary, DuckDB worker cancellation and stale-result guards, and BYOK in-memory lifecycle.
5. End-to-end execution of the test suite, TypeScript compiler, and production build to establish verified release readiness.

---

## 2. Technical Modifications & Guardrails

### A. Gemini API Key Transmission Hardening
- **Files**: `src/services/aiService.ts`, `src/components/ApiKeyModal.tsx`, `src/components/OnboardingModal.tsx`
- **Action**:
  - Replace `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}` with clean endpoint URL `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent`.
  - Add `'x-goog-api-key': apiKey` to request headers.
  - In `ApiKeyModal.tsx` and `OnboardingModal.tsx`, replace `https://generativelanguage.googleapis.com/v1beta/models?key=${key.trim()}` with `https://generativelanguage.googleapis.com/v1beta/models` and pass `headers: { 'x-goog-api-key': key.trim() }`.
  - Ensure error handlers do not leak the key into user-facing exceptions or telemetry.

### B. Universal CSV Export Formula Sanitizer
- **Files**: `src/utils/csvSanitizer.ts` (or `src/services/csvExport.ts`), `src/components/ResultsView.tsx`
- **Action**:
  - Implement `sanitizeCsvCell(val: unknown): string`:
    - Null/undefined returns empty string `""`.
    - Converts value to string without altering raw in-memory dataset records.
    - Neutralizes formula triggers: if string starts with `=`, `+`, `-`, `@`, tab (`\t`), or carriage return (`\r`), prepends single quote `'` to force spreadsheet engines (Excel, Google Sheets, LibreOffice) to treat the cell as text rather than an executable formula or external DDE link.
    - Strictly escapes quotes (`"`) as `""` and wraps fields containing commas, newlines, or quotes in RFC 4180 double quotes.
  - Apply `sanitizeCsvCell` across every header and result row cell during CSV export.
  - Document residual edge-case limitations (e.g. applications configured to ignore single quotes).

### C. Telemetry Privacy & Operational Metadata Strictness
- **Files**: `src/services/telemetryAuditor.ts`, `src/services/aiService.ts`
- **Action**:
  - Strip the `promptSnippet` / 100-character prompt prefix completely from recorded telemetry events by default.
  - Ensure only provider, model, execution duration, and schema dimension/column count are stored.
  - Verify that `captureWirePayloadInEvents` defaults to `false`.

### D. SQL Security Boundary & Worker Cancellation Verification
- **Files**: `src/services/validators.ts`, `src/services/sqlEngine.ts`
- **Action**:
  - Document validator honestly as a rigorous lexical/structural tokenizer and safety boundary.
  - Verify all execution paths pass through `validateSqlSafety`.
  - Verify rejection of unauthorized system schemas (`pg_catalog`, `information_schema`), external file operations (`read_csv`, `read_parquet`, `httpfs`), and mutation statements (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`).
  - Verify worker cancellation physical termination (`worker.terminate()`) and sequence ID incrementing to discard in-flight stale queries.

### E. Regression Testing & Production Build Gate
- **Files**: `tests/deterministic_semantic_reference.test.ts`, `tests/security_and_privacy.test.ts`
- **Action**:
  - Add automated test cases covering:
    - Gemini `x-goog-api-key` header verification (outgoing URL has no query param).
    - Formula injection escaping across all trigger prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`).
    - Telemetry event payload purity (no prompt text, no raw rows).
    - In-memory vs persistent key clearing.
  - Run `npm test`, `npm run lint`, and `npm run build`.
  - Deliver the evidence-based release report with confirmed baseline and explicit release readiness status.
