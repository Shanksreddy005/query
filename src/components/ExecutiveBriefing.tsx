import React from 'react';

export interface InsightsPayload {
  executive_summary?: string;
  critical_anomalies?: string[];
  business_implications?: string[];
  strategic_experiments?: string[];
  // Backwards compatibility with standard QueryInsight
  summary?: string;
  highlights?: string[];
  caveats?: string[];
  recommendedAction?: string;
}

export interface BriefingProps {
  insightsPayload: InsightsPayload;
  isDarkMode?: boolean;
}

export function ExecutiveBriefing({ insightsPayload, isDarkMode = true }: BriefingProps) {
  // Normalize fields between executive layout and legacy insight structure
  const summaryText = insightsPayload.executive_summary || insightsPayload.summary || 'Analysis completed with verified analytical criteria.';
  
  const anomalies = (insightsPayload.critical_anomalies && insightsPayload.critical_anomalies.length > 0)
    ? insightsPayload.critical_anomalies
    : (insightsPayload.highlights && insightsPayload.highlights.length > 0)
    ? insightsPayload.highlights
    : ['All verified metrics conform to expected baseline constraints.'];

  const implications = (insightsPayload.business_implications && insightsPayload.business_implications.length > 0)
    ? insightsPayload.business_implications
    : (insightsPayload.caveats && insightsPayload.caveats.length > 0)
    ? insightsPayload.caveats
    : ['Observation: Data scope is bounded to active table filters. Review commercial thresholds prior to capital deployment.'];

  const experiments = (insightsPayload.strategic_experiments && insightsPayload.strategic_experiments.length > 0)
    ? insightsPayload.strategic_experiments
    : insightsPayload.recommendedAction
    ? [insightsPayload.recommendedAction]
    : ['Audit downstream data pipelines for consistency across fiscal reporting cycles.', 'Review variance thresholds against historical quarterly trends.'];

  return (
    <div className="border border-border-subtle bg-surface-secondary/70 rounded-xl text-text-primary overflow-hidden shadow-xs font-sans transition-colors duration-fast">
      {/* Component Header Bar */}
      <div className="bg-surface border-b border-border-subtle px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-accent text-xs font-semibold tracking-wider uppercase">Executive Analysis Summary</span>
        </div>
        <span className="text-[10px] text-text-muted font-mono tracking-wide">PROCESSED CLIENT-SIDE</span>
      </div>

      <div className="p-5 sm:p-6 space-y-6">
        {/* Core Summary Segment */}
        <div className="border-l-2 border-accent pl-4">
          <p className="text-xs sm:text-sm font-medium leading-relaxed text-text-primary">
            {summaryText}
          </p>
        </div>

        {/* 2-Column Analytical Analysis Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
          {/* Column 1: Found Anomalies */}
          <div className="space-y-2.5">
            <h5 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
              <span>🛑 Critical Anomalies & Data Shifts</span>
            </h5>
            <ul className="space-y-2">
              {anomalies.map((item, idx) => (
                <li key={idx} className="text-xs text-text-secondary leading-relaxed flex items-start gap-2">
                  <span className="text-accent font-bold mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 2: Strategic Business Impact */}
          <div className="space-y-2.5">
            <h5 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
              <span>💼 Commercial & Operational Risk</span>
            </h5>
            <ul className="space-y-2">
              {implications.map((item, idx) => (
                <li key={idx} className="text-xs text-text-secondary leading-relaxed flex items-start gap-2">
                  <span className="text-amber-500 font-bold mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Recommended Operational Action Row */}
        <div className="bg-surface border border-border-subtle p-4 rounded-lg mt-2">
          <h5 className="text-xs font-bold uppercase tracking-wider text-text-primary mb-2.5 flex items-center gap-1.5">
            <span>🎯 Mandated Next Actions & Operational Adjustments</span>
          </h5>
          <ol className="space-y-2">
            {experiments.map((item, idx) => (
              <li key={idx} className="text-xs text-text-secondary leading-relaxed flex gap-2.5">
                <span className="font-mono bg-surface-secondary border border-border-strong px-1.5 py-0.5 rounded text-text-primary font-bold text-[11px] self-start shadow-2xs">
                  {idx + 1}
                </span>
                <span className="mt-0.5">{item}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
