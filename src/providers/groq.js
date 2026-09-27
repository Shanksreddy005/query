/**
 * Groq Cloud API Client
 * Authoritative provider for Steps 5–6 (Verifier, Insight Narrator) and fallback for Steps 1–4
 */

async function callGroq({ systemPrompt, userPrompt, temperature = 0.2, maxTokens = 600 }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.includes('paste_your')) {
    return { success: false, error: 'GROQ_API_KEY not configured' };
  }

  // Current Groq high-performance models
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const url = 'https://api.groq.com/openai/v1/chat/completions';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.text();
      return { success: false, error: `Groq API error ${res.status}: ${errBody.slice(0, 150)}` };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return { success: false, error: 'Groq returned empty response' };
    }

    return {
      success: true,
      text: content.trim(),
      model: `Groq (${model})`,
      provider: 'Groq'
    };
  } catch (err) {
    return {
      success: false,
      error: `Groq request failed: ${err.message}`
    };
  }
}

module.exports = {
  callGroq
};
