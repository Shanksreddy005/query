import { describe, it } from 'node:test';
import assert from 'node:assert';
import { escapeCsvCell, formatSanitizedCsv } from '../src/services/csvExportSanitizer';
import { telemetryAuditor } from '../src/services/telemetryAuditor';
import { validateSqlSafety } from '../src/services/validators';
import { cleanSql } from '../src/services/sqlEngine';
import { saveApiKeyConfig, loadStoredApiKeyConfig, clearStoredApiKeyConfig } from '../src/services/keyStorage';

describe('QueryMind Release Candidate Security & Hardening Gate', () => {

  // ==========================================
  // 1. CSV Formula Injection Sanitization
  // ==========================================
  describe('1. CSV Formula Injection & RFC 4180 Sanitization', () => {
    it('escapes standard formula triggers (=, +, -, @) with single quote and RFC 4180 quotes', () => {
      const triggers = [
        '=SUM(A1:A10)',
        '+cmd|"/C calc"!A0',
        '-2+3+cmd|"/C calc"!A0',
        '@SUM(1,2)',
      ];

      for (const t of triggers) {
        const escaped = escapeCsvCell(t);
        assert.ok(escaped.startsWith('"\''), `Cell "${t}" should start with "\' but got: ${escaped}`);
        assert.ok(escaped.endsWith('"'), `Cell "${t}" should end with " but got: ${escaped}`);
      }
    });

    it('escapes formula triggers preceded by spaces, tabs, or carriage returns', () => {
      const spacedTriggers = [
        '   =1+1',
        '\t=SUM(B1:B5)',
        '\r\n=HYPERLINK("http://evil.com")',
        '  @import',
        ' \t -EXEC',
      ];

      for (const st of spacedTriggers) {
        const escaped = escapeCsvCell(st);
        assert.ok(
          escaped.includes("'"),
          `Trigger "${JSON.stringify(st)}" should contain single quote prefix in: ${escaped}`
        );
      }
    });

    it('safely handles pure finite numbers without unnecessary formula quote corruption', () => {
      assert.strictEqual(escapeCsvCell(42), '42');
      assert.strictEqual(escapeCsvCell(-15.5), '-15.5');
      assert.strictEqual(escapeCsvCell(0), '0');
      assert.strictEqual(escapeCsvCell(1000000), '1000000');
    });

    it('correctly handles RFC 4180 internal quotes, commas, and newlines', () => {
      assert.strictEqual(escapeCsvCell('Hello, World'), '"Hello, World"');
      assert.strictEqual(escapeCsvCell('He said "hello"'), '"He said ""hello"""');
      assert.strictEqual(escapeCsvCell('Line 1\nLine 2'), '"Line 1\nLine 2"');
      assert.strictEqual(escapeCsvCell(null), '');
      assert.strictEqual(escapeCsvCell(undefined), '');
    });

    it('sanitizes both headers and rows while strictly preserving original dataset objects', () => {
      const columns = ['=formula_header', 'safe_header', 'quote "header"'];
      const rows = [
        { '=formula_header': '=cmd|calc', 'safe_header': 'Normal Text', 'quote "header"': 123 },
        { '=formula_header': '-danger', 'safe_header': 'Another, with comma', 'quote "header"': -45.6 },
      ];

      // Clone original state to verify immutability
      const origCols = [...columns];
      const origRows = JSON.parse(JSON.stringify(rows));

      const csv = formatSanitizedCsv(columns, rows);

      // Verify original records were not mutated
      assert.deepStrictEqual(columns, origCols);
      assert.deepStrictEqual(rows, origRows);

      // Verify header sanitization
      assert.ok(csv.includes('"\'=formula_header"'), 'Header starting with = must be formula-escaped');
      assert.ok(csv.includes('"quote ""header"""'), 'Header with quotes must be RFC 4180 double-quoted');

      // Verify row sanitization
      assert.ok(csv.includes('"\'=cmd|calc"'), 'Row cell with =cmd|calc must be formula-escaped');
      assert.ok(csv.includes('"\' -danger"') || csv.includes('"\' -danger"'.trim()) || csv.includes("'-danger"), 'Row cell with -danger must be escaped');
      assert.ok(csv.includes('"Another, with comma"'), 'Cell with comma must be quoted');
    });
  });

  // ==========================================
  // 2. Telemetry Privacy & Prompt Protection
  // ==========================================
  describe('2. Telemetry Privacy & Non-Sensitive Operational Logging', () => {
    it('completely strips prompt text from recorded telemetry events', () => {
      telemetryAuditor.clearHistory();

      const secretUserQuestion = 'CONFIDENTIAL: What were Q3 executive bonuses for John Doe?';
      const secretSystemPrompt = 'TABLE: executive_payroll\nCOLUMNS: ssn, salary, bonus';

      const eventId = telemetryAuditor.recordOutboundDispatch({
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
        userPrompt: secretUserQuestion,
        systemPrompt: secretSystemPrompt,
        schemaColumns: ['ssn', 'salary', 'bonus'],
        requestBody: { test: true },
      });

      const event = telemetryAuditor.getHistory().find((e) => e.id === eventId);
      assert.ok(event, 'Event must be recorded');

      // Zero text retention assertions
      assert.strictEqual((event as any).userPrompt, undefined, 'userPrompt text must NOT exist in telemetry event');
      assert.strictEqual((event as any).systemPrompt, undefined, 'systemPrompt text must NOT exist in telemetry event');

      // Operational metadata assertions
      assert.strictEqual(event.promptCharCount, secretUserQuestion.length);
      assert.strictEqual(event.systemPromptCharCount, secretSystemPrompt.length);
      assert.strictEqual(event.columnCount, 3);
      assert.deepStrictEqual(event.schemaAttributesIncluded, ['ssn', 'salary', 'bonus']);
      assert.strictEqual(event.dataRowsIncludedCount, 0);
      assert.strictEqual(event.wirePayloadString, undefined, 'Wire payload must be undefined in production mode');

      // Endpoint URL must not leak api keys
      assert.ok(!event.endpointUrl.includes('?key='), 'Endpoint URL must not contain query param API key');
      assert.ok(!event.endpointUrl.includes('AIza'), 'Endpoint URL must not contain Google API key');
    });

    it('verifies dataset data leakage audit detects sensitive cell value leaks', () => {
      const dataset = [
        { customer_id: 'CUST-9921', name: 'Acme Secret Corp', revenue: 950000 },
        { customer_id: 'CUST-8832', name: 'Private Holdings Ltd', revenue: 420000 },
      ];

      // Safe metadata-only wire payload
      const safePayload = JSON.stringify({
        model: 'gemini-3.8-flash',
        schema: ['customer_id', 'name', 'revenue'],
        question: 'Count total customers',
      });
      const safeCheck = telemetryAuditor.verifyPayloadDataLeakage(safePayload, dataset);
      assert.strictEqual(safeCheck.isSafe, true);
      assert.strictEqual(safeCheck.leakedFields.length, 0);

      // Contaminated wire payload containing raw cell value
      const leakedPayload = JSON.stringify({
        model: 'gemini-3.8-flash',
        prompt: 'Filter where customer is Acme Secret Corp',
      });
      const leakCheck = telemetryAuditor.verifyPayloadDataLeakage(leakedPayload, dataset);
      assert.strictEqual(leakCheck.isSafe, false);
      assert.ok(leakCheck.leakedFields.some((f) => f.includes('Acme Secret Corp')));
    });
  });

  // ==========================================
  // 3. Gemini BYOK Key Security
  // ==========================================
  describe('3. Gemini BYOK Key Security (x-goog-api-key Header)', () => {
    it('verifies Gemini endpoint URLs in source code never contain ?key= query parameter', async () => {
      const fs = await import('node:fs');
      const aiServiceCode = fs.readFileSync('src/services/aiService.ts', 'utf-8');
      const apiKeyModalCode = fs.readFileSync('src/components/ApiKeyModal.tsx', 'utf-8');
      const onboardingModalCode = fs.readFileSync('src/components/OnboardingModal.tsx', 'utf-8');

      // Assert no occurrence of generativelanguage.*key=
      assert.ok(
        !aiServiceCode.includes('generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key='),
        'aiService.ts must not pass apiKey in URL query parameters'
      );
      assert.ok(
        !apiKeyModalCode.includes('generativelanguage.googleapis.com/v1beta/models?key='),
        'ApiKeyModal.tsx must not pass key in URL query parameters'
      );
      assert.ok(
        !onboardingModalCode.includes('generativelanguage.googleapis.com/v1beta/models?key='),
        'OnboardingModal.tsx must not pass key in URL query parameters'
      );

      // Assert presence of x-goog-api-key header
      assert.ok(
        aiServiceCode.includes("'x-goog-api-key': apiKey"),
        'aiService.ts must send x-goog-api-key header'
      );
      assert.ok(
        apiKeyModalCode.includes("'x-goog-api-key': key.trim()"),
        'ApiKeyModal.tsx must send x-goog-api-key header'
      );
      assert.ok(
        onboardingModalCode.includes("'x-goog-api-key': key.trim()"),
        'OnboardingModal.tsx must send x-goog-api-key header'
      );
    });
  });

  // ==========================================
  // 4. SQL Safety & Engine Access Gate
  // ==========================================
  describe('4. SQL Safety & Engine Access Gate', () => {
    it('blocks data mutation statements', () => {
      const mutations = [
        'DROP TABLE dataset',
        'DELETE FROM dataset WHERE id = 1',
        'UPDATE dataset SET revenue = 0',
        'INSERT INTO dataset VALUES (1, 2)',
        'ALTER TABLE dataset ADD COLUMN hacked INT',
        'TRUNCATE dataset',
      ];

      for (const sql of mutations) {
        const res = validateSqlSafety(sql, 'dataset');
        assert.strictEqual(res.isValid, false, `Expected mutation to be blocked: "${sql}"`);
      }
    });

    it('blocks filesystem, extension, and catalog access vectors', () => {
      const forbidden = [
        "SELECT * FROM read_csv('data.csv')",
        "SELECT * FROM read_parquet('/etc/passwd')",
        "SELECT * FROM read_json('/root/data.json')",
        "INSTALL httpfs",
        "LOAD httpfs",
        "PRAGMA database_list",
        "ATTACH ':memory:' AS evil",
        "SELECT * FROM sqlite_master",
        "SELECT * FROM duckdb_tables()",
      ];

      for (const sql of forbidden) {
        const res = validateSqlSafety(sql, 'dataset');
        assert.strictEqual(res.isValid, false, `Expected forbidden query to be blocked: "${sql}"`);
      }
    });

    it('blocks multi-statement execution and semicolon chaining', () => {
      const chained = [
        'SELECT * FROM dataset; DROP TABLE dataset;',
        'SELECT 1; SELECT 2;',
        'SELECT * FROM dataset; UPDATE dataset SET revenue = 100;',
      ];

      for (const sql of chained) {
        const res = validateSqlSafety(sql, 'dataset');
        assert.strictEqual(res.isValid, false, `Expected multi-statement to be blocked: "${sql}"`);
      }
    });

    it('cleans markdown wrappers, quotes, and trailing semicolons safely', () => {
      const raw = '```sql\nSELECT region, SUM(mrr) FROM "active_dataset" GROUP BY 1;\n```';
      const cleaned = cleanSql(raw, 'active_dataset');
      assert.strictEqual(cleaned, 'SELECT region, SUM(mrr) FROM "active_dataset" GROUP BY 1');

      const safety = validateSqlSafety(cleaned, 'active_dataset');
      assert.strictEqual(safety.isValid, true);
    });

    it('validates legitimate CTEs, quoted identifiers, and comments with dataset isolation', () => {
      const cteSql = `
        /* Multi-line comment explaining analysis */
        WITH regional_summary AS (
          SELECT "region", SUM("mrr") AS total_mrr
          FROM "dataset"
          GROUP BY "region"
        )
        SELECT "region", total_mrr -- trailing inline comment
        FROM regional_summary
        ORDER BY total_mrr DESC
      `;
      const safety = validateSqlSafety(cteSql, 'dataset');
      assert.strictEqual(safety.isValid, true, `Legitimate CTE with comments must pass: ${safety.errors.join(', ')}`);
    });

    it('rejects forbidden operations hidden within comments or chained queries', () => {
      const injectionAttempt = `SELECT * FROM dataset; /* hidden drop */ DROP TABLE dataset;`;
      const safety = validateSqlSafety(injectionAttempt, 'dataset');
      assert.strictEqual(safety.isValid, false);
      assert.ok(safety.errors.some(e => e.includes('Disallowed SQL keyword') || e.includes('single-statement')));
    });

    it('allows semicolons safely inside quoted string literals without false-positive statement splitting', () => {
      const literalSql = `SELECT * FROM "dataset" WHERE notes = 'first; second; third'`;
      const safety = validateSqlSafety(literalSql, 'dataset');
      assert.strictEqual(safety.isValid, true);
    });
  });

  // ==========================================
  // 5. BYOK Persistence & Volatile Memory Lifecycle
  // ==========================================
  describe('5. BYOK Persistence & Volatile Memory Lifecycle', () => {
    // Setup mock localStorage in Node.js test environment
    const mockStorage: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => { mockStorage[key] = val; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => {
        Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
      },
    };

    it('does NOT persist API key when rememberKey is false (in-memory volatile default)', () => {
      clearStoredApiKeyConfig();

      saveApiKeyConfig({
        provider: 'gemini',
        key: 'AIzaSyTestMemoryKey123',
        model: 'gemini-3.8-flash',
        rememberKey: false, // Default opt-out
      });

      const loaded = loadStoredApiKeyConfig();
      assert.strictEqual(loaded, null, 'Key must not be stored in localStorage when rememberKey is false');
    });

    it('persists API key ONLY when rememberKey is explicitly true', () => {
      clearStoredApiKeyConfig();

      saveApiKeyConfig({
        provider: 'groq',
        key: 'gsk_testOptInKey456',
        model: 'llama-3.3-70b-versatile',
        rememberKey: true, // Explicit opt-in
      });

      const loaded = loadStoredApiKeyConfig();
      assert.ok(loaded);
      assert.strictEqual(loaded?.key, 'gsk_testOptInKey456');
      assert.strictEqual(loaded?.rememberKey, true);
    });

    it('handles key replacement and transitions from persisted to volatile memory', () => {
      // 1. Initial opt-in
      saveApiKeyConfig({
        provider: 'openai',
        key: 'sk-initialKey111',
        model: 'gpt-4o',
        rememberKey: true,
      });
      assert.strictEqual(loadStoredApiKeyConfig()?.key, 'sk-initialKey111');

      // 2. Replacement with different key and opt-out
      saveApiKeyConfig({
        provider: 'openai',
        key: 'sk-replacedVolatileKey222',
        model: 'gpt-4o',
        rememberKey: false, // User turns off persistence
      });
      assert.strictEqual(loadStoredApiKeyConfig(), null, 'Storage must be purged immediately when rememberKey becomes false');
    });

    it('purges storage completely when clearStoredApiKeyConfig is called', () => {
      saveApiKeyConfig({
        provider: 'gemini',
        key: 'AIzaSyToBePurged',
        model: 'gemini-3.8-flash',
        rememberKey: true,
      });
      clearStoredApiKeyConfig();
      const loaded = loadStoredApiKeyConfig();
      assert.strictEqual(loaded, null);
    });
  });

  // ==========================================
  // 6. CSV Edge Cases: Unicode, Control Characters, Distinguishing Numbers
  // ==========================================
  describe('6. CSV Edge Cases: Unicode, Control Characters, & Number Integrity', () => {
    it('preserves Unicode international text, accented characters, and emojis cleanly', () => {
      const unicodeRow = {
        city: 'Tokyo (東京)',
        description: 'Café & Résumé ✨',
        notes: 'Price: €500 / ¥70,000',
      };
      const csv = formatSanitizedCsv(['city', 'description', 'notes'], [unicodeRow]);
      assert.ok(csv.includes('Tokyo (東京)'));
      assert.ok(csv.includes('Café & Résumé ✨'));
      assert.ok(csv.includes('Price: €500 / ¥70,000'));
    });

    it('preserves native negative floats, zeros, and numbers while escaping text formulas starting with minus', () => {
      // Numbers remain unquoted numbers
      assert.strictEqual(escapeCsvCell(-0.05), '-0.05');
      assert.strictEqual(escapeCsvCell(-125000), '-125000');
      assert.strictEqual(escapeCsvCell(0), '0');

      // Text strings starting with minus or negative numbers in string format are safely single-quoted
      const negativeText = '-1+cmd';
      assert.ok(escapeCsvCell(negativeText).startsWith('"\''));

      const whitespaceFormula = '  -2+3';
      assert.ok(escapeCsvCell(whitespaceFormula).includes("'"));
    });

    it('strips null bytes and sanitizes control characters', () => {
      const nullByteStr = 'safe\u0000text';
      assert.strictEqual(escapeCsvCell(nullByteStr), 'safetext');

      const tabPrefixed = '\t@danger';
      assert.ok(escapeCsvCell(tabPrefixed).includes("'"));
    });
  });

  // ==========================================
  // 7. DuckDB Worker Cancellation & Isolation Lifecycle
  // ==========================================
  describe('7. DuckDB Worker Cancellation & Isolation Lifecycle', () => {
    it('cancels and terminates worker cleanly without unhandled exceptions', async () => {
      const { cancelCurrentQuery, terminateDuckDBWorker } = await import('../src/services/sqlEngine');
      // Verify graceful execution in non-browser Node runtime
      await assert.doesNotReject(async () => {
        await cancelCurrentQuery();
        await terminateDuckDBWorker();
      });
    });
  });
});
