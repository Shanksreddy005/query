/**
 * BYOK API Key Modal & Key Lifecycle Manager
 * Ensures zero-persistence of credentials: held in memory closure only.
 */

import { setApiKey, hasApiKey, clearApiKey, verifyApiKey, getActiveModel, setActiveModel, MODELS } from '../agent/claude_client.js';

export class ApiKeyModal {
  constructor({ onKeyConfigured = () => {}, onDemoMode = () => {} }) {
    this.onKeyConfigured = onKeyConfigured;
    this.onDemoMode = onDemoMode;
    this.modalEl = null;
    this.topbarBadgeEl = null;
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
              <div class="modal-title">QueryMind — Private Browser Analytics</div>
              <div class="modal-subtitle">Bring Your Own Key (BYOK) · 100% In-Browser Execution</div>
            </div>
          </div>
        </div>

        <div class="modal-body">
          <p class="modal-desc">
            To enable natural-language SQL analysis, connect your <strong>Anthropic Claude API key</strong>. Your key is used directly from this browser session and is <strong>never stored in localStorage, cookies, or on any server</strong>.
          </p>

          <div class="form-group">
            <label class="form-label" for="apiKeyInput">Anthropic Claude API Key</label>
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

          <div class="form-group">
            <label class="form-label" for="modelSelect">Claude Model</label>
            <select id="modelSelect" class="form-select">
              <option value="${MODELS.SONNET}" selected>Claude Sonnet 5.5 (Recommended · High Capability)</option>
              <option value="${MODELS.HAIKU}">Claude Haiku 4.5 (Fast · Lower Cost)</option>
            </select>
          </div>

          <div class="privacy-callout">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#34c97b" stroke-width="1.8">
              <path d="M8 1v5M8 9v6M1 8h14"/>
              <circle cx="8" cy="8" r="7"/>
            </svg>
            <span>
              <strong>Memory-Only Guarantee:</strong> Closing or refreshing this tab immediately wipes the key from memory.
            </span>
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

    // Event listeners
    const input = document.getElementById('apiKeyInput');
    const toggleBtn = document.getElementById('toggleKeyVisibility');
    const verifyBtn = document.getElementById('btnVerifyKey');
    const demoBtn = document.getElementById('btnContinueDemo');
    const modelSelect = document.getElementById('modelSelect');

    toggleBtn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      toggleBtn.textContent = input.type === 'password' ? '👁' : '🔒';
    });

    modelSelect.addEventListener('change', () => {
      setActiveModel(modelSelect.value);
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

  createTopbarControls() {
    const topbarRight = document.querySelector('.topbar-right');
    if (!topbarRight) return;

    const wrap = document.createElement('div');
    wrap.className = 'topbar-key-controls';
    wrap.innerHTML = `
      <div id="keyStatusBadge" class="badge badge-blue">
        <span class="status-dot"></span>
        <span class="status-text">No API Key</span>
      </div>
      <button id="btnClearKeyBtn" class="btn-sm btn-ghost" style="display: none;" title="Wipe API key from memory">
        Clear Key
      </button>
      <button id="btnOpenKeyModal" class="btn-sm btn-secondary" title="Configure Anthropic API Key">
        Key Settings
      </button>
    `;

    topbarRight.prepend(wrap);

    document.getElementById('btnClearKeyBtn').addEventListener('click', () => {
      clearApiKey();
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

    const key = input.value.trim();
    if (!key) {
      errorEl.textContent = 'Please enter your Anthropic API key.';
      errorEl.style.display = 'block';
      return;
    }

    errorEl.style.display = 'none';
    verifyBtn.disabled = true;
    btnText.textContent = 'Verifying with Anthropic...';

    const check = await verifyApiKey(key, getActiveModel());

    verifyBtn.disabled = false;
    btnText.textContent = 'Verify & Continue';

    if (check.valid) {
      setApiKey(key);
      input.value = ''; // Clear DOM input for security
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

    if (hasApiKey()) {
      badge.className = 'badge badge-green';
      badge.innerHTML = `<span class="status-dot green"></span>Claude Key Active (${getActiveModel()})`;
      if (clearBtn) clearBtn.style.display = 'inline-flex';
    } else {
      badge.className = 'badge badge-blue';
      badge.innerHTML = `<span class="status-dot blue"></span>Demo Mode · No Key`;
      if (clearBtn) clearBtn.style.display = 'none';
    }
  }

  show() {
    if (this.modalEl) {
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
