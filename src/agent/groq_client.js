/**
 * Direct Browser Groq Cloud API Client (BYOK Architecture)
 * Direct communication with Groq's high-speed inference engine (POST https://api.groq.com/openai/v1/chat/completions).
 * Supports Llama 3.3 70B on the Free Developer Tier.
 * Implemented as a dedicated adapter separate from OpenAI.
 */

import { PROVIDERS, MODEL_REGISTRY, getDefaultModel } from './models.js';
import { GROQ_TOOLS } from './tools.js';
import { normalizeProviderError } from './error_normalizer.js';

let memoryApiKey = null;
let activeModel = getDefaultModel(PROVIDERS.GROQ);

/**
 * Stores the Groq API key strictly in runtime memory closure
 * @param {string} key
 */
export function setApiKey(key) {
  if (typeof key === 'string') {
    memoryApiKey = key.trim();
  }
}

/**
 * Returns whether a Groq API key is in memory
 * @returns {boolean}
 */
export function hasApiKey() {
  return typeof memoryApiKey === 'string' && memoryApiKey.length > 0;
}

/**
 * Immediately wipes the Groq API key from memory
 */
export function clearApiKey() {
  memoryApiKey = null;
}

/**
 * Sets the active Groq model ID
 * @param {string} modelId
 */
export function setActiveModel(modelId) {
  if (MODEL_REGISTRY[PROVIDERS.GROQ]?.[modelId]) {
    activeModel = modelId;
  }
}

/**
 * Returns the currently active Groq model
 * @returns {string}
 */
export function getActiveModel() {
  return activeModel;
}

/**
 * Validates Groq API key via model catalog lookup probe
 * @param {string} testKey
 * @returns {Promise<{ valid: boolean, error?: string, normalizedError?: Object }>}
 */
export async function verifyApiKey(testKey) {
  const keyToTest = (testKey || memoryApiKey || '').trim();
  if (!keyToTest) {
    return { valid: false, error: 'Groq API key is required.' };
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${keyToTest}`
      }
    });

    if (res.ok) {
      return { valid: true };
    }

    const errJson = await res.json().catch(() => ({}));
    const norm = normalizeProviderError('groq', res.status, errJson);
    return {
      valid: false,
      error: norm.userMessage,
      normalizedError: norm
    };
  } catch (err) {
    const norm = normalizeProviderError('groq', null, null, err);
    return {
      valid: false,
      error: norm.userMessage,
      normalizedError: norm
    };
  }
}

/**
 * Calls Groq chat/completions API with function calling
 * @param {Object} params
 * @param {Array<Object>} params.messages - Chat message array
 * @param {string} [params.systemPrompt] - System instruction
 * @param {Array<Object>} [params.tools] - Native Groq/OpenAI tool definitions
 * @param {string} [params.model] - Target Groq model ID
 * @returns {Promise<Object>}
 */
export async function callGroqChat({
  messages,
  systemPrompt,
  tools = GROQ_TOOLS,
  model = activeModel
}) {
  if (!memoryApiKey) {
    throw normalizeProviderError('groq', 401, { error: { message: 'No Groq API key configured.' } });
  }

  const payloadMessages = [];
  if (systemPrompt) {
    payloadMessages.push({ role: 'system', content: systemPrompt });
  }
  payloadMessages.push(...messages);

  const payload = {
    model: model,
    messages: payloadMessages,
    tools: tools,
    tool_choice: 'auto',
    temperature: 0.1
  };

  let res;
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${memoryApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (netErr) {
    throw normalizeProviderError('groq', null, null, netErr);
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const norm = normalizeProviderError('groq', res.status, errBody);

    if (res.status === 401) {
      clearApiKey();
    }

    const err = new Error(norm.userMessage);
    err.normalized = norm;
    throw err;
  }

  return await res.json();
}
