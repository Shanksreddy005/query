import React from 'react';
import { Dataset, OutOfScopeData } from '../types';
import {
  Compass,
  AlertTriangle,
  X,
  Database,
  ArrowRight,
  Sparkles,
  HelpCircle,
  Layers,
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

  const modalBg = isDarkMode
    ? 'bg-[#13161f] text-slate-100 border-[#2a2f42]'
    : 'bg-white text-slate-800 border-slate-200';
  const cardBg = isDarkMode
    ? 'bg-[#0f1118] border-[#1d2230]'
    : 'bg-slate-50 border-slate-200';

  const handleSuggestionClick = (q: string) => {
    onSelectSuggestion(q);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className={`relative w-full max-w-xl rounded-2xl border shadow-2xl p-6 ${modalBg} overflow-hidden space-y-5`}
      >
        {/* Top Header */}
        <div className="flex items-start justify-between pb-3 border-b border-inherit">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-100">
                  Question Out of Scope
                </h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Out of Bounds
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                This question cannot be answered using the loaded dataset.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User's Original Query Box */}
        <div className={`p-3.5 rounded-xl border ${cardBg}`}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Your Question
          </span>
          <p className="text-xs sm:text-sm font-medium text-slate-200 italic">
            "{data.question}"
          </p>
        </div>

        {/* Explanation Alert Card */}
        <div className="p-3.5 rounded-xl border border-amber-500/25 bg-amber-500/5 text-amber-300 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold text-amber-200">Why this cannot be analyzed:</span>
            <p className="text-amber-300/90 leading-relaxed">
              {data.reason}
            </p>
          </div>
        </div>

        {/* Dataset Scope Info */}
        {dataset && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                <Database className="w-3.5 h-3.5 text-[#8B7FF5]" />
                Active Dataset: <strong className="text-slate-200">{dataset.name}</strong>
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {dataset.rowCount.toLocaleString()} rows · {dataset.columns.length} columns
              </span>
            </div>

            {/* Column pills */}
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-lg bg-black/20 border border-inherit">
              {dataset.columns.map((col) => (
                <span
                  key={col.name}
                  className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/60"
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
            <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#8B7FF5]" />
              Try one of these relevant questions instead:
            </span>
            <div className="space-y-1.5">
              {data.suggestedQuestions.map((sug, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(sug)}
                  className={`w-full p-2.5 rounded-lg border text-left text-xs transition-all flex items-center justify-between group ${
                    isDarkMode
                      ? 'bg-[#151a28] border-[#22293d] text-slate-300 hover:border-[#5B4BE8] hover:text-white hover:bg-[#5B4BE8]/10'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-[#5B4BE8] hover:text-[#5B4BE8]'
                  }`}
                >
                  <span className="truncate pr-2">{sug}</span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-[#8B7FF5]" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-inherit flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#5B4BE8] hover:bg-[#5B4BE8]/90 text-white transition-all shadow-sm active:scale-95"
          >
            Got It · Edit Query
          </button>
        </div>
      </div>
    </div>
  );
};
