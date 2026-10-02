/**
 * Central Model Registry & Provider-Neutral Constants
 * Single source of truth for all supported AI models across all providers.
 */

export const MAX_AI_ROWS = 25;
export const MAX_DISPLAY_ROWS = 100;
export const MAX_AGENT_ROUNDS = 5;

export const PROVIDERS = {
  GEMINI: 'gemini',
  GROQ: 'groq',
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai'
};

export const MODEL_REGISTRY = {
  [PROVIDERS.GEMINI]: {
    'gemini-2.5-flash': {
      id: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      provider: PROVIDERS.GEMINI,
      isDefault: true,
      freeTier: true,
      toolCalling: true,
      apiStyle: 'gemini',
      description: 'Recommended · Google AI Studio Free Tier'
    },
    'gemini-2.5-flash-lite': {
      id: 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash-Lite',
      provider: PROVIDERS.GEMINI,
      isDefault: false,
      freeTier: true,
      toolCalling: true,
      apiStyle: 'gemini',
      description: 'Lightweight · Google AI Studio Free Tier'
    }
  },
  [PROVIDERS.GROQ]: {
    'llama-3.3-70b-versatile': {
      id: 'llama-3.3-70b-versatile',
      label: 'Llama 3.3 70B',
      provider: PROVIDERS.GROQ,
      isDefault: true,
      freeTier: true,
      toolCalling: true,
      apiStyle: 'groq',
      description: 'Flagship 70B Open Model · Free Developer Tier'
    },
    'llama-3.1-8b-instant': {
      id: 'llama-3.1-8b-instant',
      label: 'Llama 3.1 8B',
      provider: PROVIDERS.GROQ,
      isDefault: false,
      freeTier: true,
      toolCalling: true,
      apiStyle: 'groq',
      description: 'Ultra-Fast 8B · Free Developer Tier'
    }
  },
  [PROVIDERS.ANTHROPIC]: {
    'claude-sonnet-5-5': {
      id: 'claude-sonnet-5-5',
      label: 'Claude Sonnet 5.5',
      provider: PROVIDERS.ANTHROPIC,
      isDefault: true,
      freeTier: false,
      toolCalling: true,
      apiStyle: 'anthropic',
      description: 'High capability and SQL reasoning · BYOK'
    },
    'claude-haiku-4-5': {
      id: 'claude-haiku-4-5',
      label: 'Claude Haiku 4.5',
      provider: PROVIDERS.ANTHROPIC,
      isDefault: false,
      freeTier: false,
      toolCalling: true,
      apiStyle: 'anthropic',
      description: 'Fast, lower latency and cost · BYOK'
    }
  },
  [PROVIDERS.OPENAI]: {
    'gpt-4o': {
      id: 'gpt-4o',
      label: 'GPT-4o',
      provider: PROVIDERS.OPENAI,
      isDefault: true,
      freeTier: false,
      toolCalling: true,
      apiStyle: 'responses',
      description: 'Flagship high-intelligence model · BYOK'
    },
    'gpt-4o-mini': {
      id: 'gpt-4o-mini',
      label: 'GPT-4o Mini',
      provider: PROVIDERS.OPENAI,
      isDefault: false,
      freeTier: false,
      toolCalling: true,
      apiStyle: 'responses',
      description: 'Fast, lightweight and cost-effective · BYOK'
    }
  }
};

/**
 * Returns model configuration for a specific provider and model ID
 * @param {string} provider
 * @param {string} modelId
 * @returns {Object|null}
 */
export function getModelConfig(provider, modelId) {
  return MODEL_REGISTRY[provider]?.[modelId] || null;
}

/**
 * Returns default model ID for a specific provider
 * @param {string} provider
 * @returns {string}
 */
export function getDefaultModel(provider) {
  const models = MODEL_REGISTRY[provider];
  if (!models) return '';
  const defaultEntry = Object.values(models).find(m => m.isDefault);
  return defaultEntry ? defaultEntry.id : Object.keys(models)[0];
}

/**
 * Returns list of supported models for a provider
 * @param {string} provider
 * @returns {Array<Object>}
 */
export function getModelsForProvider(provider) {
  const models = MODEL_REGISTRY[provider];
  return models ? Object.values(models) : [];
}
