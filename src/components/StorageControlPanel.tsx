import React, { useState, useRef } from 'react';
import { LocalQueryStorage } from '../services/localQueryStorage';
import { LibraryShareEngine } from '../services/libraryShareEngine';
import { Download, Upload, RotateCcw, CheckCircle2, AlertTriangle, Database } from 'lucide-react';

interface StorageControlPanelProps {
  isDarkMode?: boolean;
}

export function StorageControlPanel({ isDarkMode = true }: StorageControlPanelProps) {
  const storage = new LocalQueryStorage();
  const shareEngine = new LibraryShareEngine();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [diagnostics, setDiagnostics] = useState(storage.getLibraryDiagnostics());
  const [showConfirm, setShowConfirm] = useState(false);
  const [successStatus, setSuccessStatus] = useState<string | null>(null);

  const refreshStats = () => {
    setDiagnostics(storage.getLibraryDiagnostics());
  };

  const handleExport = () => {
    shareEngine.exportLocalLibraryToFile();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    shareEngine.importLibraryFromFile(file, (addedCount) => {
      refreshStats();
      setSuccessStatus(`Successfully imported ${addedCount} new blueprint(s)!`);
      setTimeout(() => setSuccessStatus(null), 3500);
    });

    e.target.value = '';
  };

  const handleResetExecution = () => {
    storage.resetToFactoryDefaults();
    refreshStats();
    setShowConfirm(false);
    setSuccessStatus('Factory starter blueprints successfully restored!');

    setTimeout(() => {
      setSuccessStatus(null);
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    }, 1500);
  };

  return (
    <div className="border border-border-subtle bg-surface-secondary/70 p-4 rounded-xl text-text-primary shadow-xs">
      {/* Hidden File Input for Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-xs tracking-wide uppercase flex items-center gap-1.5 text-text-primary">
          <Database className="w-3.5 h-3.5 text-accent" />
          <span>Local Library State</span>
        </h4>
        <span className="text-[10px] bg-badge-accent-bg text-badge-accent-fg font-mono px-2 py-0.5 rounded-full border border-badge-accent-border">
          {(diagnostics.byteSizeEstimate / 1024).toFixed(1)} KB
        </span>
      </div>

      {/* Metric Breakdown Grid */}
      <div className="grid grid-cols-2 gap-2 mb-3 text-center">
        <div className="bg-surface p-2 rounded-lg border border-border-subtle shadow-2xs">
          <div className="text-[10px] text-text-muted">Preloaded Packs</div>
          <div className="text-base font-mono font-bold text-text-primary">{diagnostics.standardSeedCount}</div>
        </div>
        <div className="bg-surface p-2 rounded-lg border border-border-subtle shadow-2xs">
          <div className="text-[10px] text-text-muted">User Blueprints</div>
          <div className="text-base font-mono font-bold text-success">{diagnostics.userCustomCount}</div>
        </div>
      </div>

      {/* Share / Export / Import Action Row */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <button
          type="button"
          onClick={handleExport}
          className="btn-interactive flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-border-strong bg-surface hover:bg-surface-elevated text-text-primary shadow-2xs cursor-pointer transition-colors"
          title="Download saved templates as a shareable JSON configuration file"
        >
          <Download className="w-3.5 h-3.5 text-accent" />
          <span>Export (JSON)</span>
        </button>

        <button
          type="button"
          onClick={handleImportClick}
          className="btn-interactive flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-border-strong bg-surface hover:bg-surface-elevated text-text-primary shadow-2xs cursor-pointer transition-colors"
          title="Import JSON blueprint configuration file from a teammate"
        >
          <Upload className="w-3.5 h-3.5 text-accent" />
          <span>Import (JSON)</span>
        </button>
      </div>

      {/* Action Execution Layer: Factory Reset */}
      {!showConfirm ? (
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="btn-interactive w-full flex items-center justify-center gap-1.5 text-[11px] font-medium text-text-muted hover:text-error bg-surface hover:bg-badge-error-bg/30 border border-border-subtle hover:border-badge-error-border py-1.5 px-2.5 rounded-lg transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset to Factory Defaults</span>
        </button>
      ) : (
        <div className="p-2.5 rounded-lg border border-badge-error-border bg-badge-error-bg text-text-primary animate-in fade-in">
          <p className="text-[10px] text-error leading-relaxed mb-2 flex items-start gap-1">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>Warning: Deletes custom saved queries and resets to starter templates.</span>
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleResetExecution}
              className="flex-1 text-[10px] font-bold bg-error hover:bg-error/90 text-white py-1 px-2 rounded-md transition cursor-pointer"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="flex-1 text-[10px] font-medium border border-border-strong bg-surface hover:bg-surface-elevated text-text-secondary py-1 px-2 rounded-md transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Transient Success Feedback Banner */}
      {successStatus && (
        <div className="mt-2 text-center text-[10px] font-medium bg-badge-success-bg text-badge-success-fg border border-badge-success-border p-1.5 rounded-lg flex items-center justify-center gap-1.5 animate-pulse">
          <CheckCircle2 className="w-3 h-3 text-success" />
          <span>{successStatus}</span>
        </div>
      )}
    </div>
  );
}
