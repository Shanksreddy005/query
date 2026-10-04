/**
 * Direct Browser Claude API Client (BYOK Architecture)
 * Communicates directly with Anthropic Messages API from the browser.
 * The API key is stored strictly in memory closure and never written to browser storage.
 */

import { PROVIDERS, MODEL_REGISTRY, getDefaultModel } from './models.js';
import { normalizeProviderError } from './error_normalizer.js';

export const MODELS = {
  SONNET: 'claude-sonnet-5-5',
  HAIKU: 'claude-haiku-4-5'
};

export const DEFAULT_MODEL = getDefaultModel(PROVIDERS.ANTHROPIC);

// Private closure variable for memory-only storage
let memoryApiKey = null;
let activeModel = DEFAULT_MODEL;

/**
 * Sets the active API key in runtime memory only
 * @param {string} key
 */
export function setApiKey(key) {
  if (typeof key === 'string') {
    memoryApiKey = key.trim();
  }
}

/**
 * Returns whether an API key is currently configured in memory
 * @returns {boolean}
 */
export function hasApiKey() {
  return typeof memoryApiKey === 'string' && memoryApiKey.length > 0;
}

/**
 * Immediately clears the API key from runtime memory
 */
export function clearApiKey() {
  memoryApiKey = null;
}

/**
 * Sets the model to use for analysis
 * @param {string} model
 */
export function setActiveModel(model) {
  if (MODEL_REGISTRY[PROVIDERS.ANTHROPIC]?.[model]) {
    activeModel = model;
  }
}

/**
 * Returns the currently active model ID
 * @returns {string}
 */
export function getActiveModel() {
  return activeModel;
}

/**
 * Probes the Anthropic API to verify key validity before unlocking the workspace
 * @param {string} testKey
 * @param {string} [model]
 * @returns {Promise<{ valid: boolean, error?: string, normalizedError?: Object }>}
 */
export async function verifyApiKey(testKey, model = activeModel) {
  const keyToTest = (testKey || memoryApiKey || '').trim();
  if (!keyToTest) {
    return { valid: false, error: 'Anthropic API key is required.' };
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': keyToTest,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'ping' }]
      })
    });

    if (res.ok) {
      return { valid: true };
    }

    const errorBody = await res.json().catch(() => ({}));
    const norm = normalizeProviderError('anthropic', res.status, errorBody);
    return {
      valid: false,
      error: norm.userMessage,
      normalizedError: norm
    };
  } catch (err) {
    const norm = normalizeProviderError('anthropic', null, null, err);
    return {
      valid: false,
      error: norm.userMessage,
      normalizedError: norm
    };
  }
}

/**
 * Sends a conversation turn to the Anthropic Messages API
 * @param {Object} options
 * @param {Array<Object>} options.messages
 * @param {string} [options.system]
 * @param {Array<Object>} [options.tools]
 * @param {string} [options.model]
 * @param {number} [options.maxTokens]
 * @returns {Promise<Object>} The parsed Anthropic message response object
 */
export async function callClaudeMessages({
  messages,
  system,
  tools,
  model = activeModel,
  maxTokens = 1024
}) {
  if (!memoryApiKey) {
    throw normalizeProviderError('anthropic', 401, { error: { message: 'No Anthropic API key configured.' } });
  }

  const payload = {
    model: model,
    max_tokens: maxTokens,
    messages: messages
  };

  if (system) {
    payload.system = system;
  }

  if (tools && Array.isArray(tools) && tools.length > 0) {
    payload.tools = tools;
  }

  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': memoryApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (netErr) {
    throw normalizeProviderError('anthropic', null, null, netErr);
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const norm = normalizeProviderError('anthropic', res.status, errorBody);

    if (res.status === 401) {
      clearApiKey();
    }

    const err = new Error(norm.userMessage);
    err.normalized = norm;
    throw err;
  }

  return await res.json();
}
