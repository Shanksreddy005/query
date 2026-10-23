import React from 'react';
import { QueryMindLogo } from './QueryMindLogo';
import { Dataset, ApiKeyConfig } from '../types';
import { Key, Sun, Moon, Menu, Upload, ShieldCheck } from 'lucide-react';

interface HeaderProps {
  activeDataset: Dataset | null;
  onOpenKeyModal: () => void;
  onOpenUploader: () => void;
  onOpenAuditor?: () => void;
  onToggleMobileSidebar: () => void;
  apiKeyConfig: ApiKeyConfig;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeDataset,
  onOpenKeyModal,
  onOpenUploader,
  onOpenAuditor,
  onToggleMobileSidebar,
  apiKeyConfig,
  isDarkMode,
  onToggleDarkMode,
}) => {
  const hasKey = Boolean(apiKeyConfig.key && apiKeyConfig.key.trim().length > 0);

  return (
    <header
      className="h-14 px-4 sm:px-6 flex items-center justify-between flex-shrink-0 select-none transition-colors"
      style={{
        borderBottom: '1px solid var(--border)',
        background: isDarkMode
          ? 'linear-gradient(to right, rgba(22,20,18,0.98), rgba(30,27,24,0.95))'
          : 'linear-gradient(to right, rgba(253,252,251,0.98), rgba(245,243,239,0.95))',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* Left: Mobile hamburger + Brand Logo + Active Dataset Status */}
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-secondary transition-colors duration-fast focus-visible:outline-none"
          aria-label="Toggle Navigation Drawer"
        >
          <Menu className="w-4 h-4" />
        </button>

        <a href="#" className="flex items-center gap-2 group focus-visible:outline-none rounded-lg py-1 px-1.5 -ml-1.5 transition-colors duration-fast">
          <QueryMindLogo size={26} isDarkMode={isDarkMode} variant="horizontal" />
        </a>

        {activeDataset && (
          <>
            <span className="hidden sm:inline-block w-px h-4 bg-border-strong opacity-60" />
            <div
              className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                background: isDarkMode ? 'rgba(52,211,153,0.08)' : 'rgba(4,120,87,0.08)',
                border: '1px solid rgba(52,211,153,0.2)',
                color: isDarkMode ? '#6EE7B7' : '#065F46',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse flex-shrink-0" />
              <span className="font-mono text-[11px] font-medium truncate max-w-[160px]">{activeDataset.name}</span>
              <span className="text-[10px] opacity-60">({activeDataset.rowCount.toLocaleString()} rows)</span>
            </div>
          </>
        )}
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Privacy Badge */}
        <button
          type="button"
          onClick={onOpenAuditor}
          title="Zero telemetry. Click to inspect outbound network packets."
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer transition-all duration-fast focus-visible:outline-none"
          style={{
            background: isDarkMode ? 'rgba(52,211,153,0.08)' : 'rgba(4,120,87,0.08)',
            border: '1px solid rgba(52,211,153,0.2)',
            color: isDarkMode ? '#6EE7B7' : '#065F46',
          }}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span className="tracking-wider">DATA LOCAL</span>
        </button>

        {/* Upload Button */}
        <button
          type="button"
          onClick={onOpenUploader}
          className="btn-interactive flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary transition-colors duration-fast focus-visible:outline-none"
          style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-secondary)' }}
        >
          <Upload className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Upload</span>
        </button>

        {/* BYOK Key */}
        <button
          type="button"
          onClick={onOpenKeyModal}
          title="Direct client-side AI provider connection."
          className="btn-interactive flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors duration-fast focus-visible:outline-none"
          style={
            hasKey
              ? {
                  background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  color: isDarkMode ? '#FCD34D' : '#92400E',
                }
              : {
                  border: '1px solid var(--border-strong)',
                  background: 'var(--surface-secondary)',
                  color: 'var(--text-secondary)',
                }
          }
        >
          <Key className={`w-3.5 h-3.5 ${hasKey ? 'text-warning' : 'text-text-muted'}`} />
          <span className="font-mono text-[11px]">
            {hasKey ? `${apiKeyConfig.provider.toUpperCase()}` : 'BYOK'}
          </span>
        </button>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={onToggleDarkMode}
          className="btn-interactive p-1.5 rounded-lg text-text-muted hover:text-text-primary transition-colors duration-fast focus-visible:outline-none"
          style={{ border: '1px solid var(--border)' }}
          aria-label={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDarkMode ? (
            <Sun className="w-4 h-4 text-warning" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
      </div>
    </header>
  );
};
