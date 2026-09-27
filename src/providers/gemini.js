/**
 * Gemini API Client (Google AI Studio)
 * Authoritative provider for Steps 1–4 (Intent, Schema, Planner, SQLGen)
 */

async function callGemini({ systemPrompt, userPrompt, temperature = 0.1, maxOutputTokens = 1000 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('paste_your')) {
    return { success: false, error: 'GEMINI_API_KEY not configured' };
  }

  // Model hierarchy: gemini-2.0-flash -> gemini-1.5-flash
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const contents = [];
    if (systemPrompt) {
      contents.push({
        role: 'user',
        parts: [{ text: `SYSTEM INSTRUCTIONS:\n${systemPrompt}\n\nPlease follow these instructions strictly.` }]
      });
      contents.push({
        role: 'model',
        parts: [{ text: 'Understood. I will follow your instructions strictly.' }]
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: userPrompt }]
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.text();
      return { success: false, error: `Gemini API error ${res.status}: ${errBody.slice(0, 150)}` };
    }

    const data = await res.json();
    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidate) {
      return { success: false, error: 'Gemini returned empty response' };
    }

    return {
      success: true,
      text: candidate.trim(),
      model: `Gemini (${model})`,
      provider: 'Gemini'
    };
  } catch (err) {
    return {
      success: false,
      error: `Gemini request failed: ${err.message}`
    };
  }
}

module.exports = {
  callGemini
};
