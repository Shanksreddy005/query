/**
 * Direct Browser Google Gemini API Client (BYOK Architecture)
 * Direct communication with Google Generative Language API (v1beta).
 * Supports Gemini 2.5 Flash and Free Tier via Google AI Studio.
 * Keys are held strictly in runtime memory closure.
 */

import { PROVIDERS, MODEL_REGISTRY, getDefaultModel } from './models.js';
import { GEMINI_TOOLS } from './tools.js';
import { normalizeProviderError } from './error_normalizer.js';

let memoryApiKey = null;
let activeModel = getDefaultModel(PROVIDERS.GEMINI);

/**
 * Stores the Gemini API key strictly in runtime memory closure
 * @param {string} key
 */
export function setApiKey(key) {
  if (typeof key === 'string') {
    memoryApiKey = key.trim();
  }
}

/**
 * Returns whether a Gemini API key is currently in memory
 * @returns {boolean}
 */
export function hasApiKey() {
  return typeof memoryApiKey === 'string' && memoryApiKey.length > 0;
}

/**
 * Immediately wipes the Gemini API key from memory
 */
export function clearApiKey() {
  memoryApiKey = null;
}

/**
 * Sets the active Gemini model ID
 * @param {string} modelId
 */
export function setActiveModel(modelId) {
  if (MODEL_REGISTRY[PROVIDERS.GEMINI]?.[modelId]) {
    activeModel = modelId;
  }
}

/**
 * Returns the currently active Gemini model
 * @returns {string}
 */
export function getActiveModel() {
  return activeModel;
}

/**
 * Validates Gemini API key via model catalog lookup probe
 * @param {string} testKey
 * @returns {Promise<{ valid: boolean, error?: string, normalizedError?: Object }>}
 */
export async function verifyApiKey(testKey) {
  const keyToTest = (testKey || memoryApiKey || '').trim();
  if (!keyToTest) {
    return { valid: false, error: 'Google Gemini API key is required.' };
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(keyToTest)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      return { valid: true };
    }

    const errJson = await res.json().catch(() => ({}));
    const norm = normalizeProviderError('gemini', res.status, errJson);
    return {
      valid: false,
      error: norm.userMessage,
      normalizedError: norm
    };
  } catch (err) {
    const norm = normalizeProviderError('gemini', null, null, err);
    return {
      valid: false,
      error: norm.userMessage,
      normalizedError: norm
    };
  }
}

/**
 * Calls Gemini generateContent API
 * @param {Object} params
 * @param {Array<Object>} params.contents - Formatted Gemini conversation history
 * @param {string} params.systemPrompt - System instruction text
 * @param {Array<Object>} [params.tools] - Native Gemini function declarations
 * @param {string} [params.model] - Target Gemini model ID
 * @returns {Promise<Object>}
 */
export async function callGeminiContent({
  contents,
  systemPrompt,
  tools = GEMINI_TOOLS,
  model = activeModel
}) {
  if (!memoryApiKey) {
    throw normalizeProviderError('gemini', 401, { error: { message: 'No Google Gemini API key configured.' } });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(memoryApiKey)}`;

  const payload = {
    contents: contents,
    tools: tools
  };

  if (systemPrompt) {
    payload.systemInstruction = {
      parts: [{ text: systemPrompt }]
    };
  }

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (netErr) {
    throw normalizeProviderError('gemini', null, null, netErr);
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const norm = normalizeProviderError('gemini', res.status, errBody);

    if (res.status === 401 || (res.status === 400 && norm.category === 'INVALID_API_KEY')) {
      clearApiKey();
    }

    const err = new Error(norm.userMessage);
    err.normalized = norm;
    throw err;
  }

  return await res.json();
}
