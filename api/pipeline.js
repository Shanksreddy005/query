/**
 * /api/pipeline Serverless API Endpoint
 * Handles natural-language to SQL requests securely on the server/serverless boundary.
 * Never leaks API keys or internal stack traces to the client.
 */

// Load dotenv for local execution if present
try {
  require('dotenv').config();
} catch (e) {}

const { runPipeline } = require('../src/pipeline/router');

module.exports = async function handler(req, res) {
  // CORS & Header Setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method Not Allowed. Use POST.' }));
  }

  // Parse body
  let body = '';
  req.on('data', chunk => {
    body += chunk;
  });

  req.on('end', async () => {
    try {
      let data = {};
      if (body) {
        data = JSON.parse(body);
      } else if (req.body) {
        data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      }

      const { question } = data;
      if (!question || !question.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Query is empty. Please enter a question.' }));
      }

      const pipelineResult = await runPipeline(question.trim());

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(pipelineResult));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: false,
        error: 'An internal error occurred during query processing. Please try again.'
      }));
    }
  });
};
