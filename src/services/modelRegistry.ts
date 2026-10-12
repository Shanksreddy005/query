import { AiProvider } from '../types';

export type ModelTier = 'free_and_paid' | 'paid';
export type ModelStatus = 'stable' | 'production' | 'preview' | 'compatibility';

export interface ModelCapabilities {
  toolCalling: boolean;
  structuredOutput: boolean;
  sqlGeneration: boolean;
  reasoning: boolean;
  streaming: boolean;
}

export interface ModelMetadata {
  id: string;
  name: string;
  provider: AiProvider;
  tier: ModelTier;
  status: ModelStatus;
  recommended: boolean;
  badge: string;
  description: string;
  capabilities: ModelCapabilities;
}

export interface ProviderMetadata {
  id: AiProvider;
  name: string;
  category: 'free_tier_available' | 'paid';
  categoryLabel: string;
  tierLabel: string;
  byokLabel: string;
  badge: string;
  defaultModelId: string;
  keyPrefix: string;
  docsUrl: string;
  docsLabel: string;
  billingNotice: string;
  placeholder: string;
  models: ModelMetadata[];
}

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  toolCalling: true,
  structuredOutput: true,
  sqlGeneration: true,
  reasoning: true,
  streaming: true,
};

/**
 * SINGLE SOURCE OF TRUTH: QueryMind Model Registry
 * Contains only currently supported production & preview models.
 * Obsolete and deprecated checkpoints have been completely purged.
 */
export const MODEL_REGISTRY: Record<AiProvider, ModelMetadata[]> = {
  gemini: [
    {
      id: 'gemini-3.8-flash',
      name: 'Gemini 3.8 Flash',
      provider: 'gemini',
      tier: 'free_and_paid',
      status: 'stable',
      recommended: true,
      badge: 'FREE TIER',
      description: "Fast, capable general-purpose model for QueryMind's natural-language data analysis and agent workflow.",
      capabilities: { ...DEFAULT_CAPABILITIES },
    },
    {
      id: 'gemini-3.7-flash',
      name: 'Gemini 3.7 Flash',
      provider: 'gemini',
      tier: 'free_and_paid',
      status: 'stable',
      recommended: false,
      badge: 'FREE TIER',
      description: 'Fast and capable model suitable for natural-language SQL generation and data analysis.',
      capabilities: { ...DEFAULT_CAPABILITIES },
    },
    {
      id: 'gemini-3.6-flash',
      name: 'Gemini 3.6 Flash',
      provider: 'gemini',
      tier: 'free_and_paid',
      status: 'stable',
      recommended: false,
      badge: 'FREE TIER',
      description: 'Previous-generation Flash model for efficient AI-powered data analysis.',
      capabilities: { ...DEFAULT_CAPABILITIES },
    },
    {
      id: 'gemini-3.5-flash',
      name: 'Gemini 3.5 Flash',
      provider: 'gemini',
      tier: 'free_and_paid',
      status: 'compatibility',
      recommended: false,
      badge: 'FREE TIER',
      description: 'Previous-generation Flash model maintained for compatibility.',
      capabilities: { ...DEFAULT_CAPABILITIES },
    },
    {
      id: 'gemini-3.1-pro',
      name: 'Gemini 3.1 Pro',
      provider: 'gemini',
      tier: 'paid',
      status: 'preview',
      recommended: false,
      badge: 'PAID · ADVANCED',
      description: 'Advanced reasoning model for more complex analytical and SQL tasks.',
      capabilities: { ...DEFAULT_CAPABILITIES },
    },
  ],

  groq: [
    {
      id: 'openai/gpt-oss-120b',
      name: 'GPT-OSS 120B',
      provider: 'groq',
      tier: 'free_and_paid',
      status: 'production',
      recommended: true,
      badge: 'FREE TIER',
      description: "High-capability reasoning model with fast inference, suitable for QueryMind's agentic SQL workflow.",
      capabilities: { ...DEFAULT_CAPABILITIES },
    },
    {
      id: 'openai/gpt-oss-20b',
      name: 'GPT-OSS 20B',
      provider: 'groq',
      tier: 'free_and_paid',
      status: 'production',
      recommended: false,
      badge: 'FREE TIER · FAST',
      description: 'Fast and lightweight model for lower-latency QueryMind analysis.',
      capabilities: { ...DEFAULT_CAPABILITIES },
    },
    {
      id: 'qwen/qwen3.8-27b',
      name: 'Qwen 3.8 27B',
      provider: 'groq',
      tier: 'free_and_paid',
      status: 'preview',
      recommended: false,
      badge: 'FREE TIER · PREVIEW',
      description: 'Preview model available for experimentation.',
      capabilities: { ...DEFAULT_CAPABILITIES },
    },
  ],

  openai: [
    {
      id: 'gpt-6-luna',
      name: 'GPT-6 Luna',
      provider: 'openai',
      tier: 'paid',
      status: 'stable',
      recommended: true,
      badge: 'PAID',
      description: 'General-purpose OpenAI model for natural-language data analysis and SQL generation.',
      capabilities: { ...DEFAULT_CAPABILITIES },
    },
    {
      id: 'gpt-6-sol',
      name: 'GPT-6 Sol',
      provider: 'openai',
      tier: 'paid',
      status: 'stable',
      recommended: false,
      badge: 'PAID · ADVANCED',
      description: 'Higher-capability model for more complex reasoning and analytical tasks.',
      capabilities: { ...DEFAULT_CAPABILITIES },
    },
    {
      id: 'gpt-6-astra',
      name: 'GPT-6 Astra',
      provider: 'openai',
      tier: 'paid',
      status: 'stable',
      recommended: false,
      badge: 'PAID · ADVANCED',
      description: 'Highest-capability OpenAI option available in QueryMind.',
      capabilities: { ...DEFAULT_CAPABILITIES },
    },
  ],
};

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: 'gemini-3.8-flash',
  groq: 'openai/gpt-oss-120b',
  openai: 'gpt-6-luna',
};

export const DEFAULT_PROVIDER: AiProvider = 'gemini';

export const PROVIDERS_CONFIG: ProviderMetadata[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    category: 'free_tier_available',
    categoryLabel: 'Free AI Options (Free Tier Available)',
    tierLabel: 'Free tier available',
    byokLabel: 'BYOK',
    badge: 'Free tier available',
    defaultModelId: DEFAULT_MODELS.gemini,
    keyPrefix: 'AIzaSy...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    docsLabel: 'Get a free Gemini API key',
    billingNotice: 'Free tier subject to provider rate limits. No credit card required to start.',
    placeholder: 'AIzaSy...',
    models: MODEL_REGISTRY.gemini,
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    category: 'free_tier_available',
    categoryLabel: 'Free AI Options (Free Tier Available)',
    tierLabel: 'Free tier available',
    byokLabel: 'BYOK',
    badge: 'Free tier available',
    defaultModelId: DEFAULT_MODELS.groq,
    keyPrefix: 'gsk_...',
    docsUrl: 'https://console.groq.com/keys',
    docsLabel: 'Get a free Groq API key',
    billingNotice: 'Free tier subject to provider rate limits. No credit card required to start.',
    placeholder: 'gsk_...',
    models: MODEL_REGISTRY.groq,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    category: 'paid',
    categoryLabel: 'Paid AI Option (Paid API Access)',
    tierLabel: 'Paid API',
    byokLabel: 'BYOK',
    badge: 'Paid API',
    defaultModelId: DEFAULT_MODELS.openai,
    keyPrefix: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'Get an OpenAI API key',
    billingNotice: 'OpenAI API usage is billed to your OpenAI platform account. Requires credit/paid tier.',
    placeholder: 'sk-...',
    models: MODEL_REGISTRY.openai,
  },
];

/**
 * Retrieves configuration for a specific provider.
 */
export function getProviderConfig(provider: AiProvider): ProviderMetadata {
  return PROVIDERS_CONFIG.find((p) => p.id === provider) || PROVIDERS_CONFIG[0];
}

/**
 * Retrieves metadata for a model within a specific provider.
 */
export function getModel(provider: AiProvider, modelId: string): ModelMetadata | undefined {
  return MODEL_REGISTRY[provider]?.find((m) => m.id === modelId);
}

/**
 * Searches across all providers for a model by ID.
 */
export function getModelById(modelId: string): ModelMetadata | undefined {
  for (const provider of Object.keys(MODEL_REGISTRY) as AiProvider[]) {
    const found = MODEL_REGISTRY[provider]?.find((m) => m.id === modelId);
    if (found) return found;
  }
  return undefined;
}

/**
 * Returns default recommended model for a provider.
 */
export function getDefaultModel(provider: AiProvider): ModelMetadata {
  const defaultId = DEFAULT_MODELS[provider];
  const found = getModel(provider, defaultId);
  return found || MODEL_REGISTRY[provider][0];
}

/**
 * Validates whether a model has the required capabilities for query execution.
 */
export function validateModelCapabilities(
  modelId: string,
  required: (keyof ModelCapabilities)[]
): { valid: boolean; missing: (keyof ModelCapabilities)[] } {
  const meta = getModelById(modelId);
  if (!meta) {
    return { valid: false, missing: [] };
  }
  const missing = required.filter((cap) => !meta.capabilities[cap]);
  return { valid: missing.length === 0, missing };
}
