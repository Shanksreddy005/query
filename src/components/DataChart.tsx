import React, { useState } from 'react';
import { ChartSuggestion } from '../types';

interface DataChartProps {
  data: Record<string, any>[];
  suggestion: ChartSuggestion;
  isDarkMode: boolean;
}

// Colorblind-conscious, restrained palette matching dark and light theme contrast
const LIGHT_PALETTE = [
  '#5B4BE8', // Brand violet
  '#2563EB', // Blue
  '#0D9488', // Teal
  '#D97706', // Amber
  '#7C3AED', // Deep violet
  '#E11D48', // Rose
  '#059669', // Emerald
  '#4B5565', // Graphite slate
];

const DARK_PALETTE = [
  '#8B7FF5', // Soft violet
  '#60A5FA', // Sky/blue
  '#2DD4BF', // Teal
  '#FBBF24', // Amber
  '#A78BFA', // Violet
  '#FB7185', // Rose
  '#34D399', // Emerald
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

export const DataChart: React.FC<DataChartProps> = ({ data, suggestion, isDarkMode }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) return null;

  const palette = isDarkMode ? DARK_PALETTE : LIGHT_PALETTE;

  // Extract keys safely
  const xKey =
    Object.keys(data[0]).find((k) => k.toLowerCase() === (suggestion.xAxisKey || '').toLowerCase()) ||
    suggestion.xAxisKey ||
    Object.keys(data[0])[0];

  const yKey =
    Object.keys(data[0]).find((k) => k.toLowerCase() === (suggestion.yAxisKey || '').toLowerCase()) ||
    suggestion.yAxisKey ||
    Object.keys(data[0]).find((k) => typeof data[0][k] === 'number') ||
    Object.keys(data[0])[1];

  // For donut and aggregated charts, aggregate any duplicate labels so legend never repeats categories
  let chartData: { label: string; value: number; count: number }[] = [];

  if (suggestion.type === 'donut' || suggestion.isAggregated) {
    const aggMap = new Map<string, { value: number; count: number }>();
    for (const d of data) {
      const label = String(d[xKey] ?? 'Unknown');
      const val = Number(d[yKey]) || 0;
      const prev = aggMap.get(label) || { value: 0, count: 0 };
      aggMap.set(label, { value: prev.value + val, count: prev.count + 1 });
    }
    chartData = Array.from(aggMap.entries()).map(([label, { value, count }]) => ({
      label,
      value,
      count,
    }));
  } else {
    // Preserve entity rows (e.g. ranked companies or products), taking up to top 10
    chartData = data.slice(0, 10).map((d) => ({
      label: String(d[xKey] ?? 'Unknown'),
      value: Number(d[yKey]) || 0,
      count: 1,
    }));
  }

  const maxValue = Math.max(...chartData.map((d) => d.value), 1);
  const totalValue = chartData.reduce((acc, curr) => acc + Math.max(0, curr.value), 0);

  const isLineOrArea = suggestion.type === 'line' || suggestion.type === 'area';
  const isDonut = suggestion.type === 'donut';

  const typeLabel = suggestion.type === 'horizontal_bar' ? 'BAR' : suggestion.type.toUpperCase();

  return (
    <div className="p-4 sm:p-5 rounded-xl border transition-colors duration-fast bg-surface border-border-subtle shadow-2xs animate-chart-enter">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-semibold text-text-primary">
            {suggestion.title || `${yKey} by ${xKey}`}
          </h4>
          <p className="text-xs text-text-secondary mt-0.5">
            {isDonut
              ? `Showing ${chartData.length} unique ${suggestion.categoryLabel || xKey} segments`
              : `Showing ${chartData.length} ${chartData.length === 1 ? 'record' : 'records'}`}
          </p>
        </div>
        <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-badge-accent-bg text-badge-accent-fg font-semibold border border-badge-accent-border shadow-2xs">
          {typeLabel}
        </span>
      </div>

      {isDonut ? (
        // Donut Chart View (Guaranteed unique categories & exact percentage breakdown)
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 py-2">
          <div className="relative w-44 h-44 flex-shrink-0">
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
              <span className="text-xs text-text-secondary truncate max-w-[110px]">
                {hoveredIdx !== null ? chartData[hoveredIdx].label : 'Total'}
              </span>
              <span className="text-sm font-bold font-mono text-text-primary mt-0.5">
                {hoveredIdx !== null ? formatVal(chartData[hoveredIdx].value) : formatVal(totalValue)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
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
      ) : isLineOrArea ? (
        // Line / Area Trend Chart
        <div className="pt-2 pb-1">
          <div className="h-44 w-full relative">
            <svg viewBox="0 0 400 120" className="w-full h-full overflow-visible">
              {/* Grid lines */}
              <line x1="0" y1="20" x2="400" y2="20" stroke="currentColor" strokeDasharray="3 3" className="opacity-10 text-border-strong" />
              <line x1="0" y1="60" x2="400" y2="60" stroke="currentColor" strokeDasharray="3 3" className="opacity-10 text-border-strong" />
              <line x1="0" y1="100" x2="400" y2="100" stroke="currentColor" strokeDasharray="3 3" className="opacity-10 text-border-strong" />

              {/* Line path */}
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
                    <path d={areaD} fill="currentColor" className="text-accent opacity-15" />
                    <path d={pathD} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent" />
                    {points.map((p, i) => (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={hoveredIdx === i ? 5 : 3.5}
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
            <span>{chartData[0]?.label}</span>
            {hoveredIdx !== null && (
              <span className="font-mono text-accent font-semibold">
                {chartData[hoveredIdx].label}: {formatVal(chartData[hoveredIdx].value)}
              </span>
            )}
            <span>{chartData[chartData.length - 1]?.label}</span>
          </div>
        </div>
      ) : (
        // Horizontal Bar Chart View (Preferred for ranked entities and category comparisons)
        <div className="space-y-3 pt-2">
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
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span
                    className={`truncate max-w-[260px] font-medium transition-colors duration-fast ${
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
                <div className="h-2 w-full rounded-full overflow-hidden bg-surface-secondary">
                  <div
                    className="h-full rounded-full transition-all duration-300 ease-out bg-accent"
                    style={{
                      width: `${widthPct}%`,
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
