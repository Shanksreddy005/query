/**
 * Normalized AI Provider Error Handler
 * Standardizes Anthropic, OpenAI, Google Gemini, and Groq errors into user-safe representations.
 * Prevents credential leakage or sensitive raw stack traces from reaching the UI.
 */

import { PROVIDERS } from './models.js';

export const ERROR_CATEGORIES = {
  INVALID_API_KEY: 'INVALID_API_KEY',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  BAD_REQUEST: 'BAD_REQUEST',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  CORS_ERROR: 'CORS_ERROR',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN: 'UNKNOWN'
};

const PROVIDER_NAMES = {
  [PROVIDERS.GEMINI]: 'Google Gemini',
  [PROVIDERS.GROQ]: 'Groq',
  [PROVIDERS.ANTHROPIC]: 'Anthropic Claude',
  [PROVIDERS.OPENAI]: 'OpenAI'
};

/**
 * Normalizes HTTP responses or network exceptions from any AI provider
 * @param {string} provider - 'gemini' | 'groq' | 'anthropic' | 'openai'
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
  const providerLabel = PROVIDER_NAMES[provider] || provider;

  // Network / Fetch / CORS / Timeout exceptions
  if (exception && (!status || status === 0)) {
    const exMsg = (exception.message || '').toLowerCase();
    const exName = exception.name || '';

    if (exName === 'AbortError' || exMsg.includes('timeout') || exMsg.includes('timed out')) {
      return {
        provider,
        category: ERROR_CATEGORIES.TIMEOUT,
        status: 0,
        userMessage: `Request to ${providerLabel} timed out. Please check your connection and try again.`,
        retryable: true
      };
    }

    if (exMsg.includes('cors') || exMsg.includes('cross-origin')) {
      return {
        provider,
        category: ERROR_CATEGORIES.CORS_ERROR,
        status: 0,
        userMessage: `Browser CORS blocked the request to ${providerLabel}. Ensure your browser or extensions permit direct API calls.`,
        retryable: false
      };
    }

    return {
      provider,
      category: ERROR_CATEGORIES.NETWORK_ERROR,
      status: 0,
      userMessage: `Unable to connect to ${providerLabel} API from your browser. Please check your internet connection.`,
      retryable: true
    };
  }

  const code = Number(status) || 0;
  const rawMsg = typeof errorBody === 'object'
    ? (errorBody?.error?.message || errorBody?.message || '')
    : String(errorBody || '');
  const errCode = errorBody?.error?.code || errorBody?.error?.status || '';

  // 400 Bad Request — Special check for Gemini invalid API keys
  if (code === 400) {
    if (/API_KEY_INVALID|API key not valid/i.test(rawMsg) || errCode === 'INVALID_ARGUMENT') {
      return {
        provider,
        category: ERROR_CATEGORIES.INVALID_API_KEY,
        status: 400,
        userMessage: `Invalid or expired ${providerLabel} API key. Please check your key in Key Settings.`,
        retryable: false
      };
    }
    return {
      provider,
      category: ERROR_CATEGORIES.BAD_REQUEST,
      status: 400,
      userMessage: `${providerLabel} rejected the request parameters. Please verify your model settings.`,
      retryable: false
    };
  }

  // 401 Unauthorized
  if (code === 401) {
    return {
      provider,
      category: ERROR_CATEGORIES.INVALID_API_KEY,
      status: 401,
      userMessage: `Invalid or unauthorized ${providerLabel} API key. Please verify your key in Key Settings.`,
      retryable: false
    };
  }

  // 403 Forbidden
  if (code === 403) {
    return {
      provider,
      category: ERROR_CATEGORIES.FORBIDDEN,
      status: 403,
      userMessage: `Access restricted for ${providerLabel}. Ensure your account and key have permissions for this model.`,
      retryable: false
    };
  }

  // 404 Model Not Found
  if (code === 404) {
    return {
      provider,
      category: ERROR_CATEGORIES.MODEL_UNAVAILABLE,
      status: 404,
      userMessage: `The requested model is not available for ${providerLabel}. Please select an alternative model in Key Settings.`,
      retryable: false
    };
  }

  // 429 Rate Limit vs Quota Exceeded
  if (code === 429) {
    const isQuota = errCode === 'insufficient_quota' || /quota|credit|billing|exceeded your current quota/i.test(rawMsg);
    if (isQuota) {
      return {
        provider,
        category: ERROR_CATEGORIES.QUOTA_EXCEEDED,
        status: 429,
        userMessage: `${providerLabel} usage quota or credits exhausted. For prepaid providers like OpenAI, add balance to billing. For free tiers (Gemini / Groq), check daily limits.`,
        retryable: false
      };
    }
    return {
      provider,
      category: ERROR_CATEGORIES.RATE_LIMITED,
      status: 429,
      userMessage: `${providerLabel} rate limit reached. Please wait a few seconds before running another query.`,
      retryable: true
    };
  }

  // 5xx Server Error
  if (code >= 500) {
    return {
      provider,
      category: ERROR_CATEGORIES.PROVIDER_ERROR,
      status: code,
      userMessage: `${providerLabel} is experiencing temporary technical difficulties (HTTP ${code}). Please try again shortly.`,
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
