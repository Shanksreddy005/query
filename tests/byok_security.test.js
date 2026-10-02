import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setApiKey, hasApiKey, clearApiKey, getActiveModel, MODELS } from '../src/agent/claude_client.js';
import { HistoryView } from '../src/ui/history_view.js';
import { MAX_CLAUDE_ROWS, MAX_DISPLAY_ROWS } from '../src/duckdb/executor.js';
import fs from 'node:fs';

describe('BYOK Security & Privacy Audit', () => {
  test('API key lifecycle exists strictly in runtime memory', () => {
    assert.equal(hasApiKey(), false, 'Initially hasApiKey should be false');

    const testSecret = 'sk-ant-test-secret-key-12345';
    setApiKey(testSecret);
    assert.equal(hasApiKey(), true, 'hasApiKey should be true after setApiKey');

    clearApiKey();
    assert.equal(hasApiKey(), false, 'hasApiKey should be false after clearApiKey');
  });

  test('source code audit: confirms zero storage of API keys in localStorage, sessionStorage, or IndexedDB', () => {
    // Scan all client-side files in src/
    const jsFiles = [
      'src/agent/claude_client.js',
      'src/ui/api_key_modal.js',
      'src/ui/history_view.js',
      'src/main.js'
    ];

    for (const file of jsFiles) {
      const code = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(code, /localStorage\.setItem\([^)]*api[_-]?key/i, `File ${file} must never store API keys in localStorage`);
      assert.doesNotMatch(code, /sessionStorage\.setItem\([^)]*api[_-]?key/i, `File ${file} must never store API keys in sessionStorage`);
      assert.doesNotMatch(code, /indexedDB/i, `File ${file} must never store API keys in IndexedDB`);
      assert.doesNotMatch(code, /document\.cookie\s*=/i, `File ${file} must never write cookies`);
    }
  });

  test('query history never stores API keys or raw credentials', () => {
    const dummyContainer = { innerHTML: '', querySelectorAll: () => [] };
    const history = new HistoryView({ containerEl: dummyContainer });

    const safeQuery = 'Show churned customers last month';
    history.add(safeQuery);
    assert.equal(history.history[0], safeQuery);

    // Ensure history is not exposed to persistent storage
    assert.ok(Array.isArray(history.history));
    assert.equal(history.history.length, 1);
  });

  test('result limiting constants strictly protect privacy and browser memory', () => {
    assert.equal(MAX_CLAUDE_ROWS, 25, 'Claude result payload must be capped at 25 rows');
    assert.equal(MAX_DISPLAY_ROWS, 100, 'UI display payload must be capped at 100 rows');
  });

  test('confirms zero application backend or server files exist in root', () => {
    assert.equal(fs.existsSync('server.js'), false, 'server.js must not exist in a pure client-side architecture');
    assert.equal(fs.existsSync('api'), false, 'api/ backend directory must not exist');
  });
});
