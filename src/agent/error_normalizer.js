/**
 * Normalized AI Provider Error Handler
 * Standardizes Anthropic and OpenAI errors into a consistent, user-safe representation.
 * Prevents credential leakage or sensitive raw stack traces from reaching the UI.
 */

export const ERROR_CATEGORIES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMIT: 'RATE_LIMIT',
  BAD_REQUEST: 'BAD_REQUEST',
  SERVER_ERROR: 'SERVER_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Normalizes HTTP responses or network exceptions from AI providers
 * @param {string} provider - 'anthropic' | 'openai'
 * @param {number|null} status - HTTP status code
 * @param {Object|string|null} errorBody - Parsed JSON body or string
 * @param {Error|null} [exception] - Optional caught JS exception
 * @returns {{
 *   provider: string,
 *   category: string,
 *   status: number,
 *   userMessage: string,
 *   retryable: boolean
 * }}
 */
export function normalizeProviderError(provider, status, errorBody = null, exception = null) {
  const providerLabel = provider === 'openai' ? 'OpenAI' : 'Anthropic Claude';

  // Network / CORS / Fetch exception
  if (exception && (status === null || status === undefined || status === 0)) {
    return {
      provider,
      category: ERROR_CATEGORIES.NETWORK_ERROR,
      status: 0,
      userMessage: `Unable to reach the ${providerLabel} API from your browser. Please check your internet connection and verify browser extensions aren't blocking direct API requests.`,
      retryable: true
    };
  }

  const code = Number(status) || 0;

  if (code === 401) {
    return {
      provider,
      category: ERROR_CATEGORIES.UNAUTHORIZED,
      status: 401,
      userMessage: `Invalid or unauthorized ${providerLabel} API key. Please verify your API key in Key Settings.`,
      retryable: false
    };
  }

  if (code === 403) {
    return {
      provider,
      category: ERROR_CATEGORIES.FORBIDDEN,
      status: 403,
      userMessage: `Access restricted for ${providerLabel}. Ensure your account has access to the requested model and your project permissions permit browser access.`,
      retryable: false
    };
  }

  if (code === 429) {
    return {
      provider,
      category: ERROR_CATEGORIES.RATE_LIMIT,
      status: 429,
      userMessage: `${providerLabel} rate limit or usage quota was reached. Please verify your credits and billing limits.`,
      retryable: true
    };
  }

  if (code === 400) {
    const rawMsg = typeof errorBody === 'object' ? (errorBody?.error?.message || errorBody?.message || '') : String(errorBody || '');
    const cleanMsg = rawMsg ? `: ${rawMsg.slice(0, 150)}` : '';
    return {
      provider,
      category: ERROR_CATEGORIES.BAD_REQUEST,
      status: 400,
      userMessage: `${providerLabel} rejected the request configuration${cleanMsg}.`,
      retryable: false
    };
  }

  if (code >= 500) {
    return {
      provider,
      category: ERROR_CATEGORIES.SERVER_ERROR,
      status: code,
      userMessage: `${providerLabel} service is currently experiencing technical difficulties (HTTP ${code}). Please try again in a few moments.`,
      retryable: true
    };
  }

  return {
    provider,
    category: ERROR_CATEGORIES.UNKNOWN,
    status: code,
    userMessage: `An unexpected response was received from ${providerLabel} (HTTP ${code}).`,
    retryable: false
  };
}
