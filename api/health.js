/**
 * /api/health Serverless API Endpoint
 * Safe health check and provider readiness status (never exposes secret values).
 */

try {
  require('dotenv').config();
} catch (e) {}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const geminiConfigured = Boolean(
    process.env.GEMINI_API_KEY && 
    !process.env.GEMINI_API_KEY.includes('paste_your')
  );

  const groqConfigured = Boolean(
    process.env.GROQ_API_KEY && 
    !process.env.GROQ_API_KEY.includes('paste_your')
  );

  res.writeHead(200);
  res.end(JSON.stringify({
    status: 'ok',
    version: '1.0.0',
    mode: (geminiConfigured || groqConfigured) ? 'live_ready' : 'sample_fallback',
    providers: {
      gemini: {
        configured: geminiConfigured,
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash'
      },
      groq: {
        configured: groqConfigured,
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
      }
    }
  }));
};
