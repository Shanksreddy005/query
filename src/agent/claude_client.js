/**
 * Direct Browser Claude API Client (BYOK Architecture)
 * Communicates directly with Anthropic Messages API from the browser.
 * The API key is stored strictly in memory closure and never written to browser storage.
 */

export const MODELS = {
  SONNET: 'claude-sonnet-5-5',
  HAIKU: 'claude-haiku-4-5'
};

export const DEFAULT_MODEL = MODELS.SONNET;

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
  if (Object.values(MODELS).includes(model)) {
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
 * @returns {Promise<{ valid: boolean, error?: string }>}
 */
export async function verifyApiKey(testKey, model = activeModel) {
  const keyToTest = (testKey || memoryApiKey || '').trim();
  if (!keyToTest) {
    return { valid: false, error: 'API key is required.' };
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
    const message = errorBody?.error?.message || `HTTP ${res.status} ${res.statusText}`;

    if (res.status === 401) {
      return { valid: false, error: 'Invalid Anthropic API key. Please check your credentials.' };
    }
    if (res.status === 429) {
      return { valid: false, error: 'Rate limit reached or quota exhausted on this API key.' };
    }

    return { valid: false, error: `Anthropic API error: ${message}` };
  } catch (err) {
    return {
      valid: false,
      error: `Network error connecting to Anthropic API: ${err.message}. Check your internet connection.`
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
    throw new Error('No Anthropic API key configured. Please enter your key in the top bar.');
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

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': memoryApiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const errorMessage = errorBody?.error?.message || `HTTP ${res.status}: ${res.statusText}`;

    if (res.status === 401) {
      clearApiKey();
      throw new Error(`Authentication error (401): ${errorMessage}. API key has been cleared.`);
    }
    if (res.status === 429) {
      throw new Error(`Rate limit exceeded (429): ${errorMessage}`);
    }

    throw new Error(`Anthropic API error (${res.status}): ${errorMessage}`);
  }

  return await res.json();
}
