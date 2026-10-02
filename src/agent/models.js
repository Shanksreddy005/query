/**
 * Central Model Registry & Provider-Neutral Constants
 * Centralizes model definitions so changing or updating models requires modifying only this file.
 */

export const MAX_AI_ROWS = 25;
export const MAX_DISPLAY_ROWS = 100;
export const MAX_AGENT_ROUNDS = 5;

export const PROVIDERS = {
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai'
};

export const MODEL_REGISTRY = {
  [PROVIDERS.ANTHROPIC]: {
    'claude-sonnet-5-5': {
      id: 'claude-sonnet-5-5',
      label: 'Claude Sonnet 5.5',
      provider: PROVIDERS.ANTHROPIC,
      isDefault: true,
      description: 'Recommended · High capability and SQL reasoning'
    },
    'claude-haiku-4-5': {
      id: 'claude-haiku-4-5',
      label: 'Claude Haiku 4.5',
      provider: PROVIDERS.ANTHROPIC,
      isDefault: false,
      description: 'Fast · Low latency and cost'
    }
  },
  [PROVIDERS.OPENAI]: {
    'gpt-4o': {
      id: 'gpt-4o',
      label: 'GPT-4o',
      provider: PROVIDERS.OPENAI,
      isDefault: true,
      description: 'Flagship high-intelligence model'
    },
    'gpt-4o-mini': {
      id: 'gpt-4o-mini',
      label: 'GPT-4o Mini',
      provider: PROVIDERS.OPENAI,
      isDefault: false,
      description: 'Fast, lightweight and cost-effective'
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
