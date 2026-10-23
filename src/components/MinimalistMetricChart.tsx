import React from 'react';

interface RowData {
  [key: string]: any;
}

interface ChartProps {
  data: RowData[];
  labelKey: string;
  valueKey: string;
  title?: string;
}

export function MinimalistMetricChart({ data, labelKey, valueKey, title = "Distribution Variance Range" }: ChartProps) {
  const maxVal = Math.max(...data.map(item => Number(item[valueKey]) || 1), 1);

  return (
    <div className="border border-border-subtle bg-surface-secondary/70 p-5 rounded-xl text-text-primary shadow-xs transition-colors duration-fast">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">{title}</h4>
        <span className="text-[10px] font-mono text-text-muted">Top {Math.min(5, data.length)} Rows</span>
      </div>
      
      <div className="space-y-4">
        {data.slice(0, 5).map((row, idx) => {
          const currentVal = Number(row[valueKey]) || 0;
          const percentageWidth = Math.max(0, Math.min(100, (currentVal / maxVal) * 100));

          return (
            <div key={idx} className="space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-text-primary font-sans font-medium truncate max-w-[70%]">{String(row[labelKey])}</span>
                <span className="text-text-secondary font-bold">
                  {currentVal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </span>
              </div>
              
              {/* Ultra-Clean Bar Component Track */}
              <div className="w-full bg-surface h-2 rounded-full overflow-hidden border border-border-subtle">
                <div 
                  className="bg-accent h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${percentageWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
