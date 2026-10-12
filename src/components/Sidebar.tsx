import React from 'react';
import { Dataset, HistoryItem } from '../types';
import { Table, Clock, ShieldCheck, ChevronRight, Hash, Type, Calendar, ToggleLeft, X } from 'lucide-react';
import { PREBUILT_DATASETS } from '../services/sampleData';
import { QueryMindLogo } from './QueryMindLogo';

interface SidebarProps {
  dataset: Dataset | null;
  onSelectDataset: (dataset: Dataset) => void;
  onSelectHistoryQuery: (query: string) => void;
  history: HistoryItem[];
  onClearHistory: () => void;
  isDarkMode: boolean;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onInsertColumn: (colName: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  dataset,
  onSelectDataset,
  onSelectHistoryQuery,
  history,
  onClearHistory,
  isDarkMode,
  isOpenMobile,
  onCloseMobile,
  onInsertColumn,
}) => {
  const getColIcon = (type: string) => {
    switch (type) {
      case 'number':
        return <Hash className="w-3 h-3 text-info" />;
      case 'date':
        return <Calendar className="w-3 h-3 text-warning" />;
      case 'boolean':
        return <ToggleLeft className="w-3 h-3 text-accent" />;
      default:
        return <Type className="w-3 h-3 text-text-muted group-hover:text-text-primary transition-colors duration-fast" />;
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full overflow-hidden select-none bg-surface">
      {/* Mobile Close Button Header */}
      <div className="lg:hidden flex items-center justify-between p-4 border-b border-border-subtle flex-shrink-0">
        <a href="#" className="flex items-center gap-2">
          <QueryMindLogo size={24} isDarkMode={isDarkMode} variant="horizontal" />
        </a>
        <button
          onClick={onCloseMobile}
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-secondary transition-colors duration-fast"
          aria-label="Close Sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* Active Dataset Overview */}
        {dataset && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2 flex items-center justify-between">
              <span>Active Table</span>
              <span className="font-mono text-success text-[11px] font-medium">{dataset.rowCount.toLocaleString()} rows</span>
            </div>

            <div className="p-3 rounded-xl border border-border-subtle bg-surface-secondary/70 transition-colors duration-fast">
              <div className="flex items-center gap-2 font-medium text-xs truncate">
                <Table className="w-4 h-4 text-accent flex-shrink-0" />
                <span className="font-mono text-xs font-semibold text-text-primary">{dataset.tableName}</span>
              </div>
              <p className="text-[11px] text-text-secondary mt-1 truncate">{dataset.name}</p>
            </div>
          </div>
        )}

        {/* Dynamic Schema Explorer */}
        {dataset && dataset.columns.length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2 flex items-center justify-between">
              <span>Columns ({dataset.columns.length})</span>
              <span className="text-[10px] text-text-muted">Click to add</span>
            </div>

            <div className="space-y-1">
              {dataset.columns.map((col) => (
                <div
                  key={col.name}
                  onClick={() => onInsertColumn(col.name)}
                  title={`Type: ${col.type}\nSamples: ${col.sampleValues.slice(0, 3).join(', ')}`}
                  className="group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono cursor-pointer transition-colors duration-fast hover:bg-surface-secondary text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onInsertColumn(col.name);
                    }
                  }}
                >
                  <div className="flex items-center gap-2 truncate">
                    {getColIcon(col.type)}
                    <span className="truncate group-hover:text-text-primary transition-colors duration-fast">{col.name}</span>
                  </div>
                  <span className="text-[10px] text-text-muted uppercase font-sans tracking-wide">{col.type.slice(0, 3)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Preloaded Demo Datasets Switcher */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">
            Demo Datasets
          </div>
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => onSelectDataset(PREBUILT_DATASETS.saas.dataset)}
              className={`btn-interactive w-full text-left px-3 py-2 rounded-xl text-xs font-medium border flex items-center justify-between shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                dataset?.id === 'customers'
                  ? 'border-badge-accent-border bg-badge-accent-bg text-badge-accent-fg font-semibold'
                  : 'border-border-subtle bg-surface-secondary text-text-secondary hover:border-border-strong hover:text-text-primary hover:bg-surface-elevated'
              }`}
            >
              <div className="truncate">
                <span className="block font-semibold">SaaS Customer MRR</span>
                <span className="text-[10px] text-text-muted font-normal">25 rows · Subscriptions & Churn</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => onSelectDataset(PREBUILT_DATASETS.ecommerce.dataset)}
              className={`btn-interactive w-full text-left px-3 py-2 rounded-xl text-xs font-medium border flex items-center justify-between shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                dataset?.id === 'orders'
                  ? 'border-badge-accent-border bg-badge-accent-bg text-badge-accent-fg font-semibold'
                  : 'border-border-subtle bg-surface-secondary text-text-secondary hover:border-border-strong hover:text-text-primary hover:bg-surface-elevated'
              }`}
            >
              <div className="truncate">
                <span className="block font-semibold">E-Commerce Orders</span>
                <span className="text-[10px] text-text-muted font-normal">15 rows · Sales & Profitability</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
            </button>
          </div>
        </div>

        {/* Recent Query History */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Recent Queries
            </span>
            {history.length > 0 && (
              <button
                type="button"
                onClick={onClearHistory}
                className="text-[10px] text-text-muted hover:text-error transition-colors duration-fast focus-visible:outline-none"
                title="Clear query history"
              >
                Clear
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <p className="text-[11px] text-text-muted italic px-1">No recent queries yet.</p>
          ) : (
            <div className="space-y-1">
              {history.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelectHistoryQuery(item.question)}
                  className="btn-interactive w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors duration-fast truncate block hover:bg-surface-secondary text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
                  title={item.question}
                >
                  <span className="truncate block font-medium">{item.question}</span>
                  <span className="text-[10px] text-text-muted font-mono">
                    {item.rowCount} rows · {item.timestamp}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Local Privacy Footer */}
      <div className="p-4 border-t border-border-subtle text-xs bg-surface-secondary/70 flex-shrink-0">
        <div className="flex items-center gap-2 text-success font-medium mb-1">
          <ShieldCheck className="w-4 h-4 flex-shrink-0" />
          <span className="font-semibold text-[11px] tracking-wide">Local Engine Active</span>
        </div>
        <p className="text-[11px] text-text-muted leading-relaxed">
          In-memory DuckDB execution ensures zero telemetry or dataset uploading.
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Static Sidebar (260px) */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-border-subtle bg-surface flex-shrink-0 transition-colors duration-fast">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {isOpenMobile && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-standard"
            onClick={onCloseMobile}
          />
          <aside className="relative w-72 max-w-[80vw] h-full shadow-2xl flex flex-col z-10 transition-colors duration-fast bg-surface border-r border-border-subtle">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};
