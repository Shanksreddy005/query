const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const healthHandler = require('../api/health');
const pipelineHandler = require('../api/pipeline');
const EventEmitter = require('events');

describe('API Security & Secret Masking Verification', () => {
  it('confirms /api/health never exposes API keys or secrets', async () => {
    let responseBody = '';
    const req = { method: 'GET' };
    const res = {
      setHeader: () => {},
      writeHead: (code) => assert.equal(code, 200),
      end: (data) => { responseBody = data; }
    };

    await healthHandler(req, res);
    const parsed = JSON.parse(responseBody);

    assert.equal(typeof parsed.providers.gemini.configured, 'boolean');
    assert.equal(typeof parsed.providers.groq.configured, 'boolean');
    assert.equal(parsed.providers.gemini.apiKey, undefined);
    assert.equal(parsed.providers.groq.apiKey, undefined);
    assert.ok(!responseBody.includes('AIzaSy'));
    assert.ok(!responseBody.includes('gsk_'));
  });

  it('confirms /api/pipeline rejects destructive operations with 200 or 400 safely', async () => {
    let responseBody = '';
    const req = new EventEmitter();
    req.method = 'POST';

    const responsePromise = new Promise(resolve => {
      const res = {
        setHeader: () => {},
        writeHead: () => {},
        end: (data) => {
          responseBody = data;
          resolve(data);
        }
      };
      pipelineHandler(req, res);
    });

    req.emit('data', JSON.stringify({ question: 'DROP TABLE customers;' }));
    req.emit('end');

    await responsePromise;
    assert.ok(responseBody, 'Must return response');
    const parsed = JSON.parse(responseBody);
    assert.equal(parsed.success, false);
    assert.match(parsed.error, /Security violation/i);
  });

  it('audits client-side public/ directory to ensure zero secrets or process.env exist', () => {
    const publicDir = path.join(__dirname, '..', 'public');
    const files = fs.readdirSync(publicDir, { recursive: true });

    for (const file of files) {
      const fullPath = path.join(publicDir, file);
      if (fs.statSync(fullPath).isFile() && (file.endsWith('.js') || file.endsWith('.html'))) {
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.ok(!content.includes('process.env'), `public/${file} must not reference process.env`);
        assert.ok(!content.includes('GEMINI_API_KEY ='), `public/${file} must not define GEMINI_API_KEY`);
        assert.ok(!content.includes('GROQ_API_KEY ='), `public/${file} must not define GROQ_API_KEY`);
        assert.ok(!content.includes('AIzaSy'), `public/${file} must not contain Google API key tokens`);
        assert.ok(!content.includes('gsk_'), `public/${file} must not contain Groq API key tokens`);
      }
    }
  });

  it('verifies .gitignore strictly ignores .env and credential files', () => {
    const gitignorePath = path.join(__dirname, '..', '.gitignore');
    assert.ok(fs.existsSync(gitignorePath));
    const content = fs.readFileSync(gitignorePath, 'utf8');
    assert.ok(content.includes('.env'), '.gitignore must include .env');
    assert.ok(content.includes('node_modules'), '.gitignore must include node_modules');
  });
});
