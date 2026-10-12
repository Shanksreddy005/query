import React from 'react';
import { QueryMindLogo } from './QueryMindLogo';
import { Dataset, ApiKeyConfig } from '../types';
import { Key, Sun, Moon, Menu, Upload } from 'lucide-react';

interface HeaderProps {
  activeDataset: Dataset | null;
  onOpenKeyModal: () => void;
  onOpenUploader: () => void;
  onToggleMobileSidebar: () => void;
  apiKeyConfig: ApiKeyConfig;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeDataset,
  onOpenKeyModal,
  onOpenUploader,
  onToggleMobileSidebar,
  apiKeyConfig,
  isDarkMode,
  onToggleDarkMode,
}) => {
  const hasKey = Boolean(apiKeyConfig.key && apiKeyConfig.key.trim().length > 0);

  return (
    <header className="h-16 px-4 sm:px-6 border-b flex items-center justify-between flex-shrink-0 transition-colors duration-fast bg-surface border-border-subtle select-none">
      {/* Left: Mobile hamburger + Brand Logo + Active Dataset Status */}
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-secondary transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          aria-label="Toggle Navigation Drawer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <a href="#" className="flex items-center gap-2 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-lg py-1 px-1.5 -ml-1.5 transition-colors duration-fast">
          <QueryMindLogo size={28} isDarkMode={isDarkMode} variant="horizontal" />
        </a>

        {activeDataset && (
          <>
            <span className="hidden sm:inline-block w-px h-5 bg-border-strong" />
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border bg-surface-secondary border-border-strong text-text-primary shadow-xs">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="font-mono text-[11px] font-medium truncate max-w-[170px]">{activeDataset.name}</span>
              <span className="text-[10px] text-text-muted">({activeDataset.rowCount.toLocaleString()} rows)</span>
            </div>
          </>
        )}
      </div>

      {/* Right: Privacy Indicator, Upload File, BYOK Key pill, Theme Switcher */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Subtle Local Privacy Status Badge */}
        <div
          title="Zero telemetry. Dataset execution operates 100% locally in your browser via DuckDB-WASM."
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border font-medium bg-badge-success-bg text-badge-success-fg border-badge-success-border shadow-2xs"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          <span className="tracking-wide font-semibold">DATA LOCAL</span>
        </div>

        {/* Upload Dataset Button */}
        <button
          type="button"
          onClick={onOpenUploader}
          className="btn-interactive flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border-strong bg-surface-secondary text-text-secondary hover:text-text-primary hover:border-border-strong hover:bg-surface-elevated shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <Upload className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Upload File</span>
        </button>

        {/* BYOK Settings Trigger */}
        <button
          type="button"
          onClick={onOpenKeyModal}
          title="Direct client-side AI provider connection (no proxy)."
          className={`btn-interactive flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
            hasKey
              ? 'border-badge-accent-border bg-badge-accent-bg text-badge-accent-fg font-semibold'
              : 'border-border-strong bg-surface-secondary text-text-secondary hover:text-text-primary hover:border-border-strong hover:bg-surface-elevated'
          }`}
        >
          <Key className={`w-3.5 h-3.5 ${hasKey ? 'text-accent' : 'text-text-muted'}`} />
          <span className="font-mono text-[11px]">
            {hasKey ? `BYOK: ${apiKeyConfig.provider.toUpperCase()}` : 'BYOK Keys'}
          </span>
        </button>

        {/* Dark/Light Mode Switcher */}
        <button
          type="button"
          onClick={onToggleDarkMode}
          className="btn-interactive p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-secondary border border-transparent hover:border-border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          aria-label={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDarkMode ? (
            <Sun className="w-4 h-4 text-warning" />
          ) : (
            <Moon className="w-4 h-4 text-text-secondary" />
          )}
        </button>
      </div>
    </header>
  );
};
