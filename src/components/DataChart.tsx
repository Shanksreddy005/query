import React, { useState, useId, useRef } from 'react';
import { ChartSuggestion } from '../types';
import {
  BarChart3,
  PieChart,
  TrendingUp,
  Download,
  Settings2,
  X,
  AlignLeft,
  Activity,
  Layers,
} from 'lucide-react';

interface DataChartProps {
  data: Record<string, any>[];
  suggestion: ChartSuggestion;
  isDarkMode: boolean;
  availableColumns?: string[];
  numericColumns?: string[];
  onClose?: () => void;
  allowCustomize?: boolean;
}

const LIGHT_PALETTE = [
  '#D97706', // Amber
  '#0284C7', // Sky
  '#059669', // Emerald
  '#7C3AED', // Violet
  '#E11D48', // Rose
  '#EA580C', // Orange
  '#4F46E5', // Indigo
  '#475569', // Slate
];

const DARK_PALETTE = [
  '#F59E0B', // Amber
  '#38BDF8', // Sky
  '#34D399', // Emerald
  '#A78BFA', // Violet
  '#FB7185', // Rose
  '#FB923C', // Orange
  '#818CF8', // Indigo
  '#94A3B8', // Slate
];

function formatVal(val: any): string {
  if (val === undefined || val === null) return '-';
  if (typeof val === 'number') {
    if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
    if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
    if (Number.isInteger(val)) return val.toLocaleString();
    return val.toFixed(1);
  }
  return String(val);
}

export const DataChart: React.FC<DataChartProps> = ({
  data,
  suggestion,
  isDarkMode,
  availableColumns,
  numericColumns,
  onClose,
  allowCustomize = true,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [showConfig, setShowConfig] = useState<boolean>(false);

  // User-modifiable chart properties
  const [chartType, setChartType] = useState<
    'horizontal_bar' | 'bar' | 'donut' | 'line' | 'area'
  >(suggestion.type || 'horizontal_bar');

  // Available column keys
  const allCols = availableColumns || (data.length > 0 ? Object.keys(data[0]) : []);
  const numCols =
    numericColumns ||
    (data.length > 0
      ? Object.keys(data[0]).filter((k) => typeof data[0][k] === 'number')
      : []);

  const [xKey, setXKey] = useState<string>(() => {
    return (
      allCols.find((k) => k.toLowerCase() === (suggestion.xAxisKey || '').toLowerCase()) ||
      suggestion.xAxisKey ||
      allCols[0] ||
      ''
    );
  });

  const [yKey, setYKey] = useState<string>(() => {
    return (
      numCols.find((k) => k.toLowerCase() === (suggestion.yAxisKey || '').toLowerCase()) ||
      suggestion.yAxisKey ||
      numCols[0] ||
      allCols[1] ||
      ''
    );
  });

  const [aggMethod, setAggMethod] = useState<'sum' | 'avg' | 'count'>('sum');

  if (!data || data.length === 0) return null;

  const palette = isDarkMode ? DARK_PALETTE : LIGHT_PALETTE;

  // Process and aggregate data
  const aggMap = new Map<string, { sum: number; count: number; raw: any }>();
  for (const d of data) {
    const label = String(d[xKey] ?? 'Unknown');
    const val = Number(d[yKey]) || 0;
    const prev = aggMap.get(label) || { sum: 0, count: 0, raw: d };
    aggMap.set(label, { sum: prev.sum + val, count: prev.count + 1, raw: d });
  }

  // Build chartData based on aggregation
  let chartData: { label: string; value: number; count: number }[] = [];
  if (chartType === 'donut' || aggMap.size < data.length) {
    chartData = Array.from(aggMap.entries()).map(([label, { sum, count }]) => {
      let finalVal = sum;
      if (aggMethod === 'avg' && count > 0) finalVal = sum / count;
      if (aggMethod === 'count') finalVal = count;
      return { label, value: finalVal, count };
    });
  } else {
    chartData = data.slice(0, 12).map((d) => ({
      label: String(d[xKey] ?? 'Unknown'),
      value: Number(d[yKey]) || 0,
      count: 1,
    }));
  }

  // Sort descending by value for bars/donuts, keep order for line/time
  if (chartType === 'horizontal_bar' || chartType === 'bar' || chartType === 'donut') {
    chartData.sort((a, b) => b.value - a.value);
  }

  // Limit to 12 items for readability
  chartData = chartData.slice(0, 12);

  const maxValue = Math.max(...chartData.map((d) => d.value), 1);
  const totalValue = chartData.reduce((acc, curr) => acc + Math.max(0, curr.value), 0);

  const isLine = chartType === 'line';
  const isArea = chartType === 'area';
  const isDonut = chartType === 'donut';
  const isColBar = chartType === 'bar';
  const isHBar = chartType === 'horizontal_bar';

  // Export SVG handler
  const handleDownloadSvg = () => {
    const svgEl = chartContainerRef.current?.querySelector('svg');
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `querymind_chart_${Date.now()}.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      ref={chartContainerRef}
      className="p-4 sm:p-5 rounded-xl border transition-colors duration-fast bg-surface border-border-subtle shadow-2xs animate-chart-enter"
    >
      {/* Top Header & Chart Studio Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-border-subtle">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-text-primary">
              {suggestion.title || `${yKey} by ${xKey}`}
            </h4>
            {aggMap.size < data.length && (
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-surface-secondary text-text-muted border border-border-subtle">
                Aggregated ({aggMethod.toUpperCase()})
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            {chartData.length} {chartData.length === 1 ? 'data point' : 'data points'} · {yKey} vs {xKey}
          </p>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Chart Type Selector Pills */}
          <div className="flex items-center p-0.5 rounded-lg bg-surface-secondary border border-border-subtle">
            <button
              type="button"
              onClick={() => setChartType('horizontal_bar')}
              className={`p-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                isHBar ? 'bg-surface text-accent shadow-2xs' : 'text-text-muted hover:text-text-primary'
              }`}
              title="Horizontal Bar Chart"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setChartType('bar')}
              className={`p-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                isColBar ? 'bg-surface text-accent shadow-2xs' : 'text-text-muted hover:text-text-primary'
              }`}
              title="Vertical Column Bar Chart"
            >
              <BarChart3 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setChartType('donut')}
              className={`p-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                isDonut ? 'bg-surface text-accent shadow-2xs' : 'text-text-muted hover:text-text-primary'
              }`}
              title="Donut / Composition Chart"
            >
              <PieChart className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setChartType('line')}
              className={`p-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                isLine ? 'bg-surface text-accent shadow-2xs' : 'text-text-muted hover:text-text-primary'
              }`}
              title="Line Trend Chart"
            >
              <TrendingUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setChartType('area')}
              className={`p-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                isArea ? 'bg-surface text-accent shadow-2xs' : 'text-text-muted hover:text-text-primary'
              }`}
              title="Area Trend Chart"
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
          </div>

          {allowCustomize && (
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className={`p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                showConfig
                  ? 'bg-accent/15 border-accent/40 text-accent'
                  : 'bg-surface border-border-strong text-text-secondary hover:text-text-primary hover:border-accent'
              }`}
              title="Customize Axes and Aggregation"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Customize</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDownloadSvg}
            className="p-1.5 rounded-lg border border-border-strong bg-surface hover:bg-surface-elevated text-text-secondary hover:text-accent transition-colors cursor-pointer"
            title="Download Chart as SVG"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border border-border-strong bg-surface hover:bg-surface-elevated text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              title="Close Visualizer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Expandable Axis / Aggregation Customization Toolbar */}
      {showConfig && allowCustomize && (
        <div className="p-3 mb-4 rounded-lg bg-surface-secondary/70 border border-border-subtle grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in">
          <div>
            <label className="block text-[10px] font-semibold text-text-muted uppercase mb-1">
              Dimension (Label / X-Axis)
            </label>
            <select
              value={xKey}
              onChange={(e) => setXKey(e.target.value)}
              className="w-full text-xs font-medium px-2 py-1.5 rounded-md border border-border-strong bg-surface text-text-primary focus:outline-none focus:border-accent"
            >
              {allCols.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-text-muted uppercase mb-1">
              Metric (Value / Y-Axis)
            </label>
            <select
              value={yKey}
              onChange={(e) => setYKey(e.target.value)}
              className="w-full text-xs font-medium px-2 py-1.5 rounded-md border border-border-strong bg-surface text-text-primary focus:outline-none focus:border-accent"
            >
              {numCols.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-text-muted uppercase mb-1">
              Aggregation Method
            </label>
            <select
              value={aggMethod}
              onChange={(e) => setAggMethod(e.target.value as any)}
              className="w-full text-xs font-medium px-2 py-1.5 rounded-md border border-border-strong bg-surface text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="sum">SUM (Total Value)</option>
              <option value="avg">AVG (Average Value)</option>
              <option value="count">COUNT (Number of Records)</option>
            </select>
          </div>
        </div>
      )}

      {/* Render Chart View by Selected Type */}
      {isDonut ? (
        // Donut / Ring Chart View
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 py-2">
          <div className="relative w-48 h-48 flex-shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
              {(() => {
                let accumulatedPercent = 0;
                return chartData.map((d, i) => {
                  const percent = totalValue > 0 ? Math.max(0, d.value) / totalValue : 0;
                  const strokeDasharray = `${percent * 283} 283`;
                  const strokeDashoffset = `-${accumulatedPercent * 283}`;
                  accumulatedPercent += percent;
                  const color = palette[i % palette.length];
                  const isHovered = hoveredIdx === i;

                  return (
                    <circle
                      key={i}
                      cx="50"
                      cy="50"
                      r="45"
                      fill="transparent"
                      stroke={color}
                      strokeWidth={isHovered ? '13' : '10'}
                      strokeDasharray={strokeDasharray}
                      strokeDashoffset={strokeDashoffset}
                      className="transition-all duration-fast cursor-pointer"
                      onMouseEnter={() => setHoveredIdx(i)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    />
                  );
                });
              })()}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center p-2">
              <span className="text-xs text-text-secondary truncate max-w-[120px]">
                {hoveredIdx !== null ? chartData[hoveredIdx].label : 'Total'}
              </span>
              <span className="text-sm font-bold font-mono text-text-primary mt-0.5">
                {hoveredIdx !== null ? formatVal(chartData[hoveredIdx].value) : formatVal(totalValue)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs max-h-48 overflow-y-auto w-full max-w-md">
            {chartData.map((d, i) => {
              const pct = totalValue > 0 ? ((Math.max(0, d.value) / totalValue) * 100).toFixed(1) : '0';
              return (
                <div
                  key={i}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition-colors duration-fast ${
                    hoveredIdx === i ? 'bg-surface-secondary' : 'hover:bg-surface-secondary/50'
                  }`}
                  title={`${d.label}: ${formatVal(d.value)} (${pct}%)`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: palette[i % palette.length] }}
                  />
                  <span className="truncate max-w-[110px] text-text-secondary">{d.label}</span>
                  <div className="font-mono ml-auto text-right flex items-center gap-1.5">
                    <span className="text-[10px] text-text-muted">{pct}%</span>
                    <span className="font-semibold text-text-primary">{formatVal(d.value)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : isLine || isArea ? (
        // Line / Area Trend Chart
        <div className="pt-2 pb-1">
          <div className="h-48 w-full relative">
            <svg viewBox="0 0 400 120" className="w-full h-full overflow-visible">
              <line
                x1="0"
                y1="20"
                x2="400"
                y2="20"
                stroke="currentColor"
                strokeDasharray="3 3"
                className="opacity-10 text-border-strong"
              />
              <line
                x1="0"
                y1="60"
                x2="400"
                y2="60"
                stroke="currentColor"
                strokeDasharray="3 3"
                className="opacity-10 text-border-strong"
              />
              <line
                x1="0"
                y1="100"
                x2="400"
                y2="100"
                stroke="currentColor"
                strokeDasharray="3 3"
                className="opacity-10 text-border-strong"
              />

              {(() => {
                if (chartData.length === 0) return null;
                const points = chartData.map((d, i) => {
                  const x = chartData.length > 1 ? (i / (chartData.length - 1)) * 380 + 10 : 200;
                  const y = 100 - (Math.max(0, d.value) / maxValue) * 80;
                  return { x, y, ...d };
                });

                const pathD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '');
                const areaD = `${pathD} L ${points[points.length - 1].x} 110 L ${points[0].x} 110 Z`;

                return (
                  <>
                    {isArea && (
                      <path d={areaD} fill="currentColor" className="text-accent opacity-20" />
                    )}
                    <path
                      d={pathD}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className="text-accent"
                    />
                    {points.map((p, i) => (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={hoveredIdx === i ? 5.5 : 3.5}
                        fill={hoveredIdx === i ? palette[0] : '#fff'}
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-accent cursor-pointer transition-all"
                        onMouseEnter={() => setHoveredIdx(i)}
                        onMouseLeave={() => setHoveredIdx(null)}
                      />
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>

          <div className="flex justify-between items-center text-[11px] text-text-muted pt-2 border-t border-border-subtle">
            <span className="truncate max-w-[120px]">{chartData[0]?.label}</span>
            {hoveredIdx !== null && (
              <span className="font-mono text-accent font-semibold">
                {chartData[hoveredIdx].label}: {formatVal(chartData[hoveredIdx].value)}
              </span>
            )}
            <span className="truncate max-w-[120px] text-right">
              {chartData[chartData.length - 1]?.label}
            </span>
          </div>
        </div>
      ) : isColBar ? (
        // Vertical Column Bar Chart
        <div className="pt-2">
          <div className="h-48 w-full flex items-end justify-between gap-2 px-2 pb-1 border-b border-border-subtle">
            {chartData.map((d, i) => {
              const heightPct = Math.max(6, Math.min(100, (d.value / maxValue) * 100));
              const isHovered = hoveredIdx === i;

              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center justify-end h-full cursor-pointer group"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  <span
                    className={`text-[10px] font-mono mb-1 transition-opacity ${
                      isHovered ? 'text-accent font-bold opacity-100' : 'text-text-muted opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {formatVal(d.value)}
                  </span>
                  <div
                    className="w-full rounded-t-md transition-all duration-300 ease-out bg-accent"
                    style={{
                      height: `${heightPct}%`,
                      opacity: isHovered ? 1 : 0.85,
                      backgroundColor: palette[i % palette.length],
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between items-center text-[10px] text-text-muted pt-2 overflow-x-auto gap-2">
            {chartData.map((d, i) => (
              <div
                key={i}
                className={`flex-1 text-center truncate ${hoveredIdx === i ? 'text-accent font-semibold' : ''}`}
                title={d.label}
              >
                {d.label}
              </div>
            ))}
          </div>
        </div>
      ) : (
        // Horizontal Bar Chart View
        <div className="space-y-2.5 pt-2">
          {chartData.map((d, i) => {
            const widthPct = Math.max(3, Math.min(100, (d.value / maxValue) * 100));
            const isHovered = hoveredIdx === i;
            const pct = totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(1) : '0';

            return (
              <div
                key={i}
                className="group cursor-pointer select-none"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                title={`${d.label}: ${formatVal(d.value)} (${pct}% of total)`}
              >
                <div className="flex justify-between items-center text-xs mb-1">
                  <span
                    className={`truncate max-w-[280px] font-medium transition-colors duration-fast ${
                      isHovered ? 'text-accent font-semibold' : 'text-text-primary'
                    }`}
                  >
                    {d.label}
                  </span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-[10px] text-text-muted">{pct}% share</span>
                    <span
                      className={`text-[11px] transition-colors duration-fast ${
                        isHovered ? 'text-accent font-semibold' : 'text-text-primary font-medium'
                      }`}
                    >
                      {formatVal(d.value)}
                    </span>
                  </div>
                </div>
                <div className="h-2.5 w-full rounded-full overflow-hidden bg-surface-secondary">
                  <div
                    className="h-full rounded-full transition-all duration-300 ease-out"
                    style={{
                      width: `${widthPct}%`,
                      backgroundColor: palette[i % palette.length],
                      opacity: isHovered ? 1 : 0.85,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
