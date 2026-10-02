/**
 * BYOK Multi-Provider API Key Modal & Key Lifecycle Manager
 * Supports Anthropic Claude and OpenAI with zero persistence: credentials exist only in runtime memory.
 */

import { providerManager } from '../agent/provider_manager.js';
import { PROVIDERS, getModelsForProvider } from '../agent/models.js';

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
            <div class="provider-radio-group">
              <label class="provider-radio-card active" id="radioCardAnthropic">
                <input type="radio" name="providerSelect" value="${PROVIDERS.ANTHROPIC}" checked />
                <span class="provider-radio-title">Anthropic Claude</span>
              </label>
              <label class="provider-radio-card" id="radioCardOpenAI">
                <input type="radio" name="providerSelect" value="${PROVIDERS.OPENAI}" />
                <span class="provider-radio-title">OpenAI</span>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="modelSelect">Model</label>
            <select id="modelSelect" class="form-select">
              <!-- Populated dynamically -->
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="apiKeyInput" id="apiKeyLabel">Anthropic Claude API Key</label>
            <div class="input-password-wrap">
              <input 
                type="password" 
                id="apiKeyInput" 
                class="form-input mono" 
                placeholder="sk-ant-api03-..." 
                autocomplete="off" 
                spellcheck="false" 
              />
              <button type="button" id="toggleKeyVisibility" class="btn-icon" title="Toggle visibility">
                👁
              </button>
            </div>
            <div id="keyErrorMsg" class="form-error" style="display: none;"></div>
          </div>

          <div class="privacy-callout">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#34c97b" stroke-width="1.8" style="flex-shrink: 0; margin-top: 2px;">
              <path d="M8 1v5M8 9v6M1 8h14"/>
              <circle cx="8" cy="8" r="7"/>
            </svg>
            <div>
              <strong>BYOK Security Model:</strong> The API key is supplied by the user and retained only in JavaScript runtime memory. QueryMind does not persist, transmit, or proxy the key through its own infrastructure. Because the key is used directly by the browser, users should only enter keys they are comfortable using in a client-side application. Closing or refreshing this tab wipes all keys immediately.
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
    const radioAnthropic = document.querySelector('input[value="anthropic"]');
    const radioOpenAI = document.querySelector('input[value="openai"]');
    const cardAnthropic = document.getElementById('radioCardAnthropic');
    const cardOpenAI = document.getElementById('radioCardOpenAI');

    // Populate initial model options
    this.refreshModelOptions();

    // Provider radio switch
    const onProviderChange = (provider) => {
      this.selectedProvider = provider;
      if (provider === PROVIDERS.ANTHROPIC) {
        cardAnthropic.classList.add('active');
        cardOpenAI.classList.remove('active');
        radioAnthropic.checked = true;
      } else {
        cardOpenAI.classList.add('active');
        cardAnthropic.classList.remove('active');
        radioOpenAI.checked = true;
      }
      this.refreshModelOptions();
      this.updateInputLabels();
    };

    radioAnthropic.addEventListener('change', () => onProviderChange(PROVIDERS.ANTHROPIC));
    radioOpenAI.addEventListener('change', () => onProviderChange(PROVIDERS.OPENAI));
    cardAnthropic.addEventListener('click', () => onProviderChange(PROVIDERS.ANTHROPIC));
    cardOpenAI.addEventListener('click', () => onProviderChange(PROVIDERS.OPENAI));

    toggleBtn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      toggleBtn.textContent = input.type === 'password' ? '👁' : '🔒';
    });

    modelSelect.addEventListener('change', () => {
      providerManager.setActiveModel(this.selectedProvider, modelSelect.value);
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
    if (!label || !input) return;

    if (errorEl) errorEl.style.display = 'none';

    if (this.selectedProvider === PROVIDERS.OPENAI) {
      label.textContent = 'OpenAI API Key';
      input.placeholder = 'sk-...';
    } else {
      label.textContent = 'Anthropic Claude API Key';
      input.placeholder = 'sk-ant-api03-...';
    }

    // Indicate if memory already has a key for this provider
    if (providerManager.hasApiKey(this.selectedProvider)) {
      label.textContent += ' (Key already configured in memory)';
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
      <button id="btnClearKeyBtn" class="btn-sm btn-ghost" style="display: none;" title="Wipe API keys from memory">
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
    const providerName = provider === PROVIDERS.OPENAI ? 'OpenAI' : 'Anthropic Claude';

    // If key input is empty but memory already has key, proceed
    if (!key && providerManager.hasApiKey(provider)) {
      providerManager.setActiveProvider(provider);
      providerManager.setActiveModel(provider, modelSelect.value);
      this.updateStatus();
      this.hide();
      this.onKeyConfigured();
      return;
    }

    if (!key) {
      errorEl.textContent = `Please enter your ${providerName} API key.`;
      errorEl.style.display = 'block';
      return;
    }

    errorEl.style.display = 'none';
    verifyBtn.disabled = true;
    btnText.textContent = `Verifying with ${providerName}...`;

    const check = await providerManager.verifyApiKey(provider, key, modelSelect.value);

    verifyBtn.disabled = false;
    btnText.textContent = 'Verify & Continue';

    if (check.valid) {
      providerManager.setApiKey(provider, key);
      providerManager.setActiveProvider(provider);
      providerManager.setActiveModel(provider, modelSelect.value);
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
      const label = config.provider === PROVIDERS.OPENAI
        ? `● OpenAI · ${config.modelLabel}`
        : `● Claude · ${config.modelLabel.replace('Claude ', '')}`;
      badge.innerHTML = `<span class="status-dot green"></span>${label}`;
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
      const radio = document.querySelector(`input[value="${this.selectedProvider}"]`);
      if (radio) radio.checked = true;
      const cardAnthropic = document.getElementById('radioCardAnthropic');
      const cardOpenAI = document.getElementById('radioCardOpenAI');
      if (this.selectedProvider === PROVIDERS.OPENAI) {
        cardOpenAI?.classList.add('active');
        cardAnthropic?.classList.remove('active');
      } else {
        cardAnthropic?.classList.add('active');
        cardOpenAI?.classList.remove('active');
      }
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
