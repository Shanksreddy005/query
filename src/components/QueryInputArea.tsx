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

  const canRun = !isRunning && Boolean(query.trim()) && Boolean(dataset);

  return (
    <div className="w-full space-y-4">
      {/* Hero Welcome state */}
      {!hasRunAnyQuery && (
        <div className="flex flex-col items-center justify-center py-8 sm:py-10 text-center animate-in fade-in duration-300">
          <QueryMindLogo size={44} variant="stacked" isDarkMode={isDarkMode} />
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight mt-5 text-text-primary">
            Talk to your data. Get answers.
          </h2>
          <p className="text-xs sm:text-sm text-text-muted mt-2 max-w-sm leading-relaxed">
            Ask questions in plain English — QueryMind plans, validates, and executes SQL locally in your browser.
          </p>
        </div>
      )}

      {/* Main Query Input Card */}
      <div
        className="rounded-2xl overflow-hidden transition-all duration-fast"
        style={{
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          boxShadow: isDarkMode
            ? '0 1px 2px rgba(0,0,0,0.4), 0 0 0 1px rgba(245,158,11,0)'
            : '0 1px 3px rgba(0,0,0,0.08)',
          outline: 'none',
        }}
        onFocusCapture={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)';
          (e.currentTarget as HTMLDivElement).style.boxShadow = isDarkMode
            ? '0 1px 2px rgba(0,0,0,0.4), 0 0 0 3px rgba(245,158,11,0.15)'
            : '0 1px 3px rgba(0,0,0,0.08), 0 0 0 3px rgba(217,119,6,0.12)';
        }}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
            (e.currentTarget as HTMLDivElement).style.boxShadow = isDarkMode
              ? '0 1px 2px rgba(0,0,0,0.4)'
              : '0 1px 3px rgba(0,0,0,0.08)';
          }
        }}
      >
        {/* Textarea */}
        <div className="p-3.5 sm:p-4" style={{ background: 'var(--surface)' }}>
          <textarea
            ref={textareaRef}
            rows={2}
            value={query}
            onChange={(e) => onChangeQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask a question about ${dataset?.name || 'your dataset'} in plain English…`}
            disabled={isRunning || !dataset}
            className="w-full bg-transparent outline-none resize-none text-sm sm:text-base leading-relaxed font-sans text-text-primary disabled:opacity-50"
            style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
          />
        </div>

        {/* Live Step Progress Display */}
        {isRunning && activeStep && (
          <div
            className="px-4 py-2 flex items-center gap-2 text-xs font-medium"
            style={{
              borderTop: '1px solid var(--border)',
              background: 'rgba(245,158,11,0.08)',
              color: isDarkMode ? '#FCD34D' : '#92400E',
            }}
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" style={{ color: 'var(--accent)' }} />
            <span className="font-semibold flex-shrink-0">{activeStep.title}:</span>
            <span className="truncate opacity-80">{activeStep.detail}</span>
          </div>
        )}

        {/* Card Footer */}
        <div
          className="px-3.5 sm:px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
          style={{
            borderTop: '1px solid var(--border)',
            background: isDarkMode ? 'rgba(30,27,24,0.5)' : 'rgba(237,233,226,0.5)',
          }}
        >
          <div className="flex items-center gap-1.5 text-text-muted font-medium select-none">
            <span className="hidden sm:inline">Press</span>
            <kbd
              className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold"
              style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)' }}
            >
              ⌘ Enter
            </kbd>
            <span className="hidden sm:inline text-text-muted opacity-60">to run</span>
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
              disabled={!canRun}
              className={`btn-accent-gradient flex items-center gap-2 px-4 py-1.5 text-xs sm:text-sm font-semibold focus-visible:outline-none ${
                !canRun ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              style={
                !canRun
                  ? {
                      background: 'var(--surface-secondary)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-muted)',
                      boxShadow: 'none',
                      transform: 'none',
                    }
                  : {}
              }
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Thinking…</span>
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

      {/* Suggested Query Chips */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <span className="text-[11px] font-semibold text-text-muted flex items-center gap-1.5 select-none">
            <Sparkles className="w-3 h-3 text-accent" />
            Try:
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
              className="btn-interactive text-xs px-2.5 py-1.5 rounded-lg text-left font-medium transition-all duration-fast focus-visible:outline-none"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)';
                (e.currentTarget as HTMLButtonElement).style.background = isDarkMode
                  ? 'rgba(245,158,11,0.08)'
                  : 'rgba(217,119,6,0.06)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)';
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
