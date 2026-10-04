/**
 * Unified Provider Manager & Abstraction Boundary
 * Coordinates Claude, OpenAI, Google Gemini, and Groq adapters.
 * Normalizes all API interactions into standard internal events for the Agent Controller.
 * Supports optional, strictly user-controlled fallback (default: OFF).
 */

import { PROVIDERS, MODEL_REGISTRY, getDefaultModel, getModelConfig } from './models.js';
import * as claudeClient from './claude_client.js';
import * as openAiClient from './openai_client.js';
import * as geminiClient from './gemini_client.js';
import * as groqClient from './groq_client.js';
import { ANTHROPIC_TOOLS, OPENAI_RESPONSES_TOOLS, GEMINI_TOOLS, GROQ_TOOLS } from './tools.js';

let activeProvider = PROVIDERS.GEMINI; // Default to Gemini Free Tier
let userAllowFallback = false;
let userFallbackProvider = null;

/**
 * Normalized Conversation State Manager
 * Maintains provider-agnostic dialogue events and translates them to provider-specific payloads.
 */
export class NormalizedConversation {
  constructor(initialQuestion) {
    this.question = (initialQuestion || '').trim();

    // Anthropic Messages API format
    this.anthropicMessages = [
      { role: 'user', content: this.question }
    ];

    // OpenAI Responses API format
    this.openAiInput = [
      { role: 'user', content: this.question }
    ];

    // Google Gemini GenerativeLanguage format
    this.geminiContents = [
      { role: 'user', parts: [{ text: this.question }] }
    ];

    // Groq OpenAI-compatible Chat Completions format
    this.groqMessages = [
      { role: 'user', content: this.question }
    ];
  }

  /**
   * Records assistant output into provider-specific histories
   * @param {string} provider
   * @param {*} rawOutput
   */
  recordAssistantTurn(provider, rawOutput) {
    if (provider === PROVIDERS.ANTHROPIC) {
      this.anthropicMessages.push({
        role: 'assistant',
        content: rawOutput
      });
    } else if (provider === PROVIDERS.OPENAI) {
      if (Array.isArray(rawOutput)) {
        this.openAiInput.push(...rawOutput);
      } else if (rawOutput) {
        this.openAiInput.push(rawOutput);
      }
    } else if (provider === PROVIDERS.GEMINI) {
      this.geminiContents.push({
        role: 'model',
        parts: Array.isArray(rawOutput) ? rawOutput : [rawOutput]
      });
    } else if (provider === PROVIDERS.GROQ) {
      this.groqMessages.push(rawOutput);
    }
  }

  /**
   * Appends tool execution result into provider-specific histories
   * @param {Object} params
   * @param {string} params.toolCallId
   * @param {string} params.toolName
   * @param {boolean} params.isError
   * @param {string} params.content - Serialized JSON or error string
   */
  addToolResult({ toolCallId, toolName = 'run_sql', isError, content }) {
    // 1. Anthropic tool_result block
    this.anthropicMessages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolCallId,
          is_error: Boolean(isError),
          content: content
        }
      ]
    });

    // 2. OpenAI Responses API function_call_output item
    this.openAiInput.push({
      type: 'function_call_output',
      call_id: toolCallId,
      output: content
    });

    // 3. Google Gemini functionResponse part
    this.geminiContents.push({
      role: 'function',
      parts: [
        {
          functionResponse: {
            name: toolName,
            response: { output: content }
          }
        }
      ]
    });

    // 4. Groq OpenAI-compatible tool message
    this.groqMessages.push({
      role: 'tool',
      tool_call_id: toolCallId,
      content: content
    });
  }
}

/**
 * Anthropic Claude Adapter
 */
const claudeAdapter = {
  async sendTurn(conversation, systemPrompt, maxTokens = 1024) {
    const rawRes = await claudeClient.callClaudeMessages({
      messages: conversation.anthropicMessages,
      system: systemPrompt,
      tools: ANTHROPIC_TOOLS,
      maxTokens: maxTokens
    });

    const contentBlocks = rawRes.content || [];
    conversation.recordAssistantTurn(PROVIDERS.ANTHROPIC, contentBlocks);

    const toolUse = contentBlocks.find(b => b.type === 'tool_use' && b.name === 'run_sql');
    if (toolUse) {
      return {
        type: 'tool_call',
        toolName: toolUse.name,
        toolCallId: toolUse.id,
        arguments: toolUse.input || {}
      };
    }

    const textBlocks = contentBlocks.filter(b => b.type === 'text');
    return {
      type: 'final',
      text: textBlocks.map(b => b.text).join('\n\n').trim()
    };
  }
};

/**
 * OpenAI Responses API Adapter
 */
const openAiAdapter = {
  async sendTurn(conversation, systemPrompt) {
    const rawRes = await openAiClient.callOpenAIResponse({
      input: conversation.openAiInput,
      instructions: systemPrompt,
      tools: OPENAI_RESPONSES_TOOLS
    });

    const outputItems = rawRes.output || (rawRes.choices ? [rawRes.choices[0]?.message] : []);
    conversation.recordAssistantTurn(PROVIDERS.OPENAI, outputItems);

    let functionCallItem = null;
    let textParts = [];

    for (const item of outputItems) {
      if (!item) continue;
      if (item.type === 'function_call' || item.type === 'tool_call' || (item.name === 'run_sql' && item.arguments)) {
        functionCallItem = item;
        break;
      }
      if (item.tool_calls && Array.isArray(item.tool_calls) && item.tool_calls.length > 0) {
        const tc = item.tool_calls[0];
        functionCallItem = {
          call_id: tc.id,
          name: tc.function?.name || 'run_sql',
          arguments: tc.function?.arguments || '{}'
        };
        break;
      }
      if (item.type === 'message' && item.content) {
        if (typeof item.content === 'string') {
          textParts.push(item.content);
        } else if (Array.isArray(item.content)) {
          for (const c of item.content) {
            if (c.type === 'text' && c.text) textParts.push(c.text);
          }
        }
      } else if (item.text) {
        textParts.push(item.text);
      } else if (typeof item === 'string') {
        textParts.push(item);
      }
    }

    if (functionCallItem) {
      let parsedArgs = {};
      if (typeof functionCallItem.arguments === 'string') {
        try {
          parsedArgs = JSON.parse(functionCallItem.arguments);
        } catch (e) {
          parsedArgs = { query: functionCallItem.arguments };
        }
      } else if (typeof functionCallItem.arguments === 'object' && functionCallItem.arguments !== null) {
        parsedArgs = functionCallItem.arguments;
      }

      return {
        type: 'tool_call',
        toolName: functionCallItem.name || 'run_sql',
        toolCallId: functionCallItem.call_id || functionCallItem.id || `call_${Date.now()}`,
        arguments: parsedArgs
      };
    }

    return {
      type: 'final',
      text: textParts.join('\n\n').trim()
    };
  }
};

/**
 * Google Gemini Adapter
 */
const geminiAdapter = {
  async sendTurn(conversation, systemPrompt) {
    const rawRes = await geminiClient.callGeminiContent({
      contents: conversation.geminiContents,
      systemPrompt: systemPrompt,
      tools: GEMINI_TOOLS
    });

    const candidate = rawRes.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    conversation.recordAssistantTurn(PROVIDERS.GEMINI, parts);

    // Look for functionCall part
    const fnCallPart = parts.find(p => p.functionCall && p.functionCall.name === 'run_sql');
    if (fnCallPart) {
      return {
        type: 'tool_call',
        toolName: fnCallPart.functionCall.name,
        toolCallId: `call_gemini_${Date.now()}`,
        arguments: fnCallPart.functionCall.args || {}
      };
    }

    // Extract text parts
    const textParts = parts.filter(p => p.text).map(p => p.text);
    return {
      type: 'final',
      text: textParts.join('\n\n').trim()
    };
  }
};

/**
 * Groq Cloud Adapter
 */
const groqAdapter = {
  async sendTurn(conversation, systemPrompt) {
    const rawRes = await groqClient.callGroqChat({
      messages: conversation.groqMessages,
      systemPrompt: systemPrompt,
      tools: GROQ_TOOLS
    });

    const message = rawRes.choices?.[0]?.message || {};
    conversation.recordAssistantTurn(PROVIDERS.GROQ, message);

    if (message.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      const tc = message.tool_calls[0];
      let parsedArgs = {};
      if (typeof tc.function?.arguments === 'string') {
        try {
          parsedArgs = JSON.parse(tc.function.arguments);
        } catch (e) {
          parsedArgs = { query: tc.function.arguments };
        }
      } else if (typeof tc.function?.arguments === 'object') {
        parsedArgs = tc.function.arguments;
      }

      return {
        type: 'tool_call',
        toolName: tc.function?.name || 'run_sql',
        toolCallId: tc.id || `call_groq_${Date.now()}`,
        arguments: parsedArgs
      };
    }

    return {
      type: 'final',
      text: (message.content || '').trim()
    };
  }
};

/**
 * Maps providers to their respective adapter implementations
 */
const ADAPTER_MAP = {
  [PROVIDERS.ANTHROPIC]: claudeAdapter,
  [PROVIDERS.OPENAI]: openAiAdapter,
  [PROVIDERS.GEMINI]: geminiAdapter,
  [PROVIDERS.GROQ]: groqAdapter
};

const CLIENT_MAP = {
  [PROVIDERS.ANTHROPIC]: claudeClient,
  [PROVIDERS.OPENAI]: openAiClient,
  [PROVIDERS.GEMINI]: geminiClient,
  [PROVIDERS.GROQ]: groqClient
};

/**
 * Unified Provider Manager
 */
export const providerManager = {
  PROVIDERS,

  setActiveProvider(provider) {
    if (Object.values(PROVIDERS).includes(provider)) {
      activeProvider = provider;
    }
  },

  getActiveProvider() {
    return activeProvider;
  },

  setActiveModel(provider, modelId) {
    CLIENT_MAP[provider]?.setActiveModel(modelId);
  },

  getActiveModel(provider = activeProvider) {
    return CLIENT_MAP[provider]?.getActiveModel() || getDefaultModel(provider);
  },

  setApiKey(provider, key) {
    CLIENT_MAP[provider]?.setApiKey(key);
  },

  hasApiKey(provider = activeProvider) {
    return Boolean(CLIENT_MAP[provider]?.hasApiKey());
  },

  hasAnyKey() {
    return Object.values(CLIENT_MAP).some(c => c.hasApiKey());
  },

  clearApiKey(provider) {
    CLIENT_MAP[provider]?.clearApiKey();
  },

  clearAllKeys() {
    Object.values(CLIENT_MAP).forEach(c => c.clearApiKey());
  },

  async verifyApiKey(provider, testKey, modelId) {
    const client = CLIENT_MAP[provider];
    if (!client) {
      return { valid: false, error: `Unsupported provider: ${provider}` };
    }
    return await client.verifyApiKey(testKey, modelId);
  },

  /**
   * User-Controlled Fallback Configuration
   */
  setFallbackConfig({ enabled = false, fallbackProvider = null } = {}) {
    userAllowFallback = Boolean(enabled);
    if (fallbackProvider && Object.values(PROVIDERS).includes(fallbackProvider)) {
      userFallbackProvider = fallbackProvider;
    } else {
      userFallbackProvider = null;
    }
  },

  getFallbackConfig() {
    return {
      enabled: userAllowFallback,
      fallbackProvider: userFallbackProvider
    };
  },

  /**
   * Dispatches a turn through the active provider adapter.
   * If user-controlled fallback is explicitly enabled and configured, retries on retryable errors.
   */
  async sendTurn(conversation, systemPrompt) {
    const currentProvider = activeProvider;
    const adapter = ADAPTER_MAP[currentProvider];

    if (!adapter) {
      throw new Error(`Unsupported AI provider: ${currentProvider}`);
    }

    try {
      return await adapter.sendTurn(conversation, systemPrompt);
    } catch (primaryErr) {
      // Check if user explicitly enabled fallback to a provider that HAS a key
      if (
        userAllowFallback &&
        userFallbackProvider &&
        userFallbackProvider !== currentProvider &&
        this.hasApiKey(userFallbackProvider) &&
        primaryErr.normalized?.retryable
      ) {
        const fallbackAdapter = ADAPTER_MAP[userFallbackProvider];
        if (fallbackAdapter) {
          return await fallbackAdapter.sendTurn(conversation, systemPrompt);
        }
      }
      throw primaryErr;
    }
  },

  getActiveConfig() {
    const prov = activeProvider;
    const modelId = this.getActiveModel(prov);
    const cfg = getModelConfig(prov, modelId);
    return {
      provider: prov,
      modelId: modelId,
      modelLabel: cfg?.label || modelId,
      hasKey: this.hasApiKey(prov),
      freeTier: Boolean(cfg?.freeTier)
    };
  }
};
