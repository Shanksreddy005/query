/**
 * Unified Provider Manager & Abstraction Boundary
 * Coordinates Claude and OpenAI adapters, normalizing API interactions into standard internal events.
 * The Agent Loop communicates strictly through this boundary and never performs provider-specific branching.
 */

import { PROVIDERS, MODEL_REGISTRY, getDefaultModel, getModelConfig } from './models.js';
import * as claudeClient from './claude_client.js';
import * as openAiClient from './openai_client.js';
import { ANTHROPIC_TOOLS, OPENAI_RESPONSES_TOOLS } from './tools.js';

let activeProvider = PROVIDERS.ANTHROPIC;

/**
 * Normalized Conversation State Manager
 * Maintains provider-agnostic dialogue events and translates them to provider-specific payloads.
 */
export class NormalizedConversation {
  constructor(initialQuestion) {
    this.question = (initialQuestion || '').trim();
    this.anthropicMessages = [
      { role: 'user', content: this.question }
    ];
    this.openAiInput = [
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
      // In OpenAI Responses API, append assistant output items
      if (Array.isArray(rawOutput)) {
        this.openAiInput.push(...rawOutput);
      } else if (rawOutput) {
        this.openAiInput.push(rawOutput);
      }
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
    // Anthropic tool_result schema
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

    // OpenAI Responses API function_call_output item
    this.openAiInput.push({
      type: 'function_call_output',
      call_id: toolCallId,
      output: content
    });
  }
}

/**
 * Adapter for Anthropic Messages API
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

    // Check for tool call
    const toolUse = contentBlocks.find(b => b.type === 'tool_use' && b.name === 'run_sql');
    if (toolUse) {
      return {
        type: 'tool_call',
        toolName: toolUse.name,
        toolCallId: toolUse.id,
        arguments: toolUse.input || {}
      };
    }

    // Extract text blocks
    const textBlocks = contentBlocks.filter(b => b.type === 'text');
    const fullText = textBlocks.map(b => b.text).join('\n\n').trim();

    return {
      type: 'final',
      text: fullText
    };
  }
};

/**
 * Adapter for OpenAI Responses API
 */
const openAiAdapter = {
  async sendTurn(conversation, systemPrompt) {
    const rawRes = await openAiClient.callOpenAIResponse({
      input: conversation.openAiInput,
      instructions: systemPrompt,
      tools: OPENAI_RESPONSES_TOOLS
    });

    // Responses API returns items in `output` or top-level output items
    const outputItems = rawRes.output || (rawRes.choices ? [rawRes.choices[0]?.message] : []);
    conversation.recordAssistantTurn(PROVIDERS.OPENAI, outputItems);

    // Look for function_call in output items
    let functionCallItem = null;
    let textParts = [];

    for (const item of outputItems) {
      if (!item) continue;

      if (item.type === 'function_call' || item.type === 'tool_call' || (item.name === 'run_sql' && item.arguments)) {
        functionCallItem = item;
        break;
      }

      // Legacy fallback if wrapped in tool_calls array
      if (item.tool_calls && Array.isArray(item.tool_calls) && item.tool_calls.length > 0) {
        const tc = item.tool_calls[0];
        functionCallItem = {
          call_id: tc.id,
          name: tc.function?.name || 'run_sql',
          arguments: tc.function?.arguments || '{}'
        };
        break;
      }

      // Extract text content
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
 * Provider Manager API
 */
export const providerManager = {
  PROVIDERS,

  /**
   * Sets the active provider ('anthropic' | 'openai')
   * @param {string} provider
   */
  setActiveProvider(provider) {
    if (Object.values(PROVIDERS).includes(provider)) {
      activeProvider = provider;
    }
  },

  /**
   * Returns the currently active provider
   * @returns {string}
   */
  getActiveProvider() {
    return activeProvider;
  },

  /**
   * Sets the active model for a provider
   * @param {string} provider
   * @param {string} modelId
   */
  setActiveModel(provider, modelId) {
    if (provider === PROVIDERS.OPENAI) {
      openAiClient.setActiveModel(modelId);
    } else {
      claudeClient.setActiveModel(modelId);
    }
  },

  /**
   * Returns the active model ID for a provider
   * @param {string} [provider]
   * @returns {string}
   */
  getActiveModel(provider = activeProvider) {
    if (provider === PROVIDERS.OPENAI) {
      return openAiClient.getActiveModel();
    }
    return claudeClient.getActiveModel();
  },

  /**
   * Stores the API key in runtime memory for the specified provider
   * @param {string} provider
   * @param {string} key
   */
  setApiKey(provider, key) {
    if (provider === PROVIDERS.OPENAI) {
      openAiClient.setApiKey(key);
    } else {
      claudeClient.setApiKey(key);
    }
  },

  /**
   * Returns whether a key is configured in memory for the specified provider
   * @param {string} [provider]
   * @returns {boolean}
   */
  hasApiKey(provider = activeProvider) {
    if (provider === PROVIDERS.OPENAI) {
      return openAiClient.hasApiKey();
    }
    return claudeClient.hasApiKey();
  },

  /**
   * Returns whether ANY provider has an active key
   * @returns {boolean}
   */
  hasAnyKey() {
    return claudeClient.hasApiKey() || openAiClient.hasApiKey();
  },

  /**
   * Clears the API key for a specified provider
   * @param {string} provider
   */
  clearApiKey(provider) {
    if (provider === PROVIDERS.OPENAI) {
      openAiClient.clearApiKey();
    } else if (provider === PROVIDERS.ANTHROPIC) {
      claudeClient.clearApiKey();
    }
  },

  /**
   * Clears all API keys from memory
   */
  clearAllKeys() {
    claudeClient.clearApiKey();
    openAiClient.clearApiKey();
  },

  /**
   * Verifies an API key with the provider's validation probe
   * @param {string} provider
   * @param {string} testKey
   * @param {string} [modelId]
   * @returns {Promise<{ valid: boolean, error?: string }>}
   */
  async verifyApiKey(provider, testKey, modelId) {
    if (provider === PROVIDERS.OPENAI) {
      return await openAiClient.verifyApiKey(testKey);
    }
    return await claudeClient.verifyApiKey(testKey, modelId);
  },

  /**
   * Dispatches a single conversation turn through the active provider adapter.
   * Returns a normalized event:
   *   { type: 'tool_call', toolName: 'run_sql', toolCallId: '...', arguments: { query: '...' } }
   *   or
   *   { type: 'final', text: '...' }
   * @param {NormalizedConversation} conversation
   * @param {string} systemPrompt
   * @returns {Promise<{ type: string, toolName?: string, toolCallId?: string, arguments?: Object, text?: string }>}
   */
  async sendTurn(conversation, systemPrompt) {
    if (activeProvider === PROVIDERS.OPENAI) {
      return await openAiAdapter.sendTurn(conversation, systemPrompt);
    }
    return await claudeAdapter.sendTurn(conversation, systemPrompt);
  },

  /**
   * Returns display metadata for active provider configuration
   * @returns {{ provider: string, modelId: string, modelLabel: string, hasKey: boolean }}
   */
  getActiveConfig() {
    const prov = activeProvider;
    const modelId = this.getActiveModel(prov);
    const cfg = getModelConfig(prov, modelId);
    return {
      provider: prov,
      modelId: modelId,
      modelLabel: cfg?.label || modelId,
      hasKey: this.hasApiKey(prov)
    };
  }
};
