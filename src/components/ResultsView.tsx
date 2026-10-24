import React, { useState } from 'react';
import { QueryResult } from '../types';
import { DataChart } from './DataChart';
import { ExecutiveBriefing } from './ExecutiveBriefing';

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
  Bookmark,
  BookmarkCheck,
  FileJson,
  BarChart3,
  Presentation,
  Rows,
  SlidersHorizontal,
} from 'lucide-react';
import { LocalQueryStorage } from '../services/localQueryStorage';
import { Dataset } from '../types';

interface ResultsViewProps {
  result: QueryResult;
  isDarkMode: boolean;
  onUpdateSql: (newSql: string) => void;
  onOpenAuditor?: () => void;
  dataset?: Dataset | null;
  isPresentationMode?: boolean;
  onTogglePresentationMode?: () => void;
}

const COLUMN_LABEL_MAP: Record<string, string> = {
  company_name: 'Company',
  support_tickets: 'Support Tickets',
  active_users: 'Active Users',
  mrr: 'MRR',
  lost_or_at_risk_mrr: 'Lost / At-Risk MRR',
  nps_score: 'NPS Score',
  churn_status: 'Churn Status',
  plan_tier: 'Plan Tier',
  customer_id: 'Customer ID',
  customer_name: 'Customer Name',
  order_id: 'Order ID',
  order_date: 'Order Date',
  discount_pct: 'Discount',
  signup_date: 'Signup Date',
  total_mrr: 'Total MRR',
  avg_mrr: 'Avg MRR',
  customer_count: 'Customer Count',
  total_active_users: 'Total Users',
  total_sales: 'Total Sales',
  total_profit: 'Total Profit',
  profit_margin: 'Profit Margin',
  industry: 'Industry',
  region: 'Region',
  category: 'Category',
  product: 'Product',
  quantity: 'Quantity',
  sales: 'Sales',
  profit: 'Profit',
};

function prettifyColumnHeader(col: string): string {
  const lower = col.toLowerCase().trim();
  if (COLUMN_LABEL_MAP[lower]) {
    return COLUMN_LABEL_MAP[lower];
  }
  return col
    .split('_')
    .map((word) => {
      const wLower = word.toLowerCase();
      if (['id', 'mrr', 'nps', 'arr', 'usd', 'ai', 'sql', 'avg'].includes(wLower)) {
        return wLower.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function isNumericValue(val: any): boolean {
  if (val === null || val === undefined || val === '') return false;
  if (typeof val === 'number') return !isNaN(val);
  if (typeof val === 'bigint') return true;
  if (typeof val === 'string' && /^-?\d+(\.\d+)?$/.test(val.trim())) return true;
  return false;
}

function checkColumnIsNumeric(rows: Record<string, any>[], col: string): boolean {
  if (!rows || rows.length === 0) return false;
  const nonNull = rows.map((r) => r[col]).filter((v) => v !== null && v !== undefined && v !== '');
  if (nonNull.length === 0) return false;
  return nonNull.every(isNumericValue);
}

function formatCellValue(val: any, col: string): React.ReactNode {
  if (val === null || val === undefined) {
    return <span className="text-text-muted italic">null</span>;
  }
  if (typeof val === 'boolean') {
    return val ? 'true' : 'false';
  }

  if (isNumericValue(val)) {
    const num = Number(val);
    const colLower = col.toLowerCase();

    // Currency columns: MRR, Sales, Profit, Revenue, etc.
    const isCurrency = /(mrr|sales|profit|revenue|price|amount|cost|spend|lost_or_at_risk_mrr|total_mrr|avg_mrr)/i.test(colLower);
    if (isCurrency) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: num % 1 === 0 ? 0 : 2,
      }).format(num);
    }

    // Percentage columns
    const isPercentage = /(pct|percent|discount_pct|margin)/i.test(colLower);
    if (isPercentage) {
      const pctValue = Math.abs(num) <= 1 ? num * 100 : num;
      return `${pctValue.toFixed(pctValue % 1 === 0 ? 0 : 1)}%`;
    }

    // General numbers (thousands separator, max 2 decimals)
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
    }).format(num);
  }

  return String(val);
}

export const ResultsView: React.FC<ResultsViewProps> = ({
  result,
  isDarkMode,
  onUpdateSql,
  onOpenAuditor,
  dataset,
  isPresentationMode = false,
  onTogglePresentationMode,
}) => {
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [isEditingSql, setIsEditingSql] = useState<boolean>(false);
  const [editedSql, setEditedSql] = useState<string>(result.sql);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [isTraceExpanded, setIsTraceExpanded] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [isChartOpen, setIsChartOpen] = useState<boolean>(() => Boolean(result.chartSuggestion));
  const [tableDensity, setTableDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const pageSize = 10;

  // Identify numeric columns in current result
  const numericCols = React.useMemo(() => {
    return result.columns.filter((c) => checkColumnIsNumeric(result.rows, c));
  }, [result.columns, result.rows]);

  // Compute smart fallback chart suggestion if none was provided by AI
  const activeChartSuggestion = React.useMemo(() => {
    if (result.chartSuggestion) return result.chartSuggestion;
    const catCol =
      result.columns.find((c) => !checkColumnIsNumeric(result.rows, c)) || result.columns[0] || 'entity';
    const numCol = numericCols[0] || result.columns[1] || result.columns[0] || 'value';
    return {
      type: 'horizontal_bar' as const,
      xAxisKey: catCol,
      yAxisKey: numCol,
      title: `${prettifyColumnHeader(numCol)} by ${prettifyColumnHeader(catCol)}`,
    };
  }, [result.chartSuggestion, result.columns, numericCols, result.rows]);

  // Sync state if result changes
  React.useEffect(() => {
    setEditedSql(result.sql);
    setIsEditingSql(false);
    setSearchTerm('');
    setPage(1);
    setIsChartOpen(Boolean(result.chartSuggestion));
  }, [result.id, result.sql, result.chartSuggestion]);

  // Sync saved state with LocalQueryStorage
  React.useEffect(() => {
    const storage = new LocalQueryStorage();
    const cols = dataset?.columns.map((c) => c.name) || result.columns || [];
    setIsSaved(storage.isQuerySaved(result.question, cols));

    const handleUpdate = () => {
      const s = new LocalQueryStorage();
      setIsSaved(s.isQuerySaved(result.question, cols));
    };
    window.addEventListener('querymind_library_updated', handleUpdate);
    return () => window.removeEventListener('querymind_library_updated', handleUpdate);
  }, [result.question, result.columns, dataset]);

  const handleToggleSave = () => {
    const storage = new LocalQueryStorage();
    const cols = dataset?.columns.map((c) => c.name) || result.columns || [];
    if (isSaved) {
      storage.deleteSavedQuery(result.question, storage.getFingerprint(cols));
      setIsSaved(false);
      setSaveFeedback('Removed from Sandboxed Memory');
      setTimeout(() => setSaveFeedback(null), 2500);
    } else {
      const saved = storage.saveSuccessfulQuery(
        result.question,
        cols,
        result.sql,
        {
          datasetName: dataset?.name || 'Custom Dataset',
          rowCount: result.rowCount,
          tableName: dataset?.tableName || 'dataset',
          insightSummary: result.insight?.summary || result.insight?.executive_summary,
        }
      );
      if (saved) {
        setIsSaved(true);
        setSaveFeedback('Saved to Sandboxed Memory!');
        setTimeout(() => setSaveFeedback(null), 2500);
      }
    }
  };

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

  const handleExportJson = () => {
    if (!result.rows || result.rows.length === 0) return;
    const payload = {
      question: result.question,
      sql: result.sql,
      executedAt: new Date().toISOString(),
      rowCount: result.rowCount,
      columns: result.columns,
      rows: result.rows,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `querymind_results_${Date.now()}.json`);
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
    if (isNumericValue(valA) && isNumericValue(valB)) {
      return sortAsc ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
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

  const cardStyle: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    overflow: 'hidden',
  };
  const headerStyle: React.CSSProperties = {
    background: isDarkMode ? 'rgba(30,27,24,0.6)' : 'rgba(237,233,226,0.5)',
    borderBottom: '1px solid var(--border)',
    padding: '10px 16px',
  };
  const cardBg = 'bg-surface border-border-subtle'; // kept for backward compat
  const headerBg = 'bg-surface-secondary/70 border-border-subtle'; // kept for backward compat

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
        Query Matches Request ({passCount} Checks Passed)
      </span>
    );
  };

  return (
    <div className="space-y-4 animate-result-enter pb-12">
      {/* Presentation Mode Status Bar */}
      {isPresentationMode && (
        <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <Presentation className="w-4 h-4 text-accent flex-shrink-0" />
            <div>
              <span className="font-bold text-accent">Executive Presentation View Active</span>
              <p className="text-[11px] text-text-muted mt-0.5">
                Displaying stakeholder briefing, KPIs, visualizations, and data table. SQL source code and technical execution traces are suppressed.
              </p>
            </div>
          </div>
          {onTogglePresentationMode && (
            <button
              type="button"
              onClick={onTogglePresentationMode}
              className="btn-interactive px-2.5 py-1 rounded-lg border border-accent/40 bg-surface text-accent hover:bg-accent/15 font-semibold text-xs transition-colors cursor-pointer flex-shrink-0 ml-3"
            >
              Exit View
            </button>
          )}
        </div>
      )}

      {/* 1. Header Card: User's Question & Verification State */}
      <div style={cardStyle} className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary block mb-1">
              Analytical Request
            </span>
            <h2 className="text-base sm:text-lg font-bold text-text-primary tracking-tight">
              "{result.question}"
            </h2>
          </div>
          <div className="flex-shrink-0 flex items-center gap-2 self-start sm:self-center flex-wrap">
            {renderStatusBadge()}
            {result.sql && (
              <button
                type="button"
                onClick={handleToggleSave}
                className={`btn-interactive flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all duration-fast shadow-2xs cursor-pointer ${
                  isSaved
                    ? 'border-accent/40 bg-accent/15 text-accent hover:bg-accent/25'
                    : 'border-border-strong bg-surface hover:bg-surface-elevated text-text-primary hover:border-accent hover:text-accent'
                }`}
                title={
                  isSaved
                    ? 'Stored in sandboxed memory (Click to remove)'
                    : 'Save this query to sandboxed memory for offline access and export'
                }
              >
                {isSaved ? (
                  <>
                    <BookmarkCheck className="w-3.5 h-3.5 fill-current" />
                    <span>In Memory</span>
                  </>
                ) : (
                  <>
                    <Bookmark className="w-3.5 h-3.5" />
                    <span>Save to Memory</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {saveFeedback && (
          <div className="mt-3 text-xs font-medium text-accent flex items-center gap-1.5 animate-in fade-in">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{saveFeedback}</span>
          </div>
        )}

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

      {/* 2. Interactive Data Visualization / Chart Studio */}
      {isChartOpen && result.rows && result.rows.length > 0 && (
        <DataChart
          data={result.rows}
          suggestion={activeChartSuggestion}
          isDarkMode={isDarkMode}
          availableColumns={result.columns}
          numericColumns={numericCols}
          onClose={() => setIsChartOpen(false)}
          allowCustomize={true}
        />
      )}

      {/* 3. Query Results Data Table (THE PRIMARY ANSWER - Positioned immediately above the fold) */}
      {result.rows && result.rows.length > 0 && (
        <div style={cardStyle}>
          <div style={{...headerStyle, padding: '10px 16px'}} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="section-label" style={{ color: 'var(--text-primary)' }}>
                Query Results
              </span>
              <span className="text-xs font-medium text-text-secondary">
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
                  className="text-xs sm:text-sm pl-8 pr-3 py-1.5 rounded-lg border border-border-strong bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent w-48 transition-all duration-fast shadow-2xs"
                />
              </div>

              {/* Export Data (CSV and JSON) */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={result.rows.length === 0}
                  className="btn-interactive text-xs sm:text-sm px-2.5 py-1.5 rounded-lg border border-border-strong bg-surface text-text-secondary hover:text-text-primary hover:border-border-strong hover:bg-surface-elevated flex items-center gap-1.5 font-medium shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 cursor-pointer disabled:opacity-40"
                  title="Download results table as CSV"
                >
                  <Download className="w-3.5 h-3.5 text-accent" />
                  <span>CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportJson}
                  disabled={result.rows.length === 0}
                  className="btn-interactive text-xs sm:text-sm px-2.5 py-1.5 rounded-lg border border-border-strong bg-surface text-text-secondary hover:text-text-primary hover:border-border-strong hover:bg-surface-elevated flex items-center gap-1.5 font-medium shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 cursor-pointer disabled:opacity-40"
                  title="Download results and metadata as JSON"
                >
                  <FileJson className="w-3.5 h-3.5 text-accent" />
                  <span>JSON</span>
                </button>

                {/* Density Switcher (Comfortable vs Compact) */}
                <button
                  type="button"
                  onClick={() => setTableDensity(tableDensity === 'comfortable' ? 'compact' : 'comfortable')}
                  className="btn-interactive text-xs sm:text-sm px-2.5 py-1.5 rounded-lg border border-border-strong bg-surface text-text-secondary hover:text-text-primary hover:border-accent flex items-center gap-1.5 font-medium shadow-2xs focus-visible:outline-none cursor-pointer"
                  title={`Toggle row density (current: ${tableDensity})`}
                >
                  <Rows className="w-3.5 h-3.5 text-accent" />
                  <span className="hidden sm:inline capitalize">{tableDensity}</span>
                </button>

                {/* Generate / Toggle Chart Button */}
                {result.rows.length > 0 && numericCols.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsChartOpen(!isChartOpen)}
                    className={`btn-interactive text-xs sm:text-sm px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 font-medium shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 cursor-pointer transition-colors ${
                      isChartOpen
                        ? 'bg-accent/15 border-accent/40 text-accent font-semibold'
                        : 'border-border-strong bg-surface text-text-secondary hover:text-text-primary hover:border-accent'
                    }`}
                    title={isChartOpen ? 'Hide the chart visualization' : 'Generate an interactive chart from these results'}
                  >
                    <BarChart3 className="w-3.5 h-3.5 text-accent" />
                    <span>{isChartOpen ? 'Hide Chart' : 'Generate Chart'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Table Content with Zebra Striping and Clean Spacing */}
          <div className="overflow-x-auto max-w-full pb-1">
            {result.rows.length === 0 ? (
              <div className="p-8 text-center text-sm text-text-muted italic">
                Query completed with 0 rows returned.
              </div>
            ) : (
              <table className="w-full text-left text-sm border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-surface-secondary/90 text-text-secondary border-b border-border-subtle select-none">
                    {result.columns.map((col) => {
                      const isNum = checkColumnIsNumeric(result.rows, col);
                      return (
                        <th
                          key={col}
                          onClick={() => handleSort(col)}
                          className={`${
                            tableDensity === 'compact' ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-xs'
                          } font-semibold tracking-tight cursor-pointer hover:text-text-primary transition-colors duration-fast min-w-[120px] max-w-[320px] ${
                            isNum ? 'text-right' : 'text-left'
                          }`}
                        >
                          <div className={`flex items-center gap-1.5 ${isNum ? 'justify-end' : 'justify-start'}`}>
                            <span className="truncate">{prettifyColumnHeader(col)}</span>
                            <ArrowUpDown className="w-3 h-3 opacity-50 flex-shrink-0" />
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
                      className="odd:bg-surface even:bg-surface-secondary/35 hover:bg-accent/8 transition-colors duration-fast group"
                    >
                      {result.columns.map((col) => {
                        const val = row[col];
                        const isNum = checkColumnIsNumeric(result.rows, col);
                        return (
                          <td
                            key={col}
                            className={`${
                              tableDensity === 'compact' ? 'px-3 py-1.5 text-xs' : 'px-4 py-3 text-sm'
                            } text-text-primary border-r border-border-subtle/30 last:border-0 max-w-[340px] truncate ${
                              isNum ? 'font-mono tabular-nums text-right font-medium' : 'font-sans text-left'
                            }`}
                          >
                            {formatCellValue(val, col)}
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
            <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-text-secondary" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-secondary)' }}>
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

      {/* 4. Executive Analytical Briefing (Structured Corporate Grid) */}
      {result.insight && (
        <ExecutiveBriefing
          insightsPayload={result.insight}
          isDarkMode={isDarkMode}
        />
      )}

      {/* 5. Generated SQL Panel (Hidden in Executive Presentation Mode) */}
      {!isPresentationMode && result.sql && (
        <div style={cardStyle}>
          <div style={headerStyle} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="section-label">
                Generated SQL
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-badge-success-bg text-badge-success-fg border border-badge-success-border font-medium shadow-2xs">
                {result.executionTimeMs}ms · In-Memory DuckDB
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleSave}
                className={`btn-interactive text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 font-medium shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 cursor-pointer ${
                  isSaved
                    ? 'border-accent/40 bg-accent/15 text-accent'
                    : 'border-border-strong bg-surface text-text-secondary hover:text-text-primary hover:border-border-strong hover:bg-surface-elevated'
                }`}
                title={isSaved ? 'Blueprint saved in sandboxed memory' : 'Save this SQL blueprint into Sandboxed Memory'}
              >
                {isSaved ? <BookmarkCheck className="w-3.5 h-3.5 fill-current" /> : <Bookmark className="w-3.5 h-3.5" />}
                <span>{isSaved ? 'In Memory' : 'Save Blueprint'}</span>
              </button>

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

      {/* 6. Execution & Validation Details (Hidden in Executive Presentation Mode) */}
      {!isPresentationMode && result.reasoningSteps && result.reasoningSteps.length > 0 && (
        <div style={cardStyle}>
          <button
            type="button"
            onClick={() => setIsTraceExpanded(!isTraceExpanded)}
            className="w-full flex items-center justify-between text-left transition-colors duration-fast hover:bg-surface-secondary/50"
            style={headerStyle}
          >
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-accent" />
              <span className="section-label" style={{ color: 'var(--text-primary)' }}>
                Execution & Validation Trace
              </span>
              {result.passedChecks && result.passedChecks.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface text-text-secondary border border-border-subtle font-mono">
                  {result.passedChecks.length} checks
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
                  <div className="flex items-center justify-between text-xs font-semibold text-text-primary mb-2">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-badge-success-fg" />
                      <span>Request & Integrity Checks:</span>
                    </div>
                    {onOpenAuditor && (
                      <button
                        type="button"
                        onClick={onOpenAuditor}
                        className="text-[11px] font-medium text-accent hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <span>Inspect Outbound Packet</span>
                      </button>
                    )}
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
