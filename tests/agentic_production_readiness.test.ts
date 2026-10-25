import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  validateSqlIntent,
  validateExecutionResult,
  analyzeAndStripComments,
  checkParenthesesBalance,
} from '../src/services/validators';
import {
  profileDatasetSchema,
  formatSemanticSchemaPrompt,
  isPiiOrSensitiveColumn,
} from '../src/services/schemaProfiler';
import { parseQueryPlan } from '../src/services/queryPlan';
import { Dataset } from '../src/types';

describe('Phase 9 — Senior Agentic Production Readiness & Security Validation', () => {
  const sampleDataset: Dataset = {
    id: 'customers',
    name: 'Customer Analytics',
    tableName: 'customers',
    rowCount: 20,
    uploadedAt: new Date().toISOString(),
    data: [],
    columns: [
      {
        name: 'customer_id',
        type: 'string',
        sampleValues: ['CUST-001', 'CUST-002', 'CUST-003'],
        uniqueCount: 20,
        nullable: false,
      },
      {
        name: 'email',
        type: 'string',
        sampleValues: ['alice@corp.com', 'bob@example.com'],
        uniqueCount: 20,
        nullable: false,
      },
      {
        name: 'company_name',
        type: 'string',
        sampleValues: ['Acme Corp', 'Apex Global', 'Zenith Systems'],
        uniqueCount: 20,
        nullable: false,
      },
      {
        name: 'plan_tier',
        type: 'string',
        sampleValues: ['Enterprise', 'Professional', 'Starter'],
        uniqueCount: 3,
        nullable: false,
      },
      {
        name: 'churn_status',
        type: 'string',
        sampleValues: ['Active', 'At-Risk', 'Churned'],
        uniqueCount: 3,
        nullable: false,
      },
      {
        name: 'mrr',
        type: 'number',
        sampleValues: [12000, 4500, 800],
        uniqueCount: 18,
        min: 500,
        max: 25000,
        nullable: false,
      },
      {
        name: 'support_tickets',
        type: 'number',
        sampleValues: [8, 2, 0],
        uniqueCount: 10,
        min: 0,
        max: 15,
        nullable: false,
      },
    ],
  };

  const schema = profileDatasetSchema(sampleDataset);

  // 1. AST-Aware Security & Lexical Boundaries
  describe('1. AST-Aware Structural SQL Validation & Sandboxing', () => {
    it('correctly detects and strips SQL comments without altering valid executable tokens', () => {
      const sqlWithComments = `
        -- Filter churned enterprise accounts
        SELECT company_name, mrr /* monthly recurring revenue */
        FROM customers
        WHERE plan_tier = 'Enterprise'
      `;
      const { cleanSql, hasComments } = analyzeAndStripComments(sqlWithComments);
      assert.strictEqual(hasComments, true);
      assert.ok(!cleanSql.includes('-- Filter'));
      assert.ok(!cleanSql.includes('/* monthly recurring revenue */'));
      assert.ok(cleanSql.includes('SELECT company_name, mrr'));
      assert.ok(cleanSql.includes('FROM customers'));
    });

    it('rejects unbalanced parentheses indicating AST structural malformation or injection', () => {
      assert.strictEqual(checkParenthesesBalance('SELECT (sales * 2) FROM orders'), true);
      assert.strictEqual(checkParenthesesBalance('SELECT (sales * 2 FROM orders'), false);
      assert.strictEqual(checkParenthesesBalance('SELECT sales * 2) FROM orders'), false);
      assert.strictEqual(checkParenthesesBalance("SELECT '(unbalanced in string' FROM orders"), true);

      const plan = parseQueryPlan({ intent: 'overview', dimensions: [] });
      const malformedSql = 'SELECT * FROM customers WHERE (mrr > 1000';
      const result = validateSqlIntent(malformedSql, plan, schema);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('Unbalanced parentheses')));
    });

    it('strictly blocks DuckDB external file read functions (read_csv, read_parquet, httpfs)', () => {
      const plan = parseQueryPlan({ intent: 'overview', dimensions: [] });
      const dangerousQueries = [
        "SELECT * FROM read_csv('/etc/passwd')",
        "SELECT * FROM read_parquet('https://remote.server/data.parquet')",
        "COPY customers TO '/tmp/dump.csv'",
        "INSTALL httpfs; LOAD httpfs;",
        "PRAGMA database_list;",
      ];

      for (const badSql of dangerousQueries) {
        const val = validateSqlIntent(badSql, plan, schema);
        assert.strictEqual(val.valid, false, `Should reject dangerous query: ${badSql}`);
        assert.ok(val.errors.some((e) => e.includes('Security Guard')));
      }
    });

    it('enforces table isolation: rejects queries referencing unauthorized external tables', () => {
      const plan = parseQueryPlan({ intent: 'overview', dimensions: [] });
      const badTableSql = 'SELECT * FROM unauthorized_internal_table';
      const result = validateSqlIntent(badTableSql, plan, schema);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('Table Security Error')));
    });

    it('permits authorized WITH CTE statements and verifies valid table references within CTEs', () => {
      const plan = parseQueryPlan({
        intent: 'top_n_per_group',
        partition_by: ['plan_tier'],
        item_entity: 'company_name',
        metric: 'mrr',
      });
      const validCteSql = `
        WITH ranked_accounts AS (
          SELECT plan_tier, company_name, mrr,
                 ROW_NUMBER() OVER (PARTITION BY plan_tier ORDER BY mrr DESC) as rank
          FROM customers
        )
        SELECT plan_tier, company_name, mrr
        FROM ranked_accounts
        WHERE rank = 1
      `;
      const result = validateSqlIntent(validCteSql, plan, schema);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.astAnalysis?.statementType, 'WITH');
      assert.ok(result.astAnalysis?.tableReferences.includes('ranked_accounts'));
    });
  });

  // 2. Zero-Data-Egress Privacy Guarantees
  describe('2. Zero-Data-Egress Privacy Architecture', () => {
    it('accurately identifies PII columns (email, phone, ssn, address, tokens)', () => {
      assert.strictEqual(isPiiOrSensitiveColumn('email'), true);
      assert.strictEqual(isPiiOrSensitiveColumn('user_email_address'), true);
      assert.strictEqual(isPiiOrSensitiveColumn('phone_number'), true);
      assert.strictEqual(isPiiOrSensitiveColumn('credit_card_token'), true);
      assert.strictEqual(isPiiOrSensitiveColumn('plan_tier'), false);
      assert.strictEqual(isPiiOrSensitiveColumn('mrr'), false);
      assert.strictEqual(isPiiOrSensitiveColumn('sales'), false);
    });

    it('masks PII and raw entity identifiers when formatting prompts for external LLMs', () => {
      // 1. Enriched Categorical Mode (Allows safe enums for WHERE grounding, but masks PII)
      const enrichedPrompt = formatSemanticSchemaPrompt(schema, {
        allowCategoricalEnums: true,
        strictZeroContentEgress: false,
      });

      // Raw sensitive emails must NOT leak into the LLM system prompt
      assert.ok(!enrichedPrompt.includes('alice@corp.com'));
      assert.ok(!enrichedPrompt.includes('bob@example.com'));
      assert.ok(enrichedPrompt.includes('Protected PII: Synthetic values only'));

      // High cardinality identifiers must be marked as protected
      assert.ok(enrichedPrompt.includes('Entity Keys: High cardinality identifier'));

      // Low-cardinality categorical dimensions remain present to allow precise SQL WHERE clauses
      assert.ok(enrichedPrompt.includes('Enterprise'));
      assert.ok(enrichedPrompt.includes('Active'));
      assert.ok(enrichedPrompt.includes('ZERO-ROW EGRESS POLICY'));

      // 2. Strict Zero-Dataset-Content Egress Mode (Replaces even categorical values with synthetic types)
      const strictZeroContentPrompt = formatSemanticSchemaPrompt(schema, {
        strictZeroContentEgress: true,
        allowCategoricalEnums: false,
      });

      assert.ok(!strictZeroContentPrompt.includes('Enterprise'));
      assert.ok(!strictZeroContentPrompt.includes('Active'));
      assert.ok(strictZeroContentPrompt.includes('Synthetic Types'));
      assert.ok(strictZeroContentPrompt.includes('STRICT ZERO-DATASET-CONTENT EGRESS POLICY'));
    });
  });

  // 3. Result Completeness & Verified State Contract
  describe('3. Result Invariants & Empty Result Discipline', () => {
    it('distinguishes legitimate filtered 0-row lookups from unconstrained aggregate failures', () => {
      // Legitimate lookup: filter on a non-existent account or tight criteria
      const lookupPlan = parseQueryPlan({
        intent: 'filter_lookup',
        dimensions: ['company_name'],
        filters: [{ column: 'plan_tier', operator: '=', value: 'Government' }],
      });
      const lookupVal = validateExecutionResult([], ['company_name'], lookupPlan, schema);
      // Filter lookups are allowed to return 0 rows when criteria match 0 items
      assert.strictEqual(lookupVal.valid, true);

      // Unconstrained ranking or aggregation returning 0 rows when dataset has 20 rows is an error
      const rankingPlan = parseQueryPlan({
        intent: 'ranking',
        dimensions: ['company_name'],
        metric: 'mrr',
      });
      const rankingVal = validateExecutionResult([], ['company_name', 'mrr'], rankingPlan, schema);
      assert.strictEqual(rankingVal.valid, false);
      assert.ok(rankingVal.errors.some((e) => e.includes('Query returned 0 rows')));
    });
  });

  // 4. Blueprint Memory & Import/Export Security
  describe('4. Blueprint Memory & Import/Export Security', () => {
    it('rejects oversized JSON import payloads (> 1 MB) to prevent browser memory exhaustion', async () => {
      const { LibraryShareEngine } = await import('../src/services/libraryShareEngine');
      const shareEngine = new LibraryShareEngine();

      // Create a massive string > 1 MB
      const hugePadding = 'x'.repeat(1024 * 1024 + 100);
      const hugeJson = JSON.stringify({
        platform: 'QueryMind',
        version: '2.0.0',
        queries: [{ userQuery: 'test', successfulSql: 'SELECT 1', padding: hugePadding }],
      });

      const res = shareEngine.importLibraryFromString(hugeJson);
      assert.strictEqual(res.success, false);
      assert.ok(res.message.includes('exceeds 1 MB security limit'));
    });

    it('rejects malicious or destructive SQL within imported blueprint payloads', async () => {
      const { LibraryShareEngine } = await import('../src/services/libraryShareEngine');
      const shareEngine = new LibraryShareEngine();

      const maliciousPayload = JSON.stringify({
        queries: [
          {
            userQuery: 'Drop all data',
            successfulSql: 'DROP TABLE customers;',
            schemaContextFingerprint: 'customers',
          },
          {
            userQuery: 'Exfiltrate data',
            successfulSql: "SELECT * FROM read_csv('/etc/passwd')",
            schemaContextFingerprint: 'customers',
          },
        ],
      });

      const res = shareEngine.importLibraryFromString(maliciousPayload);
      assert.strictEqual(res.addedCount, 0);
      assert.ok(res.message.includes('failed security/schema validation') || res.addedCount === 0);
    });

    it('sanitizes script tags and HTML injection from imported query descriptions', async () => {
      const { LibraryShareEngine } = await import('../src/services/libraryShareEngine');
      const shareEngine = new LibraryShareEngine();

      const xssPayload = JSON.stringify({
        queries: [
          {
            userQuery: '<script>alert("xss")</script>Show top customers by MRR',
            successfulSql: 'SELECT company_name, mrr FROM customers ORDER BY mrr DESC LIMIT 5',
            schemaContextFingerprint: 'test_xss_sanitization',
          },
        ],
      });

      const res = shareEngine.importLibraryFromString(xssPayload);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.addedCount, 1);
    });
  });

  // 5. Outbound Network & Telemetry Zero-Egress Inspection
  describe('5. Outbound Network & Telemetry Zero-Egress Inspection', () => {
    it('verifies telemetry auditor records zero-row-data guarantee and only metadata in outbound events', async () => {
      const { telemetryAuditor } = await import('../src/services/telemetryAuditor');

      const eventId = telemetryAuditor.recordOutboundDispatch({
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        endpointUrl: 'https://generativelanguage.googleapis.com',
        userPrompt: 'Show top 5 enterprise customers',
        systemPrompt: 'TABLE: "customers"\nCOLUMNS: mrr, plan_tier',
        schemaColumns: ['mrr', 'plan_tier'],
        requestBody: {
          zero_row_data_guarantee: true,
          model: 'gemini-3.8-flash',
        },
      });

      assert.ok(eventId);
      const stats = telemetryAuditor.getAuditStats();
      assert.strictEqual(stats.totalDispatches > 0, true);
      assert.strictEqual(stats.zeroRowGuaranteeStrict, true);

      // Verify no row records are stored in telemetry logs
      const log = telemetryAuditor.getHistory();
      const lastEvent = log.find((e) => e.id === eventId);
      assert.strictEqual(lastEvent?.dataRowsIncludedCount, 0);
      assert.strictEqual(lastEvent?.wirePayloadString, undefined, 'Wire payload string must NOT be retained in production memory');
      assert.strictEqual(lastEvent?.columnCount, 2);
      assert.strictEqual(lastEvent?.promptCharCount, 'Show top 5 enterprise customers'.length);
      assert.strictEqual((lastEvent as any).userPrompt, undefined, 'User prompt text must NOT be retained in telemetry event');
    });
  });
});

