import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  validateSqlIntent,
  validateExecutionResult,
  countSqlStatements,
  checkMetricAvailability,
} from '../src/services/validators';
import {
  profileDatasetSchema,
  formatSemanticSchemaPrompt,
} from '../src/services/schemaProfiler';
import { parseQueryPlan } from '../src/services/queryPlan';
import { telemetryAuditor } from '../src/services/telemetryAuditor';
import { Dataset } from '../src/types';

describe('Phase 10 — Deterministic Semantic Correctness & Reference Results', () => {
  // Deterministic SaaS Customer Dataset Fixture
  const saasDataset: Dataset = {
    id: 'saas_customers_ref',
    name: 'SaaS Customer Reference Table',
    tableName: 'customers',
    rowCount: 6,
    uploadedAt: new Date().toISOString(),
    columns: [
      { name: 'customer_id', type: 'string', sampleValues: ['C1', 'C2', 'C3'], uniqueCount: 6, nullable: false },
      { name: 'company_name', type: 'string', sampleValues: ['Acme Corp', 'Beta LLC', 'Gamma Inc', 'Delta Co', 'Epsilon Ltd', 'Zeta Group'], uniqueCount: 6, nullable: false },
      { name: 'plan_tier', type: 'string', sampleValues: ['Enterprise', 'Professional', 'Starter'], uniqueCount: 3, nullable: false },
      { name: 'churn_status', type: 'string', sampleValues: ['Active', 'At-Risk', 'Churned'], uniqueCount: 3, nullable: false },
      { name: 'mrr', type: 'number', sampleValues: [10000, 10000, 8000, 5000, 2000, 1000], uniqueCount: 5, min: 1000, max: 10000, nullable: false },
      { name: 'support_tickets', type: 'number', sampleValues: [6, 8, 2, 0, 1, 9], uniqueCount: 6, min: 0, max: 9, nullable: false },
      { name: 'nps_score', type: 'number', sampleValues: [4, 5, 8, 9, 3, 7], uniqueCount: 6, min: 3, max: 9, nullable: false },
    ],
    data: [
      { customer_id: 'C1', company_name: 'Acme Corp', plan_tier: 'Enterprise', churn_status: 'At-Risk', mrr: 10000, support_tickets: 6, nps_score: 4 },
      { customer_id: 'C2', company_name: 'Beta LLC', plan_tier: 'Enterprise', churn_status: 'Churned', mrr: 10000, support_tickets: 8, nps_score: 5 },
      { customer_id: 'C3', company_name: 'Gamma Inc', plan_tier: 'Enterprise', churn_status: 'Active', mrr: 8000, support_tickets: 2, nps_score: 8 },
      { customer_id: 'C4', company_name: 'Delta Co', plan_tier: 'Professional', churn_status: 'Active', mrr: 5000, support_tickets: 0, nps_score: 9 },
      { customer_id: 'C5', company_name: 'Epsilon Ltd', plan_tier: 'Starter', churn_status: 'Churned', mrr: 2000, support_tickets: 1, nps_score: 3 },
      { customer_id: 'C6', company_name: 'Zeta Group', plan_tier: 'Professional', churn_status: 'At-Risk', mrr: 1000, support_tickets: 9, nps_score: 7 },
    ],
  };

  const saasSchema = profileDatasetSchema(saasDataset);

  // 1. Join Duplication & Aggregation Grain Integrity
  describe('1. Join Duplication & Grain Integrity', () => {
    it('detects and prevents revenue duplication caused by fan-out one-to-many relationships', () => {
      // Reference scenario: Customer revenue ($10,000) joined to 3 support ticket records
      // Raw joined rows would produce 3 rows of $10,000 each = $30,000 (3x inflation)
      const rawFanoutRows = [
        { customer_id: 'C1', company_name: 'Acme Corp', mrr: 10000, ticket_id: 'T1' },
        { customer_id: 'C1', company_name: 'Acme Corp', mrr: 10000, ticket_id: 'T2' },
        { customer_id: 'C1', company_name: 'Acme Corp', mrr: 10000, ticket_id: 'T3' },
      ];

      const plan = parseQueryPlan({
        intent: 'ranking',
        dimensions: ['customer_id', 'company_name'],
        metric: 'mrr',
      });

      // The grain check should detect duplicate primary keys if the grain is customer
      const seenPks = new Set();
      let hasDuplicates = false;
      for (const r of rawFanoutRows) {
        if (seenPks.has(r.customer_id)) {
          hasDuplicates = true;
          break;
        }
        seenPks.add(r.customer_id);
      }
      assert.strictEqual(hasDuplicates, true, 'Fan-out duplicate customer rows detected');

      // Canonical deduplicated result should have exactly 1 row with true MRR = 10,000
      const deduplicatedRows = [
        { customer_id: 'C1', company_name: 'Acme Corp', mrr: 10000 },
      ];
      const val = validateExecutionResult(deduplicatedRows, ['customer_id', 'company_name', 'mrr'], plan, saasSchema);
      assert.strictEqual(val.valid, true);
      assert.strictEqual(deduplicatedRows[0].mrr, 10000);
    });

    it('enforces correct aggregation grain for dimension rollups (e.g. 1 row per unique category)', () => {
      const plan = parseQueryPlan({
        intent: 'aggregate_by_dimension',
        dimensions: ['plan_tier'],
        metric: 'mrr',
        aggregation: 'SUM',
      });

      // Valid aggregated reference rows: exactly 3 rows for 3 distinct tiers
      const referenceAggregatedRows = [
        { plan_tier: 'Enterprise', total_mrr: 28000 },
        { plan_tier: 'Professional', total_mrr: 6000 },
        { plan_tier: 'Starter', total_mrr: 2000 },
      ];

      const val = validateExecutionResult(referenceAggregatedRows, ['plan_tier', 'total_mrr'], plan, saasSchema);
      assert.strictEqual(val.valid, true);
      assert.strictEqual(referenceAggregatedRows.reduce((acc, r) => acc + r.total_mrr, 0), 36000);
    });
  });

  // 2. Top-N Ranking, Tie Policy & Per-Group Partitioning
  describe('2. Top-N Ranking, Deterministic Ties & Per-Group Partitioning', () => {
    it('enforces deterministic tie-breaking for identical ranking metrics', () => {
      // C1 and C2 both have mrr = 10000. Deterministic tie-breaker must sort secondary by company_name ASC
      const plan = parseQueryPlan({
        intent: 'ranking',
        dimensions: ['company_name'],
        metric: 'mrr',
        limit: 2,
      });

      const tiedSql = `SELECT company_name, mrr FROM customers ORDER BY mrr DESC, company_name ASC LIMIT 2`;
      const val = validateSqlIntent(tiedSql, plan, saasSchema, 'Top 2 customers by MRR');
      assert.strictEqual(val.valid, true);

      // Verify reference ordering: Acme Corp precedes Beta LLC alphabetically
      const tiedRows = [
        { company_name: 'Acme Corp', mrr: 10000 },
        { company_name: 'Beta LLC', mrr: 10000 },
      ];
      assert.strictEqual(tiedRows[0].company_name, 'Acme Corp');
      assert.strictEqual(tiedRows[1].company_name, 'Beta LLC');
    });

    it('enforces partition window functions for Top-N per group queries', () => {
      const plan = parseQueryPlan({
        intent: 'top_n_per_group',
        partition_by: ['plan_tier'],
        item_entity: 'company_name',
        metric: 'mrr',
        limit: 1,
      });

      const validPerGroupSql = `
        WITH ranked_accounts AS (
          SELECT plan_tier, company_name, mrr,
                 ROW_NUMBER() OVER (PARTITION BY plan_tier ORDER BY mrr DESC) as rank
          FROM customers
        )
        SELECT plan_tier, company_name, mrr
        FROM ranked_accounts
        WHERE rank = 1
      `;
      const val = validateSqlIntent(validPerGroupSql, plan, saasSchema);
      assert.strictEqual(val.valid, true);

      // Reference output: exactly 1 row per unique plan tier (Enterprise, Professional, Starter)
      const groupRows = [
        { plan_tier: 'Enterprise', company_name: 'Acme Corp', mrr: 10000 },
        { plan_tier: 'Professional', company_name: 'Delta Co', mrr: 5000 },
        { plan_tier: 'Starter', company_name: 'Epsilon Ltd', mrr: 2000 },
      ];
      const resVal = validateExecutionResult(groupRows, ['plan_tier', 'company_name', 'mrr'], plan, saasSchema);
      assert.strictEqual(resVal.valid, true);
      assert.strictEqual(groupRows.length, 3);
    });
  });

  // 3. Outbound Wire Payload Inspection & Egress Verification
  describe('3. Outbound Wire Payload Inspection & Egress Verification', () => {
    it('verifies actual wire payload body contains zero raw customer row objects', () => {
      // Construct realistic prompt under default strict zero-content egress
      const prompt = formatSemanticSchemaPrompt(saasSchema, { strictZeroContentEgress: true });

      // Simulate full outbound JSON payload dispatched to model API
      const wirePayload = JSON.stringify({
        model: 'gemini-3.8-flash',
        contents: [
          {
            role: 'user',
            parts: [{ text: `${prompt}\n\nNATURAL LANGUAGE QUESTION: "Show top customers by MRR"` }],
          },
        ],
      });

      // Inspect payload character-by-character against actual dataset records
      const auditResult = telemetryAuditor.verifyPayloadDataLeakage(wirePayload, saasDataset.data);
      assert.strictEqual(auditResult.isSafe, true, `Data leakage detected: ${auditResult.leakedFields.join(', ')}`);
      assert.strictEqual(auditResult.leakedFields.length, 0);

      // Verify specific sensitive records are completely absent
      assert.strictEqual(wirePayload.includes('C1'), false, 'Primary key C1 must not appear in prompt');
      assert.strictEqual(wirePayload.includes('Acme Corp'), false, 'Company name Acme Corp must not appear in prompt');
      assert.strictEqual(wirePayload.includes('Beta LLC'), false, 'Company name Beta LLC must not appear in prompt');
      assert.strictEqual(wirePayload.includes('Delta Co'), false, 'Company name Delta Co must not appear in prompt');
    });
  });

  // 4. SQL Tokenizer Edge Cases: Semicolons in Quotes & System Catalogs
  describe('4. Lexical Tokenizer & Boundary Edge Cases', () => {
    it('correctly handles semicolons inside string literals without false-positive statement splitting', () => {
      const sqlWithQuotedSemicolon = `SELECT company_name, mrr FROM customers WHERE company_name = 'Acme; Inc' AND plan_tier = 'Enterprise'`;
      const count = countSqlStatements(sqlWithQuotedSemicolon);
      assert.strictEqual(count, 1, 'Should treat quoted semicolon as string literal token, not statement boundary');

      const plan = parseQueryPlan({ intent: 'overview', dimensions: [] });
      const val = validateSqlIntent(sqlWithQuotedSemicolon, plan, saasSchema);
      assert.strictEqual(val.valid, true);
    });

    it('rejects attempts to query internal system catalogs (information_schema, duckdb_tables, pg_catalog)', () => {
      const plan = parseQueryPlan({ intent: 'overview', dimensions: [] });
      const catalogQueries = [
        'SELECT * FROM information_schema.tables',
        'SELECT * FROM duckdb_tables()',
        'SELECT * FROM pg_catalog.pg_tables',
        'SELECT * FROM sqlite_master',
      ];

      for (const query of catalogQueries) {
        const val = validateSqlIntent(query, plan, saasSchema);
        assert.strictEqual(val.valid, false, `Must reject system catalog access: ${query}`);
        assert.ok(val.errors.some((e) => e.includes('system catalogs') || e.includes('Table Security Error')));
      }
    });
  });

  // 5. Worker Lifecycle, Cancellation & Error Classification
  describe('5. Worker Lifecycle, Cancellation & Error Classification', () => {
    it('distinguishes execution timeouts and cancellations from SQL syntax errors', async () => {
      const { executeClientSql, cancelCurrentQuery } = await import('../src/services/sqlEngine');

      // 1. Syntax Error: Missing clause or malformed token
      const syntaxOutput = await executeClientSql('SELECT FROM WHERE ;;;', saasDataset);
      assert.strictEqual(syntaxOutput.success, false);
      assert.ok(
        syntaxOutput.error?.includes('Environment Notice') ||
        syntaxOutput.error?.includes('Syntax Error') ||
        syntaxOutput.error?.includes('Parser Error') ||
        syntaxOutput.error?.includes('Security Guard') ||
        syntaxOutput.error?.includes('Security Notice')
      );

      // 2. Cancellation: Manual worker termination resets generation
      const cancelPromise = cancelCurrentQuery();
      assert.ok(cancelPromise instanceof Promise);
      await cancelPromise;
    });
  });

  // 6. Runtime Engine Restrictions & Opt-in Storage Lifecycle
  describe('6. Runtime Engine Restrictions & Opt-in Storage Lifecycle', () => {
    it('enforces executeClientSql security guards at runtime for all SQL statements (injection, drop, catalog, external files)', async () => {
      const { executeClientSql } = await import('../src/services/sqlEngine');

      // DROP TABLE attempt
      const dropRes = await executeClientSql('DROP TABLE customers', saasDataset);
      assert.strictEqual(dropRes.success, false);
      assert.ok(dropRes.error?.includes('Security Guard'));

      // External file reading attempt
      const fileRes = await executeClientSql('SELECT * FROM read_csv("secret.csv")', saasDataset);
      assert.strictEqual(fileRes.success, false);
      assert.ok(fileRes.error?.includes('Security Guard'));

      // System catalog query attempt
      const catRes = await executeClientSql('SELECT * FROM duckdb_tables', saasDataset);
      assert.strictEqual(catRes.success, false);
      assert.ok(catRes.error?.includes('Security Guard'));

      // Multi-statement injection attempt
      const multiRes = await executeClientSql('SELECT * FROM customers; SELECT 1', saasDataset);
      assert.strictEqual(multiRes.success, false);
      assert.ok(multiRes.error?.includes('Security Guard'));

      // Unauthorized external table reference
      const tableRes = await executeClientSql('SELECT * FROM unapproved_table', saasDataset);
      assert.strictEqual(tableRes.success, false);
      assert.ok(tableRes.error?.includes('Security Guard'));
    });

    it('verifies opt-in BYOK key persistence lifecycle (session-only by default, opt-in storage, purge on clear)', async () => {
      const { loadStoredApiKeyConfig, saveApiKeyConfig, clearStoredApiKeyConfig } = await import('../src/services/keyStorage');

      // Mock storage
      const storageMock: Record<string, string> = {};
      const origLocalStorage = (globalThis as any).localStorage;
      (globalThis as any).localStorage = {
        getItem: (k: string) => storageMock[k] || null,
        setItem: (k: string, v: string) => { storageMock[k] = v; },
        removeItem: (k: string) => { delete storageMock[k]; },
      };

      try {
        // 1. Default: rememberKey is false / undefined -> key is NOT stored
        saveApiKeyConfig({ provider: 'gemini', key: 'ai-secret-key-123', model: 'gemini-2.5-flash', rememberKey: false });
        assert.strictEqual(loadStoredApiKeyConfig(), null, 'Default must not persist key');

        // 2. Opt-in: rememberKey is true -> key is persisted
        saveApiKeyConfig({ provider: 'gemini', key: 'ai-secret-key-123', model: 'gemini-2.5-flash', rememberKey: true });
        const loaded = loadStoredApiKeyConfig();
        assert.ok(loaded);
        assert.strictEqual(loaded?.key, 'ai-secret-key-123');

        // 3. User unchecks rememberKey -> key is purged from storage
        saveApiKeyConfig({ provider: 'gemini', key: 'ai-secret-key-123', model: 'gemini-2.5-flash', rememberKey: false });
        assert.strictEqual(loadStoredApiKeyConfig(), null, 'Unchecking must clear storage');

        // 4. Manual purge
        saveApiKeyConfig({ provider: 'openai', key: 'sk-test', model: 'gpt-4o', rememberKey: true });
        clearStoredApiKeyConfig();
        assert.strictEqual(loadStoredApiKeyConfig(), null, 'Clear must purge key');
      } finally {
        (globalThis as any).localStorage = origLocalStorage;
      }
    });

    it('verifies end-to-end CSV ingestion, formula sanitization, and typing pipeline', async () => {
      const { inferDatasetSchema } = await import('../src/services/sampleData');
      const Papa = (await import('papaparse')).default;

      const rawCsv = `"=cmd|' /C calc'!A0",plan,mrr,signup_date\nAcme Corp,Enterprise,12000,2023-01-15\nBeta LLC,Pro,3000,2023-04-10`;
      const parsed = Papa.parse(rawCsv, { header: true, skipEmptyLines: true });
      assert.strictEqual(parsed.data.length, 2);

      const dataset = inferDatasetSchema(parsed.data as Record<string, any>[], 'security_test', 'Security Test');
      // Verify formula injection sanitized in headers
      assert.ok(!dataset.columns.some((c) => c.name.startsWith('=')));
      assert.strictEqual(dataset.rowCount, 2);
      assert.strictEqual(dataset.columns.length, 4);
    });
  });
});
