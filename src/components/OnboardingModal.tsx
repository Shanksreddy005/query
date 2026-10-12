import React, { useState, useRef } from 'react';
import { AiProvider, ApiKeyConfig, Dataset } from '../types';
import {
  PROVIDERS_CONFIG,
  DEFAULT_MODELS,
  getProviderConfig,
  getModel,
  ModelMetadata,
} from '../services/modelRegistry';
import { inferDatasetSchema, PREBUILT_DATASETS } from '../services/sampleData';
import Papa from 'papaparse';
import {
  UploadCloud,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  ExternalLink,
  X,
  Check,
} from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (config: ApiKeyConfig, dataset?: Dataset) => void;
  activeDataset: Dataset | null;
  currentConfig: ApiKeyConfig;
  isDarkMode: boolean;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onComplete,
  activeDataset,
  currentConfig,
  isDarkMode,
}) => {
  const [step, setStep] = useState<number>(1);
  const [provider, setProvider] = useState<AiProvider>(currentConfig.provider || 'gemini');
  const [key, setKey] = useState<string>(currentConfig.key || '');
  const [model, setModel] = useState<string>(
    currentConfig.model && getModel(currentConfig.provider || 'gemini', currentConfig.model)
      ? currentConfig.model
      : DEFAULT_MODELS[currentConfig.provider || 'gemini']
  );
  const [showKey, setShowKey] = useState<boolean>(false);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(
    activeDataset || PREBUILT_DATASETS.saas.dataset
  );
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const currentProviderConfig = getProviderConfig(provider);

  const handleProviderSelect = (newProvider: AiProvider) => {
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
          `https://generativelanguage.googleapis.com/v1beta/models?key=${key.trim()}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}: Invalid Gemini API key`);
        setTestStatus('success');
        setTestMessage('Gemini API key verified successfully!');
      } else if (provider === 'groq') {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${key.trim()}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: Invalid Groq API key`);
        setTestStatus('success');
        setTestMessage('Groq Cloud API key verified successfully!');
      } else if (provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key.trim()}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: Invalid OpenAI API key`);
        setTestStatus('success');
        setTestMessage('OpenAI API key verified successfully!');
      }
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage(err?.message || 'Connection test failed. Check key format.');
    }
  };

  const handleFileUpload = (file: File) => {
    if (!file) return;
    setUploadError(null);
    setIsUploading(true);

    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        setIsUploading(false);
        if (results.errors && results.errors.length > 0 && results.data.length === 0) {
          setUploadError(`CSV Parsing Error: ${results.errors[0].message}`);
          return;
        }

        const rawName = file.name.replace(/\.[^/.]+$/, '');
        const tableName = rawName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const ds = inferDatasetSchema(results.data as Record<string, any>[], tableName, rawName);
        ds.fileSizeFormatted = `${(file.size / 1024).toFixed(1)} KB`;
        setSelectedDataset(ds);
      },
      error: (err) => {
        setIsUploading(false);
        setUploadError(`File reading failed: ${err.message}`);
      },
    });
  };

  const handleFinish = () => {
    onComplete(
      {
        provider,
        key: key.trim(),
        model: model || DEFAULT_MODELS[provider],
      },
      selectedDataset || undefined
    );
    onClose();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-standard">
      <div className="relative w-full max-w-xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl bg-surface text-text-primary border-border-subtle overflow-hidden">
        {/* Step Progress Indicator */}
        <div className="flex items-center justify-between px-6 pt-5 pb-2 flex-shrink-0 bg-surface">
          <div className="flex items-center gap-2">
            {[1, 2].map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  s === step
                    ? 'w-8 bg-accent'
                    : s < step
                    ? 'w-4 bg-success'
                    : 'w-4 bg-surface-secondary border border-border-subtle'
                }`}
              />
            ))}
            <span className="text-[11px] text-text-muted font-mono ml-2 font-medium">
              Step {step} of 2: {step === 1 ? 'AI Provider & Key' : 'Choose Dataset'}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-secondary transition-colors duration-fast"
            title="Skip to playground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="px-6 py-4 flex-1 overflow-y-auto">
          {/* STEP 1: COMBINED AI PROVIDER, MODEL SELECTION & API KEY */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in">
              <div>
                <h3 className="text-lg font-bold text-text-primary">Configure AI Provider & Key</h3>
                <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
                  Select your provider and model, then provide your API key. Keys stay in browser memory for this session only.
                </p>
              </div>

              {/* 1. Choose Provider */}
              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted block">
                  1. Select AI Provider
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PROVIDERS_CONFIG.map((p) => {
                    const isSelected = provider === p.id;
                    const isFree = p.category === 'free_tier_available';
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleProviderSelect(p.id)}
                        className={`btn-interactive p-3 rounded-xl border text-left flex flex-col justify-between shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                          isSelected
                            ? 'border-badge-accent-border bg-badge-accent-bg text-badge-accent-fg font-semibold'
                            : 'border-border-subtle bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary hover:bg-surface-secondary'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs font-bold text-text-primary truncate">{p.name}</span>
                        </div>
                        <span
                          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded mt-2 self-start ${
                            isFree
                              ? 'bg-badge-success-bg text-badge-success-fg border border-badge-success-border'
                              : 'bg-badge-info-bg text-badge-info-fg border border-badge-info-border'
                          }`}
                        >
                          {isFree ? 'FREE TIER' : 'PAID API'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Choose Model */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                    2. Model Selection ({currentProviderConfig.name})
                  </label>
                  <span className="text-[10px] text-text-muted font-mono">
                    Default: {DEFAULT_MODELS[provider]}
                  </span>
                </div>

                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {currentProviderConfig.models.map((m: ModelMetadata) => {
                    const isSelected = model === m.id;
                    return (
                      <div
                        key={m.id}
                        onClick={() => setModel(m.id)}
                        className={`btn-interactive p-2.5 rounded-lg border cursor-pointer flex items-center justify-between gap-2 shadow-2xs ${
                          isSelected
                            ? 'border-badge-accent-border bg-badge-accent-bg text-text-primary'
                            : 'border-border-subtle bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary hover:bg-surface-secondary'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="radio"
                            name="onboarding_model"
                            checked={isSelected}
                            onChange={() => setModel(m.id)}
                            className="text-accent focus:ring-accent cursor-pointer"
                          />
                          <div className="truncate">
                            <span className="text-xs font-semibold text-text-primary">{m.name}</span>
                            <span className="text-[10px] text-text-muted font-mono ml-1.5 truncate">({m.id})</span>
                          </div>
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
                    );
                  })}
                </div>
              </div>

              {/* 3. API Key Input & Test */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
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
                      className="p-1 text-text-muted hover:text-text-primary"
                    >
                      {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testStatus === 'testing' || !key.trim()}
                      className="btn-interactive text-[11px] font-medium px-2 py-1 rounded bg-badge-accent-bg text-badge-accent-fg border border-badge-accent-border hover:bg-accent/20 disabled:opacity-40 transition-colors shadow-2xs"
                    >
                      {testStatus === 'testing' ? 'Testing...' : 'Test Key'}
                    </button>
                  </div>
                </div>

                {testStatus === 'success' && (
                  <div className="p-2.5 rounded-lg text-xs bg-badge-success-bg border border-badge-success-border text-badge-success-fg flex items-center gap-1.5 animate-in fade-in shadow-2xs">
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-success" />
                    <span>{testMessage}</span>
                  </div>
                )}
                {testStatus === 'error' && (
                  <div className="p-2.5 rounded-lg text-xs bg-badge-error-bg border border-badge-error-border text-badge-error-fg flex items-center gap-1.5 animate-in fade-in shadow-2xs">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-error" />
                    <span>{testMessage}</span>
                  </div>
                )}

                <p className="text-[10.5px] text-text-muted">
                  Key optional for demo: preloaded datasets support verified queries keyless.
                </p>
              </div>

              {/* Bottom Actions for Step 1 */}
              <div className="pt-3 flex items-center justify-between border-t border-border-subtle">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-interactive text-xs text-text-muted hover:text-text-primary"
                >
                  Skip to Playground
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="btn-interactive px-5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium text-xs flex items-center gap-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <span>Continue to Dataset</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: DATASET SELECTION & UPLOAD */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in">
              <div>
                <h3 className="text-lg font-bold text-text-primary">Select or Upload Dataset</h3>
                <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
                  Your full dataset is processed 100% locally in your browser using DuckDB-WASM.
                </p>
              </div>

              {/* Upload Drop Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="btn-interactive p-6 rounded-xl border-2 border-dashed text-center cursor-pointer border-border-strong hover:border-accent bg-surface-secondary/50 shadow-2xs"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                  className="hidden"
                />
                <UploadCloud className="w-8 h-8 mx-auto text-accent mb-2" />
                <span className="text-xs font-semibold block text-text-primary">Drop your CSV here, or browse files</span>
                <span className="text-[10.5px] text-text-muted mt-0.5 block">
                  Loaded straight into browser memory · Never uploaded to any backend
                </span>
                {isUploading && <span className="text-xs text-accent mt-2 block font-medium">Parsing CSV...</span>}
              </div>

              {uploadError && (
                <div className="p-2.5 rounded-lg text-xs bg-badge-error-bg border border-badge-error-border text-badge-error-fg flex items-center gap-1.5 shadow-2xs">
                  <AlertCircle className="w-3.5 h-3.5 text-error" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Preloaded Sample Datasets */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted block">
                  Or choose a preloaded sample dataset
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedDataset(PREBUILT_DATASETS.saas.dataset)}
                    className={`btn-interactive p-3 rounded-xl border text-left shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                      selectedDataset?.id === 'customers'
                        ? 'border-badge-accent-border bg-badge-accent-bg text-badge-accent-fg font-semibold'
                        : 'border-border-subtle bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary hover:bg-surface-secondary'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-text-primary">SaaS Customer MRR</span>
                      {selectedDataset?.id === 'customers' && (
                        <Check className="w-3.5 h-3.5 text-accent" />
                      )}
                    </div>
                    <div className="text-[10.5px] text-text-muted mt-1">20 rows · Churn & Revenue</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedDataset(PREBUILT_DATASETS.ecommerce.dataset)}
                    className={`btn-interactive p-3 rounded-xl border text-left shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                      selectedDataset?.id === 'orders'
                        ? 'border-badge-accent-border bg-badge-accent-bg text-badge-accent-fg font-semibold'
                        : 'border-border-subtle bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary hover:bg-surface-secondary'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-text-primary">E-Commerce Orders</span>
                      {selectedDataset?.id === 'orders' && (
                        <Check className="w-3.5 h-3.5 text-accent" />
                      )}
                    </div>
                    <div className="text-[10.5px] text-text-muted mt-1">15 rows · Sales & Profit</div>
                  </button>
                </div>
              </div>

              {/* Active Selection Confirmation Card */}
              {selectedDataset && (
                <div className="p-3 rounded-xl border border-badge-success-border bg-badge-success-bg text-badge-success-fg text-xs flex items-center gap-2.5 shadow-2xs">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-success" />
                  <span className="truncate">
                    Ready to analyze: <strong className="text-text-primary">{selectedDataset.name}</strong> ({selectedDataset.rowCount.toLocaleString()} rows, {selectedDataset.columns.length} columns)
                  </span>
                </div>
              )}

              {/* Bottom Actions for Step 2 */}
              <div className="pt-3 flex items-center justify-between border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="btn-interactive px-3.5 py-1.5 rounded-lg border text-xs font-medium border-border-strong bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-elevated flex items-center gap-1.5 shadow-2xs"
                >
                  <ArrowLeft className="w-3 h-3" /> Back
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  className="btn-interactive px-5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium text-xs flex items-center gap-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Start Analyzing</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
