import React, { useRef, useEffect } from 'react';
import { QueryMindLogo } from './QueryMindLogo';
import { Play, Sparkles, Loader2 } from 'lucide-react';
import { Dataset, ReasoningStep } from '../types';
import { PREBUILT_DATASETS } from '../services/sampleData';

interface QueryInputAreaProps {
  query: string;
  onChangeQuery: (newQuery: string) => void;
  onRunQuery: (queryToRun?: string) => void;
  isRunning: boolean;
  activeStep?: ReasoningStep | null;
  dataset: Dataset | null;
  hasRunAnyQuery: boolean;
  isDarkMode: boolean;
}

export const QueryInputArea: React.FC<QueryInputAreaProps> = ({
  query,
  onChangeQuery,
  onRunQuery,
  isRunning,
  activeStep,
  dataset,
  hasRunAnyQuery,
  isDarkMode,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!isRunning && query.trim() && dataset) {
        onRunQuery();
      }
    }
  };

  // Determine suggestions based on dataset
  let suggestions: string[] = [];
  if (dataset?.id === 'customers') {
    suggestions = PREBUILT_DATASETS.saas.promptSuggestions;
  } else if (dataset?.id === 'orders') {
    suggestions = PREBUILT_DATASETS.ecommerce.promptSuggestions;
  } else if (dataset && dataset.columns.length > 0) {
    const numCol = dataset.columns.find((c) => c.type === 'number')?.name || 'value';
    const catCol = dataset.columns.find((c) => c.type === 'string')?.name || 'category';
    suggestions = [
      `Show top 5 records ordered by ${numCol} descending`,
      `What is the average ${numCol} grouped by ${catCol}?`,
      `Count the total number of records by ${catCol}`,
    ];
  }

  const cardBorder = 'border-border-subtle hover:border-border-strong focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25';

  return (
    <div className="w-full space-y-4">
      {/* Hero Welcome state if no query run yet */}
      {!hasRunAnyQuery && (
        <div className="flex flex-col items-center justify-center py-6 sm:py-8 text-center animate-in fade-in duration-300">
          <QueryMindLogo size={48} variant="stacked" isDarkMode={isDarkMode} />
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight mt-4 text-text-primary">
            Talk to your data. Get answers.
          </h2>
          <p className="text-xs sm:text-sm text-text-secondary mt-1.5 max-w-md leading-relaxed">
            Ask questions in plain English. QueryMind plans, validates, and executes SQL locally in your browser.
          </p>
        </div>
      )}

      {/* Main Query Input Card */}
      <div className={`rounded-2xl border shadow-sm overflow-hidden transition-all duration-fast bg-surface ${cardBorder}`}>
        <div className="p-3 sm:p-4 bg-surface">
          <textarea
            ref={textareaRef}
            rows={2}
            value={query}
            onChange={(e) => onChangeQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask a question about ${dataset?.name || 'your dataset'} in plain English...`}
            disabled={isRunning || !dataset}
            className="w-full bg-transparent outline-none resize-none text-sm sm:text-base leading-relaxed placeholder:text-text-muted font-sans text-text-primary disabled:opacity-50"
          />
        </div>

        {/* Live Step Progress Display */}
        {isRunning && activeStep && (
          <div className="px-4 py-2 border-t border-border-subtle flex items-center justify-between text-xs transition-colors duration-fast bg-badge-accent-bg text-badge-accent-fg border-badge-accent-border font-medium">
            <div className="flex items-center gap-2 overflow-hidden">
              <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0 text-accent" />
              <span className="font-semibold flex-shrink-0">{activeStep.title}:</span>
              <span className="truncate opacity-90">{activeStep.detail}</span>
            </div>
          </div>
        )}

        {/* Card Footer with shortcuts and Run Button */}
        <div className="px-3 sm:px-4 py-2.5 border-t flex items-center justify-between gap-3 text-xs bg-surface-secondary/70 border-border-subtle">
          <div className="flex items-center gap-1.5 text-text-muted select-none">
            <span className="hidden sm:inline">Press</span>
            <kbd className="px-1.5 py-0.5 rounded text-[11px] font-mono border bg-surface border-border-strong text-text-secondary shadow-2xs">
              ⌘ + Enter
            </kbd>
            <span className="hidden sm:inline">or</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[11px] font-mono border bg-surface border-border-strong text-text-secondary shadow-2xs">
              Ctrl + Enter
            </kbd>
            <span className="hidden sm:inline">to execute</span>
          </div>

          <div className="flex items-center gap-2">
            {query.trim() && (
              <button
                type="button"
                onClick={() => onChangeQuery('')}
                disabled={isRunning}
                className="btn-interactive text-xs text-text-muted hover:text-text-primary px-2 py-1 rounded transition-colors duration-fast focus-visible:outline-none"
              >
                Clear
              </button>
            )}

            <button
              type="button"
              onClick={() => onRunQuery()}
              disabled={isRunning || !query.trim() || !dataset}
              className={`btn-interactive flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                isRunning || !query.trim() || !dataset
                  ? 'bg-accent/40 cursor-not-allowed'
                  : 'bg-accent hover:bg-accent-hover active:bg-accent-hover'
              }`}
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Thinking...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Query</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Suggested Query Buttons */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] font-medium text-text-muted mr-1 flex items-center gap-1 select-none">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            Suggestions:
          </span>
          {suggestions.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                onChangeQuery(s);
                onRunQuery(s);
              }}
              disabled={isRunning}
              className="btn-interactive text-xs px-2.5 py-1.5 rounded-lg border text-left border-border-subtle bg-surface-secondary/70 text-text-secondary hover:border-border-strong hover:text-text-primary hover:bg-surface-elevated font-medium shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
