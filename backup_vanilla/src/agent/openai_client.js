/**
 * OpenAI Responses API Client (BYOK Architecture)
 * Direct browser communication using the OpenAI Responses API (POST https://api.openai.com/v1/responses).
 * Keys are held strictly in runtime memory closure and never written to storage.
 */

import { PROVIDERS, MODEL_REGISTRY, getDefaultModel } from './models.js';
import { OPENAI_RESPONSES_TOOLS } from './tools.js';
import { normalizeProviderError } from './error_normalizer.js';

let memoryApiKey = null;
let activeModel = getDefaultModel(PROVIDERS.OPENAI);

/**
 * Stores the OpenAI API key strictly in runtime closure
 * @param {string} key
 */
export function setApiKey(key) {
  if (typeof key === 'string') {
    memoryApiKey = key.trim();
  }
}

/**
 * Returns whether an OpenAI API key is in memory
 * @returns {boolean}
 */
export function hasApiKey() {
  return typeof memoryApiKey === 'string' && memoryApiKey.length > 0;
}

/**
 * Wipes the OpenAI API key from memory immediately
 */
export function clearApiKey() {
  memoryApiKey = null;
}

/**
 * Sets the active OpenAI model ID
 * @param {string} modelId
 */
export function setActiveModel(modelId) {
  if (MODEL_REGISTRY[PROVIDERS.OPENAI]?.[modelId]) {
    activeModel = modelId;
  }
}

/**
 * Returns the currently active OpenAI model
 * @returns {string}
 */
export function getActiveModel() {
  return activeModel;
}

/**
 * Fast zero-token key probe to verify credential validity
 * @param {string} testKey
 * @returns {Promise<{ valid: boolean, error?: string, normalizedError?: Object }>}
 */
export async function verifyApiKey(testKey) {
  const keyToTest = (testKey || memoryApiKey || '').trim();
  if (!keyToTest) {
    return { valid: false, error: 'OpenAI API key is required.' };
  }

  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${keyToTest}`
      }
    });

    if (res.ok) {
      return { valid: true };
    }

    const errJson = await res.json().catch(() => ({}));
    const norm = normalizeProviderError('openai', res.status, errJson);
    return {
      valid: false,
      error: norm.userMessage,
      normalizedError: norm
    };
  } catch (err) {
    const norm = normalizeProviderError('openai', null, null, err);
    return {
      valid: false,
      error: norm.userMessage,
      normalizedError: norm
    };
  }
}

/**
 * Calls the OpenAI Responses API (POST /v1/responses)
 * @param {Object} params
 * @param {Array<Object>} params.input - Conversation/items list in Responses API format
 * @param {string} params.instructions - System instructions
 * @param {Array<Object>} [params.tools] - Tools list
 * @param {string} [params.model] - Model ID
 * @returns {Promise<Object>} Raw Responses API JSON
 */
export async function callOpenAIResponse({
  input,
  instructions,
  tools = OPENAI_RESPONSES_TOOLS,
  model = activeModel
}) {
  if (!memoryApiKey) {
    throw normalizeProviderError('openai', 401, { error: { message: 'No OpenAI API key in memory.' } });
  }

  const payload = {
    model: model,
    instructions: instructions,
    tools: tools,
    input: input
  };

  let res;
  try {
    res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${memoryApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (netErr) {
    throw normalizeProviderError('openai', null, null, netErr);
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const norm = normalizeProviderError('openai', res.status, errBody);
    if (res.status === 401) {
      clearApiKey();
    }
    const err = new Error(norm.userMessage);
    err.normalized = norm;
    throw err;
  }

  return await res.json();
}
