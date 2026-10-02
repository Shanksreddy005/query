/**
 * BYOK Multi-Provider API Key Modal & Key Lifecycle Manager
 * Supports Google Gemini (Free Tier), Groq (Free Developer Tier), Anthropic Claude, and OpenAI.
 * Credentials exist only in runtime memory.
 */

import { providerManager } from '../agent/provider_manager.js';
import { PROVIDERS, getModelsForProvider } from '../agent/models.js';

const PROVIDER_METADATA = {
  [PROVIDERS.GEMINI]: {
    name: 'Google Gemini',
    badge: 'Free Tier',
    badgeClass: 'free',
    keyPlaceholder: 'AIzaSy...',
    keyLabel: 'Google Gemini API Key',
    helpUrl: 'https://aistudio.google.com/app/apikey',
    helpText: 'Get a free API key in Google AI Studio ↗'
  },
  [PROVIDERS.GROQ]: {
    name: 'Groq',
    badge: 'Free Developer Tier',
    badgeClass: 'free',
    keyPlaceholder: 'gsk_...',
    keyLabel: 'Groq API Key',
    helpUrl: 'https://console.groq.com/keys',
    helpText: 'Get a free developer key in Groq Console ↗'
  },
  [PROVIDERS.ANTHROPIC]: {
    name: 'Anthropic Claude',
    badge: 'BYOK',
    badgeClass: 'byok',
    keyPlaceholder: 'sk-ant-api03-...',
    keyLabel: 'Anthropic Claude API Key',
    helpUrl: 'https://console.anthropic.com/settings/keys',
    helpText: 'Get an API key in Anthropic Console ↗'
  },
  [PROVIDERS.OPENAI]: {
    name: 'OpenAI',
    badge: 'BYOK',
    badgeClass: 'byok',
    keyPlaceholder: 'sk-...',
    keyLabel: 'OpenAI API Key',
    helpUrl: 'https://platform.openai.com/api-keys',
    helpText: 'Get an API key in OpenAI Platform ↗'
  }
};

export class ApiKeyModal {
  constructor({ onKeyConfigured = () => {}, onDemoMode = () => {} }) {
    this.onKeyConfigured = onKeyConfigured;
    this.onDemoMode = onDemoMode;
    this.modalEl = null;
    this.selectedProvider = providerManager.getActiveProvider();
    this.init();
  }

  init() {
    this.createModal();
    this.createTopbarControls();
    this.updateStatus();
  }

  createModal() {
    let existing = document.getElementById('apiKeyModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'apiKeyModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title-group">
            <div class="modal-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div>
              <div class="modal-title">QueryMind — Private AI Analytics</div>
              <div class="modal-subtitle">Bring Your Own Key (BYOK) · 100% In-Browser Execution</div>
            </div>
          </div>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">AI Provider</label>
            <div class="provider-radio-grid">
              ${Object.entries(PROVIDER_METADATA).map(([key, meta]) => `
                <label class="provider-radio-card ${key === this.selectedProvider ? 'active' : ''}" id="card_${key}">
                  <div class="provider-radio-top">
                    <span class="provider-radio-title">
                      <input type="radio" name="providerSelect" value="${key}" ${key === this.selectedProvider ? 'checked' : ''} />
                      ${meta.name}
                    </span>
                    <span class="provider-tier-badge ${meta.badgeClass}">${meta.badge}</span>
                  </div>
                </label>
              `).join('')}
            </div>
            <div id="providerHelpLinkWrap" style="margin-top: 6px;"></div>
          </div>

          <div class="form-group">
            <label class="form-label" for="modelSelect">Model</label>
            <select id="modelSelect" class="form-select">
              <!-- Populated dynamically -->
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="apiKeyInput" id="apiKeyLabel">API Key</label>
            <div class="input-password-wrap">
              <input 
                type="password" 
                id="apiKeyInput" 
                class="form-input mono" 
                placeholder="sk-..." 
                autocomplete="off" 
                spellcheck="false" 
              />
              <button type="button" id="toggleKeyVisibility" class="btn-icon" title="Toggle visibility">
                👁
              </button>
            </div>
            <div id="keyErrorMsg" class="form-error" style="display: none;"></div>
          </div>

          <!-- User-Controlled Fallback Setting -->
          <div class="fallback-box">
            <label class="fallback-label">
              <input type="checkbox" id="allowFallbackCheckbox" />
              <span><strong>Allow provider fallback:</strong> Automatically retry with another provider on rate limits</span>
            </label>
            <div id="fallbackSelectContainer" style="display: none; margin-top: 10px;">
              <label class="form-label" for="fallbackProviderSelect" style="font-size: 11.5px;">Fallback Provider (Only used if key is configured)</label>
              <select id="fallbackProviderSelect" class="form-select">
                <option value="groq">Groq (Llama 3.3 70B · Free Developer Tier)</option>
                <option value="gemini">Google Gemini (Gemini 2.0 Flash · Free Tier)</option>
                <option value="anthropic">Anthropic Claude</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
          </div>

          <div class="privacy-callout" style="margin-top: 14px;">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#34c97b" stroke-width="1.8" style="flex-shrink: 0; margin-top: 2px;">
              <path d="M8 1v5M8 9v6M1 8h14"/>
              <circle cx="8" cy="8" r="7"/>
            </svg>
            <div>
              <strong>Client-Side BYOK Security Model:</strong> Provider API keys are supplied by the user and held only in browser runtime memory. QueryMind does not persist or proxy keys through its own infrastructure. Because the key is used directly by the browser, users should only enter API keys they are comfortable using in a client-side application. Free-tier availability and limits are determined by each provider and may change. Closing or refreshing this tab wipes all keys immediately.
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" id="btnContinueDemo" class="btn btn-secondary">
            Continue in Demo Mode
          </button>
          <button type="button" id="btnVerifyKey" class="btn btn-primary">
            <span class="btn-text">Verify & Continue</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalEl = modal;

    // Elements
    const input = document.getElementById('apiKeyInput');
    const toggleBtn = document.getElementById('toggleKeyVisibility');
    const verifyBtn = document.getElementById('btnVerifyKey');
    const demoBtn = document.getElementById('btnContinueDemo');
    const modelSelect = document.getElementById('modelSelect');
    const fallbackCheckbox = document.getElementById('allowFallbackCheckbox');
    const fallbackSelectContainer = document.getElementById('fallbackSelectContainer');
    const fallbackProviderSelect = document.getElementById('fallbackProviderSelect');

    // Populate initial state
    this.refreshModelOptions();
    this.updateInputLabels();

    // Provider card switching
    const selectProvider = (prov) => {
      this.selectedProvider = prov;
      Object.keys(PROVIDER_METADATA).forEach(k => {
        const card = document.getElementById(`card_${k}`);
        const radio = card?.querySelector('input[type="radio"]');
        if (k === prov) {
          card?.classList.add('active');
          if (radio) radio.checked = true;
        } else {
          card?.classList.remove('active');
          if (radio) radio.checked = false;
        }
      });
      this.refreshModelOptions();
      this.updateInputLabels();
    };

    Object.keys(PROVIDER_METADATA).forEach(k => {
      const card = document.getElementById(`card_${k}`);
      card?.addEventListener('click', (e) => {
        selectProvider(k);
      });
    });

    toggleBtn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      toggleBtn.textContent = input.type === 'password' ? '👁' : '🔒';
    });

    modelSelect.addEventListener('change', () => {
      providerManager.setActiveModel(this.selectedProvider, modelSelect.value);
    });

    // Fallback toggle event
    fallbackCheckbox.addEventListener('change', () => {
      fallbackSelectContainer.style.display = fallbackCheckbox.checked ? 'block' : 'none';
      providerManager.setFallbackConfig({
        enabled: fallbackCheckbox.checked,
        fallbackProvider: fallbackProviderSelect.value
      });
    });

    fallbackProviderSelect.addEventListener('change', () => {
      if (fallbackCheckbox.checked) {
        providerManager.setFallbackConfig({
          enabled: true,
          fallbackProvider: fallbackProviderSelect.value
        });
      }
    });

    verifyBtn.addEventListener('click', () => this.handleVerify());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleVerify();
      }
    });

    demoBtn.addEventListener('click', () => {
      this.hide();
      this.onDemoMode();
    });
  }

  refreshModelOptions() {
    const modelSelect = document.getElementById('modelSelect');
    if (!modelSelect) return;

    const models = getModelsForProvider(this.selectedProvider);
    const activeModel = providerManager.getActiveModel(this.selectedProvider);

    modelSelect.innerHTML = models
      .map(m => `<option value="${m.id}" ${m.id === activeModel ? 'selected' : ''}>${m.label} (${m.description})</option>`)
      .join('');
  }

  updateInputLabels() {
    const label = document.getElementById('apiKeyLabel');
    const input = document.getElementById('apiKeyInput');
    const errorEl = document.getElementById('keyErrorMsg');
    const helpWrap = document.getElementById('providerHelpLinkWrap');
    if (!label || !input) return;

    if (errorEl) errorEl.style.display = 'none';

    const meta = PROVIDER_METADATA[this.selectedProvider] || {};
    label.textContent = meta.keyLabel || 'API Key';
    input.placeholder = meta.keyPlaceholder || 'Enter API Key...';

    if (providerManager.hasApiKey(this.selectedProvider)) {
      label.textContent += ' (Key already configured in memory)';
    }

    if (helpWrap && meta.helpUrl) {
      helpWrap.innerHTML = `
        <a href="${meta.helpUrl}" target="_blank" rel="noopener noreferrer" class="provider-help-link">
          ${meta.helpText}
        </a>
      `;
    }
  }

  createTopbarControls() {
    const topbarRight = document.querySelector('.topbar-right');
    if (!topbarRight) return;

    const wrap = document.createElement('div');
    wrap.className = 'topbar-key-controls';
    wrap.innerHTML = `
      <div id="keyStatusBadge" class="badge badge-blue">
        <span class="status-dot"></span>
        <span class="status-text">○ No API Key (Demo Mode)</span>
      </div>
      <button id="btnClearKeyBtn" class="btn-sm btn-ghost" style="display: none;" title="Wipe active API key from memory">
        Clear Key
      </button>
      <button id="btnOpenKeyModal" class="btn-sm btn-secondary" title="Configure AI Provider & Key">
        Key Settings
      </button>
    `;

    topbarRight.prepend(wrap);

    document.getElementById('btnClearKeyBtn').addEventListener('click', () => {
      providerManager.clearApiKey(this.selectedProvider);
      this.updateStatus();
      this.show();
    });

    document.getElementById('btnOpenKeyModal').addEventListener('click', () => {
      this.show();
    });
  }

  async handleVerify() {
    const input = document.getElementById('apiKeyInput');
    const errorEl = document.getElementById('keyErrorMsg');
    const verifyBtn = document.getElementById('btnVerifyKey');
    const btnText = verifyBtn.querySelector('.btn-text');
    const modelSelect = document.getElementById('modelSelect');

    const key = input.value.trim();
    const provider = this.selectedProvider;
    const meta = PROVIDER_METADATA[provider] || {};

    if (!key && providerManager.hasApiKey(provider)) {
      providerManager.setActiveProvider(provider);
      providerManager.setActiveModel(provider, modelSelect.value);
      this.updateStatus();
      this.hide();
      this.onKeyConfigured();
      return;
    }

    if (!key) {
      errorEl.textContent = `Please enter your ${meta.name} API key.`;
      errorEl.style.display = 'block';
      return;
    }

    errorEl.style.display = 'none';
    verifyBtn.disabled = true;
    btnText.textContent = `Verifying with ${meta.name}...`;

    const check = await providerManager.verifyApiKey(provider, key, modelSelect.value);

    verifyBtn.disabled = false;
    btnText.textContent = 'Verify & Continue';

    if (check.valid) {
      providerManager.setApiKey(provider, key);
      providerManager.setActiveProvider(provider);

      let finalModel = modelSelect.value;
      if (check.discoveredModels && check.discoveredModels.length > 0) {
        const isSupported = check.discoveredModels.some(m => m.id === finalModel);
        if (!isSupported) {
          finalModel = providerManager.getActiveModel(provider);
        }
      }
      providerManager.setActiveModel(provider, finalModel);
      this.refreshModelOptions();
      input.value = ''; // Immediately clear DOM input for security
      this.updateStatus();
      this.hide();
      this.onKeyConfigured();
    } else {
      errorEl.textContent = check.error || 'Verification failed.';
      errorEl.style.display = 'block';
    }
  }

  updateStatus() {
    const badge = document.getElementById('keyStatusBadge');
    const clearBtn = document.getElementById('btnClearKeyBtn');
    if (!badge) return;

    const config = providerManager.getActiveConfig();

    if (config.hasKey) {
      badge.className = 'badge badge-green';
      let cleanLabel = config.modelLabel;
      if (config.provider === PROVIDERS.GEMINI) {
        cleanLabel = cleanLabel.replace('Gemini ', '');
      } else if (config.provider === PROVIDERS.ANTHROPIC) {
        cleanLabel = cleanLabel.replace('Claude ', '');
      }
      const provName = PROVIDER_METADATA[config.provider]?.name || config.provider;
      badge.innerHTML = `<span class="status-dot green"></span>● ${provName} · ${cleanLabel}`;
      if (clearBtn) clearBtn.style.display = 'inline-flex';
    } else {
      badge.className = 'badge badge-blue';
      badge.innerHTML = `<span class="status-dot blue"></span>○ No API Key (Demo Mode)`;
      if (clearBtn) clearBtn.style.display = 'none';
    }
  }

  show() {
    if (this.modalEl) {
      this.selectedProvider = providerManager.getActiveProvider();
      Object.keys(PROVIDER_METADATA).forEach(k => {
        const card = document.getElementById(`card_${k}`);
        const radio = card?.querySelector('input[type="radio"]');
        if (k === this.selectedProvider) {
          card?.classList.add('active');
          if (radio) radio.checked = true;
        } else {
          card?.classList.remove('active');
          if (radio) radio.checked = false;
        }
      });
      this.refreshModelOptions();
      this.updateInputLabels();

      this.modalEl.style.display = 'flex';
      const input = document.getElementById('apiKeyInput');
      if (input) setTimeout(() => input.focus(), 50);
    }
  }

  hide() {
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
    }
  }
}
