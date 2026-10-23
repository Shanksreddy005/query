import React from 'react';
import { Dataset, HistoryItem } from '../types';
import { Table, Clock, ShieldCheck, ChevronRight, Hash, Type, Calendar, ToggleLeft, X } from 'lucide-react';
import { PREBUILT_DATASETS } from '../services/sampleData';
import { QueryMindLogo } from './QueryMindLogo';
import { StorageControlPanel } from './StorageControlPanel';


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
    <div
      className="flex flex-col h-full overflow-hidden select-none"
      style={{ background: 'var(--surface)' }}
    >
      {/* Mobile Close Button Header */}
      <div
        className="lg:hidden flex items-center justify-between p-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <a href="#" className="flex items-center gap-2">
          <QueryMindLogo size={22} isDarkMode={isDarkMode} variant="horizontal" />
        </a>
        <button
          onClick={onCloseMobile}
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-secondary transition-colors duration-fast"
          aria-label="Close Sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-5">
        {/* Active Dataset Overview */}
        {dataset && (
          <div>
            <div className="section-label mb-2 flex items-center justify-between">
              <span>Active Table</span>
              <span style={{ color: 'var(--success)', fontSize: '10px', fontWeight: 500 }}>
                {dataset.rowCount.toLocaleString()} rows
              </span>
            </div>

            <div
              className="p-3 rounded-xl"
              style={{
                background: isDarkMode
                  ? 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(30,27,24,0.6) 100%)'
                  : 'linear-gradient(135deg, rgba(245,158,11,0.07) 0%, rgba(245,243,239,0.8) 100%)',
                border: '1px solid rgba(245,158,11,0.2)',
              }}
            >
              <div className="flex items-center gap-2 font-medium text-xs truncate">
                <Table className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                <span className="font-mono text-xs font-semibold text-text-primary">{dataset.tableName}</span>
              </div>
              <p className="text-[11px] text-text-muted mt-1 truncate">{dataset.name}</p>
            </div>
          </div>
        )}

        {/* Dynamic Schema Explorer */}
        {dataset && dataset.columns.length > 0 && (
          <div>
            <div className="section-label mb-2 flex items-center justify-between">
              <span>Columns ({dataset.columns.length})</span>
              <span className="text-[10px] text-text-muted font-medium normal-case">Click to insert</span>
            </div>

            <div className="space-y-0.5">
              {dataset.columns.map((col) => (
                <div
                  key={col.name}
                  onClick={() => onInsertColumn(col.name)}
                  title={`Type: ${col.type}\nSamples: ${col.sampleValues.slice(0, 3).join(', ')}`}
                  className="group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono cursor-pointer transition-colors duration-fast hover:bg-surface-secondary text-text-secondary hover:text-text-primary focus-visible:outline-none"
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
                  <span
                    className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded-md tracking-wide flex-shrink-0"
                    style={{
                      background: 'var(--surface-secondary)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {col.type.slice(0, 3)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Preloaded Demo Datasets */}
        <div>
          <div className="section-label mb-2">Demo Datasets</div>
          <div className="space-y-1.5">
            {[
              {
                id: 'customers',
                onClick: () => onSelectDataset(PREBUILT_DATASETS.saas.dataset),
                label: 'SaaS Customer MRR',
                sub: '25 rows · Subscriptions & Churn',
                active: dataset?.id === 'customers',
              },
              {
                id: 'orders',
                onClick: () => onSelectDataset(PREBUILT_DATASETS.ecommerce.dataset),
                label: 'E-Commerce Orders',
                sub: '15 rows · Sales & Profitability',
                active: dataset?.id === 'orders',
              },
            ].map((ds) => (
              <button
                key={ds.id}
                type="button"
                onClick={ds.onClick}
                className="btn-interactive w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between transition-all duration-fast focus-visible:outline-none"
                style={
                  ds.active
                    ? {
                        background: 'rgba(245,158,11,0.1)',
                        border: '1px solid rgba(245,158,11,0.3)',
                        color: isDarkMode ? '#FCD34D' : '#92400E',
                      }
                    : {
                        background: 'var(--surface-secondary)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-secondary)',
                      }
                }
              >
                <div className="truncate">
                  <span className="block font-semibold">{ds.label}</span>
                  <span className="text-[10px] opacity-60 font-normal">{ds.sub}</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 opacity-40 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Recent Query History */}
        <div>
          <div className="section-label mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Recent Queries
            </span>
            {history.length > 0 && (
              <button
                type="button"
                onClick={onClearHistory}
                className="text-[10px] text-text-muted hover:text-error transition-colors duration-fast focus-visible:outline-none normal-case font-normal"
                title="Clear query history"
              >
                Clear
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <p className="text-[11px] text-text-muted italic px-1">No queries yet.</p>
          ) : (
            <div className="space-y-0.5">
              {history.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelectHistoryQuery(item.question)}
                  className="btn-interactive w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors duration-fast truncate block hover:bg-surface-secondary text-text-secondary hover:text-text-primary focus-visible:outline-none"
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

        {/* Storage Panel */}
        <div className="pt-1">
          <StorageControlPanel isDarkMode={isDarkMode} />
        </div>
      </div>

      {/* Footer */}
      <div
        className="p-3.5 text-xs flex-shrink-0"
        style={{
          borderTop: '1px solid var(--border)',
          background: isDarkMode ? 'rgba(30,27,24,0.7)' : 'rgba(237,233,226,0.6)',
        }}
      >
        <div className="flex items-center gap-2 font-medium mb-1" style={{ color: 'var(--success)' }}>
          <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="font-semibold text-[11px] tracking-wide">Local Engine Active</span>
        </div>
        <p className="text-[11px] text-text-muted leading-relaxed">
          Zero telemetry · In-memory DuckDB
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Static Sidebar */}
      <aside
        className="hidden lg:flex w-60 flex-col flex-shrink-0 transition-colors duration-fast"
        style={{ borderRight: '1px solid var(--border)', background: 'var(--surface)' }}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {isOpenMobile && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-standard"
            onClick={onCloseMobile}
          />
          <aside
            className="relative w-72 max-w-[80vw] h-full shadow-2xl flex flex-col z-10 transition-colors duration-fast"
            style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}
          >
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};
