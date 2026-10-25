import React, { useState } from 'react';
import { ApiKeyConfig, AiProvider } from '../types';
import {
  PROVIDERS_CONFIG,
  DEFAULT_MODELS,
  getProviderConfig,
  getModel,
  ModelMetadata,
} from '../services/modelRegistry';
import {
  Key,
  ShieldCheck,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  X,
  Cpu,
  Zap,
  Info,
} from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ApiKeyConfig;
  onSave: (config: ApiKeyConfig) => void;
  isDarkMode: boolean;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
  isDarkMode,
}) => {
  const [provider, setProvider] = useState<AiProvider>(config.provider || 'gemini');
  const [key, setKey] = useState<string>(config.key || '');
  const [model, setModel] = useState<string>(
    config.model && getModel(config.provider || 'gemini', config.model)
      ? config.model
      : DEFAULT_MODELS[config.provider || 'gemini']
  );
  const [showKey, setShowKey] = useState<boolean>(false);
  const [rememberKey, setRememberKey] = useState<boolean>(Boolean(config.rememberKey));
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');

  if (!isOpen) return null;

  const currentProviderConfig = getProviderConfig(provider);
  const freeProviders = PROVIDERS_CONFIG.filter((p) => p.category === 'free_tier_available');
  const paidProviders = PROVIDERS_CONFIG.filter((p) => p.category === 'paid');

  const handleProviderChange = (newProvider: AiProvider) => {
    setProvider(newProvider);
    setModel(DEFAULT_MODELS[newProvider]);
    setTestStatus('idle');
    setTestMessage('');
  };

  const handleTestConnection = async () => {
    if (!key.trim()) {
      setTestStatus('error');
      setTestMessage('Please enter an API key first.');
      return;
    }

    setTestStatus('testing');
    setTestMessage(`Validating key directly with ${currentProviderConfig.name}...`);

    try {
      if (provider === 'gemini') {
        const res = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models',
          {
            headers: {
              'x-goog-api-key': key.trim(),
            },
          }
        );
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`HTTP ${res.status}: Invalid or unauthorized Gemini API key (${body.slice(0, 100)})`);
        }
        setTestStatus('success');
        setTestMessage('Gemini API key verified successfully! Ready for AI analysis.');
      } else if (provider === 'groq') {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${key.trim()}` },
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`HTTP ${res.status}: Invalid Groq API key (${body.slice(0, 100)})`);
        }
        setTestStatus('success');
        setTestMessage('Groq Cloud API key verified successfully! Ready for fast inference.');
      } else if (provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key.trim()}` },
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`HTTP ${res.status}: Invalid OpenAI API key (${body.slice(0, 100)})`);
        }
        setTestStatus('success');
        setTestMessage('OpenAI API key verified successfully! Ready for AI analysis.');
      }
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage(err?.message || 'Connection test failed. Check key format and permissions.');
    }
  };

  const handleSave = () => {
    onSave({
      provider,
      key: key.trim(),
      model: model || DEFAULT_MODELS[provider],
      rememberKey,
    });
    onClose();
  };

  const handleClear = () => {
    setKey('');
    setRememberKey(false);
    onSave({
      provider,
      key: '',
      model: DEFAULT_MODELS[provider],
      rememberKey: false,
    });
    setTestStatus('idle');
    setTestMessage('');
  };

  const getBadgeClass = (badge: string) => {
    if (badge.includes('ADVANCED') || badge.includes('PREVIEW')) {
      return 'bg-badge-warning-bg text-badge-warning-fg border border-badge-warning-border';
    }
    if (badge.includes('FAST') || badge.includes('FREE TIER')) {
      return 'bg-badge-success-bg text-badge-success-fg border border-badge-success-border';
    }
    if (badge.includes('PAID')) {
      return 'bg-badge-info-bg text-badge-info-fg border border-badge-info-border';
    }
    return 'bg-surface-secondary text-text-secondary border border-border-subtle';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-standard">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl bg-surface text-text-primary border-border-subtle overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle flex-shrink-0 bg-surface">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-badge-accent-bg text-badge-accent-fg border border-badge-accent-border flex items-center justify-center shadow-2xs">
              <Key className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text-primary">AI Provider & Model Settings</h3>
              <p className="text-xs text-text-secondary">Bring Your Own Key (BYOK) · Direct client-side inference</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-secondary transition-colors duration-fast"
            aria-label="Close Settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Zero-Backend Privacy Guarantee Callout */}
          <div className="p-3.5 rounded-xl border border-badge-success-border bg-badge-success-bg text-badge-success-fg text-xs flex items-start gap-3 shadow-2xs">
            <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5 text-success" />
            <div className="space-y-1">
              <span className="font-semibold block text-text-primary">100% Client-Side Privacy Guarantee</span>
              <p className="text-text-secondary leading-relaxed text-[11.5px]">
                • <strong>Session-Only Memory:</strong> Your API key is held exclusively in memory and never stored persistently or sent to any proxy backend.<br />
                • <strong>Local DuckDB Engine:</strong> Your dataset is parsed and queried in-memory via DuckDB-WASM.<br />
                • <strong>No Data Ingestion:</strong> Datasets are never uploaded to the AI; only schema and minimal column statistics are used for semantic planning.
              </p>
            </div>
          </div>

          {/* Provider Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                1. Select AI Provider
              </span>
              <span className="text-[11px] text-text-muted font-mono">
                Active: {currentProviderConfig.name}
              </span>
            </div>

            <div className="space-y-3">
              {/* Free AI Options */}
              <div>
                <div className="text-[11px] font-medium text-success flex items-center gap-1.5 mb-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Free AI Options (Free Tier Available)</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {freeProviders.map((p) => {
                    const isSelected = provider === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleProviderChange(p.id)}
                        className={`btn-interactive flex flex-col items-start p-3 rounded-xl border text-left shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                          isSelected
                            ? 'border-badge-accent-border bg-badge-accent-bg text-badge-accent-fg font-semibold'
                            : 'border-border-subtle bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary hover:bg-surface-secondary'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs font-bold text-text-primary">{p.name}</span>
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-badge-success-bg text-badge-success-fg border border-badge-success-border">
                            {p.tierLabel}
                          </span>
                        </div>
                        <span className="text-[10px] text-text-muted mt-1 font-mono truncate w-full">
                          Default: {DEFAULT_MODELS[p.id]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Paid AI Option */}
              <div>
                <div className="text-[11px] font-medium text-info flex items-center gap-1.5 mb-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Paid AI Option (Paid API Access)</span>
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {paidProviders.map((p) => {
                    const isSelected = provider === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleProviderChange(p.id)}
                        className={`btn-interactive flex flex-col items-start p-3 rounded-xl border text-left shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                          isSelected
                            ? 'border-badge-accent-border bg-badge-accent-bg text-badge-accent-fg font-semibold'
                            : 'border-border-subtle bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary hover:bg-surface-secondary'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs font-bold text-text-primary">{p.name}</span>
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-badge-info-bg text-badge-info-fg border border-badge-info-border">
                            {p.tierLabel}
                          </span>
                        </div>
                        <span className="text-[10px] text-text-muted mt-1 font-mono truncate w-full">
                          Default: {DEFAULT_MODELS[p.id]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Model Selector */}
          <div className="p-4 rounded-xl border border-border-subtle bg-surface-secondary/50 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                2. Select {currentProviderConfig.name} Model
              </label>
              <span className="text-[11px] text-text-muted">
                Single Source of Truth Catalog
              </span>
            </div>

            <div className="space-y-2">
              {currentProviderConfig.models.map((m: ModelMetadata) => {
                const isSelected = model === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    className={`btn-interactive p-3 rounded-lg border cursor-pointer transition-all duration-fast ${
                      isSelected
                        ? 'border-badge-accent-border bg-badge-accent-bg text-text-primary'
                        : 'border-border-subtle bg-surface hover:border-border-strong text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="model_selection"
                          checked={isSelected}
                          onChange={() => setModel(m.id)}
                          className="text-accent focus:ring-accent cursor-pointer"
                        />
                        <span className="text-xs font-semibold text-text-primary">{m.name}</span>
                        <code className="text-[10px] text-text-muted font-mono">({m.id})</code>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {m.recommended && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-badge-accent-bg text-badge-accent-fg border border-badge-accent-border">
                            RECOMMENDED
                          </span>
                        )}
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${getBadgeClass(m.badge)}`}>
                          {m.badge}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-text-secondary mt-1 pl-5 leading-relaxed">
                      {m.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* API Key Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                3. {currentProviderConfig.name} API Key
              </label>
              <a
                href={currentProviderConfig.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-accent hover:underline inline-flex items-center gap-1 font-medium"
              >
                {currentProviderConfig.docsLabel} <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={currentProviderConfig.placeholder}
                className="w-full text-xs font-mono rounded-lg pl-3 pr-24 py-2.5 border outline-none transition-all duration-fast bg-surface border-border-strong text-text-primary focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="p-1 text-text-muted hover:text-text-primary transition-colors duration-fast"
                  title={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testStatus === 'testing' || !key.trim()}
                  className="btn-interactive text-[11px] font-medium px-2 py-1 rounded bg-badge-accent-bg text-badge-accent-fg border border-badge-accent-border hover:bg-accent/20 disabled:opacity-40 shadow-2xs"
                >
                  {testStatus === 'testing' ? 'Testing...' : 'Test Key'}
                </button>
              </div>
            </div>

            {/* Provider notice */}
            <p className="text-[11px] text-text-muted flex items-center gap-1 mt-1">
              <Info className="w-3 h-3 flex-shrink-0 text-text-muted" />
              <span>{currentProviderConfig.billingNotice}</span>
            </p>

            {/* Persistent storage opt-in checkbox */}
            <div className="pt-2 border-t border-border-subtle/50 mt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-text-secondary select-none hover:text-text-primary transition-colors">
                <input
                  type="checkbox"
                  checked={rememberKey}
                  onChange={(e) => setRememberKey(e.target.checked)}
                  className="rounded border-border-strong text-accent focus:ring-accent w-3.5 h-3.5"
                />
                <span>Remember API key in browser on this device (opt-in · unchecked keeps key in volatile session memory only)</span>
              </label>
            </div>

            {/* Test status banner */}
            {testStatus === 'success' && (
              <div className="mt-2 text-xs p-2.5 rounded-lg bg-badge-success-bg border border-badge-success-border text-badge-success-fg flex items-center gap-1.5 animate-in fade-in shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-success" />
                <span>{testMessage}</span>
              </div>
            )}
            {testStatus === 'error' && (
              <div className="mt-2 text-xs p-2.5 rounded-lg bg-badge-error-bg border border-badge-error-border text-badge-error-fg flex items-center gap-1.5 animate-in fade-in shadow-2xs">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-error" />
                <span>{testMessage}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-border-subtle flex items-center justify-between flex-shrink-0 bg-surface">
          <div className="flex items-center gap-2">
            {key && (
              <button
                type="button"
                onClick={handleClear}
                className="btn-interactive text-xs text-text-muted hover:text-error transition-colors duration-fast"
              >
                Clear Key
              </button>
            )}
            {!key && (
              <span className="text-xs text-text-muted">
                Key optional: Prebuilt datasets support instant verified queries
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-interactive px-3.5 py-1.5 text-xs font-medium rounded-lg border border-border-strong bg-surface hover:bg-surface-elevated text-text-secondary hover:text-text-primary shadow-2xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="btn-interactive px-4 py-1.5 text-xs font-semibold rounded-lg bg-accent hover:bg-accent-hover text-white shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
