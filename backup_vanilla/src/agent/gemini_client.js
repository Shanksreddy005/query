/**
 * Direct Browser Google Gemini API Client (BYOK Architecture)
 * Direct communication with Google Generative Language API (v1beta).
 * Supports Gemini 2.5 Flash and Free Tier via Google AI Studio.
 * Keys are held strictly in runtime memory closure.
 */

import { PROVIDERS, MODEL_REGISTRY, getDefaultModel, registerModel } from './models.js';
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
  const cleanId = (modelId || '').replace(/^models\//, '');
  if (cleanId) {
    if (!MODEL_REGISTRY[PROVIDERS.GEMINI]?.[cleanId]) {
      registerModel(PROVIDERS.GEMINI, {
        id: cleanId,
        label: cleanId,
        isDefault: false,
        freeTier: true,
        toolCalling: true,
        apiStyle: 'gemini',
        description: 'Custom model / preview route'
      });
    }
    activeModel = cleanId;
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
 * Validates Gemini API key via model catalog lookup probe and dynamically discovers available models
 * @param {string} testKey
 * @returns {Promise<{ valid: boolean, error?: string, normalizedError?: Object, discoveredModels?: Array<Object> }>}
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
      const data = await res.json().catch(() => ({}));
      const discovered = [];

      if (Array.isArray(data.models)) {
        data.models.forEach(m => {
          const methods = m.supportedGenerationMethods || [];
          if (methods.includes('generateContent')) {
            const cleanId = m.name.replace(/^models\//, '');
            const modelConfig = {
              id: cleanId,
              label: m.displayName || cleanId,
              isDefault: cleanId === 'gemini-2.0-flash',
              freeTier: true,
              toolCalling: true,
              apiStyle: 'gemini',
              description: m.description ? m.description.slice(0, 60) + '...' : 'Available in Google AI Studio'
            };
            registerModel(PROVIDERS.GEMINI, modelConfig);
            discovered.push(modelConfig);
          }
        });

        // If the current activeModel is not supported by this key, pick the best working model
        const activeSupported = discovered.some(m => m.id === activeModel);
        if (!activeSupported && discovered.length > 0) {
          const preferred = discovered.find(m => m.id === 'gemini-2.0-flash') ||
                            discovered.find(m => m.id === 'gemini-1.5-flash') ||
                            discovered[0];
          activeModel = preferred.id;
        }
      }

      return { valid: true, discoveredModels: discovered };
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
 * Calls Gemini generateContent API with automatic model fallback on 404 Not Found
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

  const cleanModel = (model || activeModel || 'gemini-2.0-flash').replace(/^models\//, '');

  const sendRequest = async (targetModel) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(memoryApiKey)}`;
    const payload = {
      contents: contents,
      tools: tools
    };

    if (systemPrompt) {
      payload.systemInstruction = {
        parts: [{ text: systemPrompt }]
      };
    }

    return await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  };

  let res;
  try {
    res = await sendRequest(cleanModel);
  } catch (netErr) {
    throw normalizeProviderError('gemini', null, null, netErr);
  }

  // Automatic model fallback if the requested model returns 404 (e.g. 2.5 preview not available on user's account)
  if (res.status === 404) {
    const fallbackList = ['gemini-2.0-flash', 'gemini-1.5-flash'].filter(m => m !== cleanModel);
    for (const fbModel of fallbackList) {
      try {
        const retryRes = await sendRequest(fbModel);
        if (retryRes.ok) {
          activeModel = fbModel;
          return await retryRes.json();
        }
      } catch (e) {
        // Continue to error handling below
      }
    }
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

