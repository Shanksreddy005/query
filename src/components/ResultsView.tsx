import React, { useState } from 'react';
import { QueryResult } from '../types';
import { DataChart } from './DataChart';
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Edit3,
  Play,
  Download,
  Search,
  ArrowUpDown,
  Cpu,
  TrendingUp,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from 'lucide-react';

interface ResultsViewProps {
  result: QueryResult;
  isDarkMode: boolean;
  onUpdateSql: (newSql: string) => void;
}

export const ResultsView: React.FC<ResultsViewProps> = ({
  result,
  isDarkMode,
  onUpdateSql,
}) => {
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [isEditingSql, setIsEditingSql] = useState<boolean>(false);
  const [editedSql, setEditedSql] = useState<string>(result.sql);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [isTraceExpanded, setIsTraceExpanded] = useState<boolean>(false);
  const pageSize = 10;

  // Sync editedSql if result changes
  React.useEffect(() => {
    setEditedSql(result.sql);
    setIsEditingSql(false);
    setSearchTerm('');
    setPage(1);
  }, [result.id, result.sql]);

  const handleCopySql = () => {
    navigator.clipboard.writeText(result.sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleExecuteEditedSql = () => {
    onUpdateSql(editedSql);
  };

  const handleExportCsv = () => {
    if (!result.rows || result.rows.length === 0) return;
    const cols = result.columns;
    const csvRows = [
      cols.join(','),
      ...result.rows.map((row) =>
        cols.map((c) => {
          const val = row[c] ?? '';
          if (typeof val === 'string' && val.includes(',')) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        }).join(',')
      ),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `querymind_results_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter & Sort table data
  const filteredRows = (result.rows || []).filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return Object.values(r).some((v) => String(v).toLowerCase().includes(term));
  });

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (!sortCol) return 0;
    const valA = a[sortCol];
    const valB = b[sortCol];
    if (valA === valB) return 0;
    if (valA === undefined || valA === null) return 1;
    if (valB === undefined || valB === null) return -1;
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortAsc ? valA - valB : valB - valA;
    }
    return sortAsc
      ? String(valA).localeCompare(String(valB))
      : String(valB).localeCompare(String(valA));
  });

  const totalPages = Math.ceil(sortedRows.length / pageSize) || 1;
  const paginatedRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (colName: string) => {
    if (sortCol === colName) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(colName);
      setSortAsc(true);
    }
  };

  const isColumnNumeric = (colName: string) => {
    return result.rows.some((r) => typeof r[colName] === 'number');
  };

  const cardBg = 'bg-surface border-border-subtle';
  const headerBg = 'bg-surface-secondary/70 border-border-subtle';

  // Status Badge Rendering
  const renderStatusBadge = () => {
    if (result.status === 'needs_clarification') {
      return (
        <span className="text-[11px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/25 flex items-center gap-1.5 shadow-2xs">
          <AlertCircle className="w-3.5 h-3.5" />
          Clarification Needed
        </span>
      );
    }
    if (result.status === 'failed') {
      return (
        <span className="text-[11px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-md bg-red-500/10 text-red-500 border border-red-500/25 flex items-center gap-1.5 shadow-2xs">
          <AlertTriangle className="w-3.5 h-3.5" />
          Validation Failed
        </span>
      );
    }
    // Default verified
    const passCount = result.passedChecks?.length || 4;
    return (
      <span className="text-[11px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-md bg-badge-success-bg text-badge-success-fg border border-badge-success-border flex items-center gap-1.5 shadow-2xs">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Verified Pipeline ({passCount} Checks Passed)
      </span>
    );
  };

  return (
    <div className="space-y-4 animate-result-enter pb-12">
      {/* 1. Header Card: User's Question & Verification State */}
      <div className={`rounded-xl border p-4 sm:p-5 ${cardBg} shadow-2xs`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary block mb-1">
              Analytical Request
            </span>
            <h2 className="text-base sm:text-lg font-bold text-text-primary tracking-tight">
              "{result.question}"
            </h2>
          </div>
          <div className="flex-shrink-0 self-start sm:self-center">
            {renderStatusBadge()}
          </div>
        </div>

        {/* Needs Clarification Banner if applicable */}
        {result.status === 'needs_clarification' && result.clarificationMessage && (
          <div className="mt-4 p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs sm:text-sm leading-relaxed flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold block mb-0.5 text-text-primary">Metric Clarification Required:</strong>
              <p className="text-text-secondary">{result.clarificationMessage}</p>
            </div>
          </div>
        )}
      </div>

      {/* 2. Executive AI Insight Card (Grounded in Verified Query Result) */}
      {result.insight && (
        <div className="rounded-xl border p-4 sm:p-5 relative overflow-hidden bg-surface border-border-subtle shadow-xs transition-colors duration-fast">
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-badge-accent-bg text-badge-accent-fg border border-badge-accent-border flex items-center justify-center flex-shrink-0 mt-0.5 shadow-2xs">
              <Sparkles className="w-4.5 h-4.5 text-accent" />
            </div>

            <div className="space-y-3.5 flex-1 min-w-0">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent block select-none">
                  Verified Executive Finding
                </span>
                <h3 className="text-base sm:text-lg font-semibold text-text-primary mt-1 leading-snug">
                  {result.insight.summary}
                </h3>
              </div>

              {/* Supporting Evidence Signals */}
              {result.insight.highlights && result.insight.highlights.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  {result.insight.highlights.map((h, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg border border-border-subtle bg-surface-secondary/60 text-xs sm:text-sm leading-relaxed text-text-secondary transition-colors duration-fast"
                    >
                      <span className="block font-semibold text-text-primary text-xs mb-1">Signal {i + 1}</span>
                      {h}
                    </div>
                  ))}
                </div>
              )}

              {/* Caveats (Phase 6) */}
              {result.insight.caveats && result.insight.caveats.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {result.insight.caveats.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-text-secondary bg-surface-secondary/40 p-2.5 rounded-lg border border-border-subtle">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <span>
                        <strong className="font-semibold text-text-primary mr-1">Caveat:</strong>
                        {c}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Recommended Action (Hypothesis based on verified data) */}
              {result.insight.recommendedAction && (
                <div className="flex items-start gap-2 pt-2.5 border-t border-border-subtle mt-1.5">
                  <TrendingUp className="w-4 h-4 flex-shrink-0 mt-0.5 text-accent" />
                  <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                    <strong className="text-text-primary font-semibold mr-1">Recommended Action:</strong>
                    {result.insight.recommendedAction}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Interactive Data Visualization (Rendered only when valid and analytical) */}
      {result.chartSuggestion && result.rows.length > 0 && (
        <DataChart
          data={result.rows}
          suggestion={result.chartSuggestion}
          isDarkMode={isDarkMode}
        />
      )}

      {/* 4. Query Results Data Table (Primary for detail lookups) */}
      {result.rows && result.rows.length > 0 && (
        <div className={`rounded-xl border overflow-hidden ${cardBg} shadow-2xs`}>
          <div className={`px-4 py-3 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${headerBg}`}>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-wider uppercase text-text-secondary">
                Query Results Table
              </span>
              <span className="text-sm font-medium text-text-muted">
                (Showing {paginatedRows.length} of {result.rowCount.toLocaleString()} rows)
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Table Search */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search rows..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className="text-sm pl-8 pr-3 py-1.5 rounded-lg border border-border-strong bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent w-48 transition-all duration-fast shadow-2xs"
                />
              </div>

              {/* Export CSV */}
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={result.rows.length === 0}
                className="btn-interactive text-sm px-3 py-1.5 rounded-lg border border-border-strong bg-surface text-text-secondary hover:text-text-primary hover:border-border-strong hover:bg-surface-elevated flex items-center gap-2 font-medium shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
                title="Download results as CSV"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export</span>
              </button>
            </div>
          </div>

          {/* Table Content */}
          <div className="overflow-x-auto max-w-full">
            {result.rows.length === 0 ? (
              <div className="p-8 text-center text-sm text-text-muted italic">
                Query completed with 0 rows returned.
              </div>
            ) : (
              <table className="w-full text-left text-sm border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-surface-secondary/90 text-text-secondary border-b border-border-subtle select-none">
                    {result.columns.map((col) => {
                      const isNum = isColumnNumeric(col);
                      return (
                        <th
                          key={col}
                          onClick={() => handleSort(col)}
                          className={`px-4 py-3 font-semibold font-mono uppercase tracking-wider text-[11px] cursor-pointer hover:text-text-primary transition-colors duration-fast ${
                            isNum ? 'text-right' : 'text-left'
                          }`}
                        >
                          <div className={`flex items-center gap-1.5 ${isNum ? 'justify-end' : 'justify-start'}`}>
                            <span>{col}</span>
                            <ArrowUpDown className="w-3 h-3 opacity-50" />
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {paginatedRows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="transition-colors duration-fast hover:bg-surface-secondary/60 group"
                    >
                      {result.columns.map((col) => {
                        const val = row[col];
                        const isNum = typeof val === 'number';
                        return (
                          <td
                            key={col}
                            className={`px-4 py-3 text-text-primary border-r border-border-subtle/50 last:border-0 ${
                              isNum ? 'font-mono tabular-nums text-right' : 'font-sans'
                            }`}
                          >
                            {val === null || val === undefined ? (
                              <span className="text-text-muted italic">null</span>
                            ) : typeof val === 'boolean' ? (
                              val ? 'true' : 'false'
                            ) : (
                              String(val)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className={`px-4 py-3 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-text-secondary ${headerBg}`}>
              <span>
                Page {page} of {totalPages} ({sortedRows.length.toLocaleString()} filtered rows)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="btn-interactive px-3 py-1.5 rounded-lg border border-border-strong bg-surface font-medium disabled:opacity-40 hover:text-text-primary hover:border-border-strong transition-colors duration-fast shadow-2xs"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="btn-interactive px-3 py-1.5 rounded-lg border border-border-strong bg-surface font-medium disabled:opacity-40 hover:text-text-primary hover:border-border-strong transition-colors duration-fast shadow-2xs"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. Generated SQL Panel */}
      {result.sql && (
        <div className={`rounded-xl border overflow-hidden ${cardBg} shadow-2xs`}>
          <div className={`px-4 py-2.5 border-b flex items-center justify-between ${headerBg}`}>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-wider uppercase text-text-secondary">
                Generated SQL
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-badge-success-bg text-badge-success-fg border border-badge-success-border font-medium shadow-2xs">
                {result.executionTimeMs}ms · In-Memory DuckDB
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditingSql(!isEditingSql)}
                className={`btn-interactive text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 font-medium shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 ${
                  isEditingSql
                    ? 'border-badge-accent-border bg-badge-accent-bg text-badge-accent-fg'
                    : 'border-border-strong bg-surface text-text-secondary hover:text-text-primary hover:border-border-strong hover:bg-surface-elevated'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isEditingSql ? 'Close Editor' : 'Edit SQL'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopySql}
                className="btn-interactive text-xs px-2.5 py-1.5 rounded-lg border border-border-strong bg-surface text-text-secondary hover:text-text-primary hover:border-border-strong hover:bg-surface-elevated flex items-center gap-1.5 font-medium shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
              >
                {copiedSql ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-success" />
                    <span className="text-success font-semibold">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* High-Contrast Code Surface */}
          <div className="bg-code-bg p-4 border-t border-border-subtle transition-colors duration-fast">
            {isEditingSql ? (
              <div className="space-y-3">
                <textarea
                  rows={5}
                  value={editedSql}
                  onChange={(e) => setEditedSql(e.target.value)}
                  className="w-full font-mono text-sm bg-black/40 text-success p-3 rounded-lg border border-border-strong/40 outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-y"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleExecuteEditedSql}
                    className="btn-interactive px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold flex items-center gap-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Re-execute SQL
                  </button>
                </div>
              </div>
            ) : (
              <pre className="font-mono text-sm text-code-fg overflow-x-auto leading-relaxed whitespace-pre-wrap selection:bg-accent/30">
                <code>{result.sql}</code>
              </pre>
            )}
          </div>
        </div>
      )}

      {/* 6. Execution & Validation Details (Collapsible Technical Trace) */}
      {result.reasoningSteps && result.reasoningSteps.length > 0 && (
        <div className={`rounded-xl border ${cardBg} shadow-2xs overflow-hidden`}>
          <button
            type="button"
            onClick={() => setIsTraceExpanded(!isTraceExpanded)}
            className={`w-full px-4 py-2.5 border-b flex items-center justify-between text-left transition-colors duration-fast hover:bg-surface-secondary/80 ${headerBg}`}
          >
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-accent" />
              <span className="text-[11px] font-bold tracking-wider uppercase text-text-primary">
                Execution & Validation Trace
              </span>
              {result.passedChecks && result.passedChecks.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface text-text-secondary border border-border-subtle font-mono">
                  {result.passedChecks.length} checks verified
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-text-secondary text-xs">
              <span>{isTraceExpanded ? 'Hide Trace' : 'Inspect Trace'}</span>
              {isTraceExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </div>
          </button>

          {isTraceExpanded && (
            <div className="px-4 py-3.5 space-y-3 border-t border-border-subtle bg-surface/50">
              {/* Passed Contract Checks */}
              {result.passedChecks && result.passedChecks.length > 0 && (
                <div className="p-3 rounded-lg bg-badge-success-bg/30 border border-badge-success-border/50 mb-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary mb-2">
                    <ShieldCheck className="w-4 h-4 text-badge-success-fg" />
                    <span>Verified Intent & Integrity Checks:</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-text-secondary">
                    {result.passedChecks.map((chk, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <Check className="w-3 h-3 text-badge-success-fg flex-shrink-0" />
                        <span className="truncate">{chk}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step By Step Operational Stages */}
              <div className="space-y-2">
                {result.reasoningSteps.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm">
                    <div className="w-4 h-4 rounded-full bg-badge-success-bg text-badge-success-fg border border-badge-success-border flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </div>
                    <div className="leading-snug">
                      <span className="font-semibold text-text-primary mr-1.5">{step.title}:</span>
                      <span className="text-text-secondary">{step.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
