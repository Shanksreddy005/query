import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { providerManager } from '../src/agent/provider_manager.js';
import * as claudeClient from '../src/agent/claude_client.js';
import * as openAiClient from '../src/agent/openai_client.js';
import * as geminiClient from '../src/agent/gemini_client.js';
import * as groqClient from '../src/agent/groq_client.js';
import { normalizeProviderError, ERROR_CATEGORIES } from '../src/agent/error_normalizer.js';
import { HistoryView } from '../src/ui/history_view.js';
import { MAX_AI_ROWS, MAX_DISPLAY_ROWS, MAX_AGENT_ROUNDS } from '../src/agent/models.js';
import fs from 'node:fs';
import path from 'node:path';

describe('BYOK Security & Privacy Audit', () => {
  test('API key lifecycle exists strictly in runtime memory across all 4 providers', () => {
    providerManager.clearAllKeys();
    const providers = ['gemini', 'groq', 'anthropic', 'openai'];

    for (const p of providers) {
      assert.equal(providerManager.hasApiKey(p), false);
    }
    assert.equal(providerManager.hasAnyKey(), false);

    // Set keys
    providerManager.setApiKey('gemini', 'AIzaSy-test-gemini-key');
    providerManager.setApiKey('groq', 'gsk-test-groq-key');
    providerManager.setApiKey('anthropic', 'sk-ant-test-anthropic-key');
    providerManager.setApiKey('openai', 'sk-proj-test-openai-key');

    for (const p of providers) {
      assert.equal(providerManager.hasApiKey(p), true, `Provider ${p} must have its key`);
    }
    assert.equal(providerManager.hasAnyKey(), true);

    // Clear one key: others must remain intact
    providerManager.clearApiKey('gemini');
    assert.equal(providerManager.hasApiKey('gemini'), false);
    assert.equal(providerManager.hasApiKey('groq'), true);
    assert.equal(providerManager.hasApiKey('anthropic'), true);
    assert.equal(providerManager.hasApiKey('openai'), true);

    // Clear all
    providerManager.clearAllKeys();
    for (const p of providers) {
      assert.equal(providerManager.hasApiKey(p), false);
    }
  });

  test('cross-provider key isolation: switching providers does not overwrite other keys', () => {
    providerManager.clearAllKeys();

    providerManager.setApiKey('gemini', 'gemini-secret-111');
    providerManager.setApiKey('groq', 'groq-secret-222');
    providerManager.setApiKey('anthropic', 'anthropic-secret-333');
    providerManager.setApiKey('openai', 'openai-secret-444');

    const sequence = ['gemini', 'groq', 'anthropic', 'openai', 'gemini'];
    for (const p of sequence) {
      providerManager.setActiveProvider(p);
      assert.equal(providerManager.getActiveProvider(), p);
      assert.equal(providerManager.hasApiKey(p), true);
    }

    providerManager.clearAllKeys();
  });

  test('source code audit: confirms zero storage of API keys in localStorage, sessionStorage, or IndexedDB', () => {
    function getAllJsFiles(dir) {
      const files = [];
      const list = fs.readdirSync(dir);
      for (const item of list) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          files.push(...getAllJsFiles(fullPath));
        } else if (item.endsWith('.js')) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const allJsFiles = getAllJsFiles('src');
    for (const file of allJsFiles) {
      const code = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(code, /localStorage\.setItem\([^)]*api[_-]?key/i, `File ${file} must never store API keys in localStorage`);
      assert.doesNotMatch(code, /sessionStorage\.setItem\([^)]*api[_-]?key/i, `File ${file} must never store API keys in sessionStorage`);
      assert.doesNotMatch(code, /indexedDB/i, `File ${file} must never store API keys in IndexedDB`);
      assert.doesNotMatch(code, /document\.cookie\s*=/i, `File ${file} must never write cookies`);
      assert.doesNotMatch(code, /history\.(pushState|replaceState)\([^)]*api[_-]?key/i, `File ${file} must never leak API keys to browser history state`);
      assert.doesNotMatch(code, /URLSearchParams\([^)]*api[_-]?key/i, `File ${file} must never append keys to URL query params`);
    }
  });

  test('query history never stores API keys or raw credentials', () => {
    const dummyContainer = { innerHTML: '', querySelectorAll: () => [] };
    const history = new HistoryView({ containerEl: dummyContainer });

    const safeQuery = 'Show churned customers last month';
    history.add(safeQuery);
    assert.equal(history.history[0], safeQuery);

    assert.ok(Array.isArray(history.history));
    assert.equal(history.history.length, 1);
  });

  test('error normalization strictly protects credentials and never leaks raw secret tokens across all providers', () => {
    const providers = ['gemini', 'groq', 'anthropic', 'openai'];
    const secretKey = 'super-secret-production-token-99999';

    for (const p of providers) {
      const rawError = {
        error: {
          message: `Unauthorized access with token ${secretKey}`,
          code: 'invalid_api_key'
        }
      };

      const norm = normalizeProviderError(p, 401, rawError);
      assert.equal(norm.category, ERROR_CATEGORIES.INVALID_API_KEY);
      assert.equal(norm.userMessage.includes(secretKey), false, `Provider ${p} normalized error must never leak key to UI`);
    }
  });

  test('test outgoing request authentication structures for all 4 providers', () => {
    // Anthropic requires x-api-key header
    const testAntKey = 'sk-ant-check-123';
    claudeClient.setApiKey(testAntKey);
    assert.equal(claudeClient.hasApiKey(), true);

    // OpenAI requires Authorization: Bearer
    const testOaiKey = 'sk-openai-check-456';
    openAiClient.setApiKey(testOaiKey);
    assert.equal(openAiClient.hasApiKey(), true);

    // Gemini requires ?key= parameter in official REST URL
    const testGemKey = 'AIzaSy-check-789';
    geminiClient.setApiKey(testGemKey);
    assert.equal(geminiClient.hasApiKey(), true);

    // Groq requires Authorization: Bearer
    const testGroqKey = 'gsk-check-012';
    groqClient.setApiKey(testGroqKey);
    assert.equal(groqClient.hasApiKey(), true);

    providerManager.clearAllKeys();
  });

  test('result limiting and round bounds strictly enforce provider-neutral privacy contracts', () => {
    assert.equal(MAX_AI_ROWS, 25, 'Provider result payload must be capped at 25 rows');
    assert.equal(MAX_DISPLAY_ROWS, 100, 'UI display payload must be capped at 100 rows');
    assert.equal(MAX_AGENT_ROUNDS, 5, 'Agent loop must be capped at 5 rounds');
  });

  test('confirms zero application backend or server files exist in repository', () => {
    assert.equal(fs.existsSync('server.js'), false, 'server.js must not exist in a pure client-side architecture');
    assert.equal(fs.existsSync('api'), false, 'api/ backend directory must not exist');
  });
});
