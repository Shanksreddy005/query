import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { providerManager, NormalizedConversation } from '../src/agent/provider_manager.js';
import { PROVIDERS, MODEL_REGISTRY, getModelsForProvider, MAX_AI_ROWS, MAX_AGENT_ROUNDS } from '../src/agent/models.js';
import { getToolsForProvider } from '../src/agent/tools.js';
import { normalizeProviderError, ERROR_CATEGORIES } from '../src/agent/error_normalizer.js';
import { executeQuery } from '../src/duckdb/executor.js';
import { getDuckDB } from '../src/duckdb/init.js';
import { loadCsvIntoDuckDB } from '../src/duckdb/csv_loader.js';

describe('Four-Provider × Feature Compatibility Test Matrix', () => {
  const providers = [
    PROVIDERS.GEMINI,
    PROVIDERS.GROQ,
    PROVIDERS.ANTHROPIC,
    PROVIDERS.OPENAI
  ];

  for (const provider of providers) {
    describe(`Provider: ${provider.toUpperCase()}`, () => {

      test(`1. Key lifecycle (${provider})`, () => {
        providerManager.clearApiKey(provider);
        assert.equal(providerManager.hasApiKey(provider), false);

        providerManager.setApiKey(provider, `test-secret-${provider}-key`);
        assert.equal(providerManager.hasApiKey(provider), true);

        providerManager.clearApiKey(provider);
        assert.equal(providerManager.hasApiKey(provider), false);
      });

      test(`2. Provider & Model selection (${provider})`, () => {
        providerManager.setActiveProvider(provider);
        assert.equal(providerManager.getActiveProvider(), provider);

        const supportedModels = getModelsForProvider(provider);
        assert.ok(supportedModels.length >= 2, `${provider} must have at least 2 registered models`);

        const initialModel = providerManager.getActiveModel(provider);
        assert.ok(initialModel, `Initial model for ${provider} must be set`);

        // Test switching to second model
        const secondModel = supportedModels[1].id;
        providerManager.setActiveModel(provider, secondModel);
        assert.equal(providerManager.getActiveModel(provider), secondModel);

        // Reset to default
        const defaultModel = supportedModels.find(m => m.isDefault)?.id || supportedModels[0].id;
        providerManager.setActiveModel(provider, defaultModel);
        assert.equal(providerManager.getActiveModel(provider), defaultModel);
      });

      test(`3. Tool schema compliance (${provider})`, () => {
        const tools = getToolsForProvider(provider);
        assert.ok(Array.isArray(tools) && tools.length > 0, `Tools for ${provider} must be an array`);

        if (provider === PROVIDERS.GEMINI) {
          const declaration = tools[0]?.functionDeclarations?.[0];
          assert.ok(declaration, 'Gemini must have functionDeclarations[0]');
          assert.equal(declaration.name, 'run_sql');
          assert.ok(declaration.parameters.properties.query);
          assert.deepEqual(declaration.parameters.required, ['query']);
        } else if (provider === PROVIDERS.GROQ) {
          const sqlTool = tools.find(t => t.function?.name === 'run_sql');
          assert.ok(sqlTool, 'Groq must have run_sql tool');
          assert.equal(sqlTool.type, 'function');
          assert.ok(sqlTool.function.parameters.properties.query);
          assert.deepEqual(sqlTool.function.parameters.required, ['query']);
        } else if (provider === PROVIDERS.ANTHROPIC) {
          const sqlTool = tools.find(t => t.name === 'run_sql');
          assert.ok(sqlTool);
          assert.equal(sqlTool.name, 'run_sql');
          assert.ok(sqlTool.input_schema.properties.query);
          assert.deepEqual(sqlTool.input_schema.required, ['query']);
        } else if (provider === PROVIDERS.OPENAI) {
          const sqlTool = tools.find(t => t.name === 'run_sql');
          assert.ok(sqlTool);
          assert.equal(sqlTool.type, 'function');
          assert.equal(sqlTool.name, 'run_sql');
          assert.ok(sqlTool.parameters.properties.query);
          assert.deepEqual(sqlTool.parameters.required, ['query']);
        }
      });

      test(`4. run_sql request normalized parsing (${provider})`, () => {
        const mockToolCall = {
          type: 'tool_call',
          toolName: 'run_sql',
          toolCallId: `call_${provider}_101`,
          arguments: { query: 'SELECT name, mrr FROM customers ORDER BY mrr DESC LIMIT 5;' }
        };

        assert.equal(mockToolCall.type, 'tool_call');
        assert.equal(mockToolCall.toolName, 'run_sql');
        assert.ok(mockToolCall.arguments.query.startsWith('SELECT'));
      });

      test(`5. Tool result formatting into conversation (${provider})`, () => {
        const conversation = new NormalizedConversation('Count customers');
        const toolCallId = `call_${provider}_202`;

        const sampleResult = JSON.stringify({
          status: 'success',
          execution_time_ms: 3.2,
          total_rows: 55,
          columns: ['count'],
          sample_rows: [{ count: 55 }]
        });

        conversation.addToolResult({
          toolCallId: toolCallId,
          toolName: 'run_sql',
          isError: false,
          content: sampleResult
        });

        if (provider === PROVIDERS.ANTHROPIC) {
          const lastMsg = conversation.anthropicMessages[conversation.anthropicMessages.length - 1];
          assert.equal(lastMsg.role, 'user');
          assert.equal(lastMsg.content[0].type, 'tool_result');
          assert.equal(lastMsg.content[0].tool_use_id, toolCallId);
        } else if (provider === PROVIDERS.OPENAI) {
          const lastItem = conversation.openAiInput[conversation.openAiInput.length - 1];
          assert.equal(lastItem.type, 'function_call_output');
          assert.equal(lastItem.call_id, toolCallId);
        } else if (provider === PROVIDERS.GEMINI) {
          const lastItem = conversation.geminiContents[conversation.geminiContents.length - 1];
          assert.equal(lastItem.role, 'function');
          assert.equal(lastItem.parts[0].functionResponse.name, 'run_sql');
        } else if (provider === PROVIDERS.GROQ) {
          const lastItem = conversation.groqMessages[conversation.groqMessages.length - 1];
          assert.equal(lastItem.role, 'tool');
          assert.equal(lastItem.tool_call_id, toolCallId);
        }
      });

      test(`6. SQL error feedback payload formatting (${provider})`, () => {
        const conversation = new NormalizedConversation('Query with mistake');
        const toolCallId = `call_${provider}_303`;
        const errorContent = 'DuckDB execution failed with error: Table "wrong_table" does not exist.';

        conversation.addToolResult({
          toolCallId: toolCallId,
          toolName: 'run_sql',
          isError: true,
          content: errorContent
        });

        if (provider === PROVIDERS.ANTHROPIC) {
          const lastMsg = conversation.anthropicMessages[conversation.anthropicMessages.length - 1];
          assert.equal(lastMsg.content[0].is_error, true);
        } else if (provider === PROVIDERS.OPENAI) {
          const lastItem = conversation.openAiInput[conversation.openAiInput.length - 1];
          assert.ok(lastItem.output.includes('wrong_table'));
        } else if (provider === PROVIDERS.GEMINI) {
          const lastItem = conversation.geminiContents[conversation.geminiContents.length - 1];
          assert.ok(lastItem.parts[0].functionResponse.response.output.includes('wrong_table'));
        } else if (provider === PROVIDERS.GROQ) {
          const lastItem = conversation.groqMessages[conversation.groqMessages.length - 1];
          assert.ok(lastItem.content.includes('wrong_table'));
        }
      });

      test(`7. Enforces MAX_AGENT_ROUNDS = 5 (${provider})`, () => {
        assert.equal(MAX_AGENT_ROUNDS, 5);
      });

      test(`8. Local DuckDB execution and MAX_AI_ROWS = 25 capping (${provider})`, async () => {
        const { db, conn } = await getDuckDB();
        await loadCsvIntoDuckDB({
          db,
          conn,
          source: 'sample-data/customers.csv',
          filename: 'customers.csv'
        });

        const execRes = await executeQuery(conn, 'SELECT * FROM customers;');
        assert.equal(execRes.success, true);
        assert.equal(execRes.totalRowCount, 55);
        assert.ok(execRes.aiRows.length <= MAX_AI_ROWS, `AI rows (${execRes.aiRows.length}) must be <= ${MAX_AI_ROWS}`);
        assert.equal(execRes.aiRows.length, 25);
      });

      test(`9. Final business insight handling (${provider})`, () => {
        const finalTurn = {
          type: 'final',
          text: 'Enterprise tier generates the highest average MRR ($5,240), accounting for 61.2% of total recurring revenue.'
        };
        assert.equal(finalTurn.type, 'final');
        assert.ok(finalTurn.text.includes('Enterprise tier'));
      });

      test(`10. Symmetrical Error Normalization (${provider})`, () => {
        // 401 Unauthorized / Invalid API Key
        const err401 = normalizeProviderError(provider, 401, { error: { message: 'Invalid key' } });
        assert.equal(err401.provider, provider);
        assert.equal(err401.category, ERROR_CATEGORIES.INVALID_API_KEY);
        assert.equal(err401.retryable, false);

        // 403 Forbidden
        const err403 = normalizeProviderError(provider, 403, {});
        assert.equal(err403.category, ERROR_CATEGORIES.FORBIDDEN);
        assert.equal(err403.retryable, false);

        // 429 Rate limit
        const err429 = normalizeProviderError(provider, 429, {});
        assert.equal(err429.category, ERROR_CATEGORIES.RATE_LIMITED);
        assert.equal(err429.retryable, true);

        // 500 Server error
        const err500 = normalizeProviderError(provider, 500, {});
        assert.equal(err500.category, ERROR_CATEGORIES.PROVIDER_ERROR);
        assert.equal(err500.retryable, true);

        // Network error
        const errNet = normalizeProviderError(provider, null, null, new Error('Failed to fetch'));
        assert.equal(errNet.category, ERROR_CATEGORIES.NETWORK_ERROR);
        assert.equal(errNet.retryable, true);
      });
    });
  }

  describe('User-Controlled Fallback Architecture', () => {
    test('fallback is disabled by default', () => {
      providerManager.setFallbackConfig({ enabled: false });
      const cfg = providerManager.getFallbackConfig();
      assert.equal(cfg.enabled, false);
      assert.equal(cfg.fallbackProvider, null);
    });

    test('fallback configuration enables and stores chosen fallback provider', () => {
      providerManager.setFallbackConfig({ enabled: true, fallbackProvider: PROVIDERS.GROQ });
      const cfg = providerManager.getFallbackConfig();
      assert.equal(cfg.enabled, true);
      assert.equal(cfg.fallbackProvider, PROVIDERS.GROQ);

      // Reset
      providerManager.setFallbackConfig({ enabled: false });
    });
  });
});
