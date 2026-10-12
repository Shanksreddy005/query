import React from 'react';
import { Dataset, OutOfScopeData } from '../types';
import {
  Compass,
  AlertTriangle,
  X,
  Database,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface OutOfScopeModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: OutOfScopeData | null;
  dataset: Dataset | null;
  onSelectSuggestion: (question: string) => void;
  isDarkMode: boolean;
}

export const OutOfScopeModal: React.FC<OutOfScopeModalProps> = ({
  isOpen,
  onClose,
  data,
  dataset,
  onSelectSuggestion,
  isDarkMode,
}) => {
  if (!isOpen || !data) return null;

  const handleSuggestionClick = (q: string) => {
    onSelectSuggestion(q);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-standard">
      <div className="relative w-full max-w-xl rounded-2xl border shadow-2xl p-6 bg-surface text-text-primary border-border-subtle overflow-hidden space-y-5">
        {/* Top Header */}
        <div className="flex items-start justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-badge-warning-bg text-badge-warning-fg border border-badge-warning-border flex items-center justify-center flex-shrink-0 shadow-2xs">
              <Compass className="w-5 h-5 text-warning" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-text-primary">
                  Question Out of Scope
                </h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-badge-warning-bg text-badge-warning-fg border border-badge-warning-border">
                  Out of Bounds
                </span>
              </div>
              <p className="text-xs text-text-secondary mt-0.5">
                This question cannot be answered using the loaded dataset.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-secondary transition-colors duration-fast"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User's Original Query Box */}
        <div className="p-3.5 rounded-xl border border-border-subtle bg-surface-secondary/70">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block mb-1">
            Your Question
          </span>
          <p className="text-xs sm:text-sm font-medium text-text-primary italic">
            "{data.question}"
          </p>
        </div>

        {/* Explanation Alert Card */}
        <div className="p-3.5 rounded-xl border border-badge-warning-border bg-badge-warning-bg text-badge-warning-fg text-xs flex items-start gap-2.5 shadow-2xs">
          <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold block text-text-primary">Why this cannot be analyzed:</span>
            <p className="text-text-secondary leading-relaxed">
              {data.reason}
            </p>
          </div>
        </div>

        {/* Dataset Scope Info */}
        {dataset && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted flex items-center gap-1.5 font-medium">
                <Database className="w-3.5 h-3.5 text-accent" />
                Active Dataset: <strong className="text-text-primary">{dataset.name}</strong>
              </span>
              <span className="text-[11px] text-text-muted font-mono">
                {dataset.rowCount.toLocaleString()} rows · {dataset.columns.length} columns
              </span>
            </div>

            {/* Column pills */}
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-lg bg-surface-secondary/50 border border-border-subtle">
              {dataset.columns.map((col) => (
                <span
                  key={col.name}
                  className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface border border-border-strong text-text-secondary"
                >
                  {col.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Suggested in-scope questions */}
        {data.suggestedQuestions && data.suggestedQuestions.length > 0 && (
          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-text-secondary flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              Try one of these relevant questions instead:
            </span>
            <div className="space-y-1.5">
              {data.suggestedQuestions.map((sug, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(sug)}
                  className="btn-interactive w-full p-2.5 rounded-lg border text-left text-xs flex items-center justify-between group bg-surface border-border-subtle text-text-secondary hover:border-accent hover:text-text-primary hover:bg-surface-secondary shadow-2xs"
                >
                  <span className="truncate pr-2 font-medium">{sug}</span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-fast text-accent flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-border-subtle flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-interactive px-4 py-1.5 text-xs font-semibold rounded-lg bg-accent hover:bg-accent-hover text-white shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            Got It · Edit Query
          </button>
        </div>
      </div>
    </div>
  );
};
