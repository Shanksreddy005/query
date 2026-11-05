import React from 'react';
import {
  AnalyticalCategory,
  AnomalyObservation,
  BusinessImplication,
  KeyFinding,
  QueryInsight,
  RecommendedAction,
} from '../types';

export interface InsightsPayload extends Partial<QueryInsight> {
  executive_summary?: string;
  critical_anomalies?: string[];
  business_implications?: (BusinessImplication | string)[];
  strategic_experiments?: string[];
  // Backwards compatibility with standard QueryInsight
  summary?: string;
  highlights?: string[];
  caveats?: string[];
  recommendedAction?: string;
  performance_comparison?: string[];
}

export interface BriefingProps {
  insightsPayload: InsightsPayload;
  isDarkMode?: boolean;
}

// Banned generic boilerplates that must NEVER be rendered in QueryMind summaries
const BANNED_BOILERPLATES: RegExp[] = [
  /audit downstream data pipelines/i,
  /review commercial thresholds prior to capital deployment/i,
  /review variance thresholds against historical quarterly trends/i,
  /all verified metrics conform to expected baseline constraints/i,
  /data scope is bounded to active table filters/i,
  /prior to capital deployment/i,
  /fiscal reporting cycles/i,
];

function isCleanText(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  return !BANNED_BOILERPLATES.some((regex) => regex.test(text));
}

export function ExecutiveBriefing({ insightsPayload, isDarkMode = true }: BriefingProps) {
  // 1. Primary Overview Text
  const rawSummary =
    insightsPayload.overview ||
    insightsPayload.executive_summary ||
    insightsPayload.summary ||
    '';
  const summaryText = isCleanText(rawSummary) ? rawSummary : 'Analytical query execution verified against local dataset.';

  // 2. Key Findings: only ground-truth findings from data
  let rawFindings: string[] = [];
  if (insightsPayload.key_findings && insightsPayload.key_findings.length > 0) {
    rawFindings = insightsPayload.key_findings.map((f) => f.finding);
  } else if (insightsPayload.findings && insightsPayload.findings.length > 0) {
    rawFindings = insightsPayload.findings;
  } else if (insightsPayload.highlights && insightsPayload.highlights.length > 0) {
    rawFindings = insightsPayload.highlights;
  }
  const findings = rawFindings.filter(isCleanText);

  // 3. Performance Comparison: comparative breakdown across categories
  const rawComparisons = insightsPayload.performance_comparison || [];
  const comparisons = rawComparisons.filter(isCleanText);

  // 4. Anomalies: only verified data issues (NEVER default to static boilerplate or highlights)
  let rawAnomalies: string[] = [];
  if (insightsPayload.anomalies && insightsPayload.anomalies.length > 0) {
    rawAnomalies = insightsPayload.anomalies.map((a) => (typeof a === 'string' ? a : a.observation));
  } else if (insightsPayload.critical_anomalies && insightsPayload.critical_anomalies.length > 0) {
    rawAnomalies = insightsPayload.critical_anomalies;
  }
  const anomalies = rawAnomalies.filter(isCleanText);

  // 5. Business Implications: grounded observations only
  let rawImplications: string[] = [];
  if (insightsPayload.business_implications && insightsPayload.business_implications.length > 0) {
    rawImplications = insightsPayload.business_implications.map((i) =>
      typeof i === 'string' ? i : i.implication
    );
  } else if (insightsPayload.caveats && insightsPayload.caveats.length > 0) {
    rawImplications = insightsPayload.caveats;
  } else if (insightsPayload.risks && insightsPayload.risks.length > 0) {
    rawImplications = insightsPayload.risks;
  }
  const implications = rawImplications.filter(isCleanText);

  // 6. Recommended Actions: strictly optional and context-aware
  let rawActions: string[] = [];
  if (insightsPayload.recommended_actions && insightsPayload.recommended_actions.length > 0) {
    rawActions = insightsPayload.recommended_actions.map((a) => a.action);
  } else if (insightsPayload.strategic_experiments && insightsPayload.strategic_experiments.length > 0) {
    rawActions = insightsPayload.strategic_experiments;
  } else if (insightsPayload.recommendedAction) {
    rawActions = [insightsPayload.recommendedAction];
  } else if (insightsPayload.recommended_action) {
    rawActions = [insightsPayload.recommended_action];
  }
  const actions = rawActions.filter(isCleanText);

  // 7. Limitations: analytical boundaries
  const limitations = (insightsPayload.limitations || []).filter(isCleanText);

  const hasFindings = findings.length > 0;
  const hasComparisons = comparisons.length > 0;
  const hasAnomalies = anomalies.length > 0;
  const hasImplications = implications.length > 0;
  const hasActions = actions.length > 0;
  const hasLimitations = limitations.length > 0;

  return (
    <div className="border border-border-subtle bg-surface-secondary/70 rounded-xl text-text-primary overflow-hidden shadow-xs font-sans transition-colors duration-fast">
      {/* Component Header Bar */}
      <div className="bg-surface border-b border-border-subtle px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-accent text-xs font-semibold tracking-wider uppercase">Executive Analysis Summary</span>
          {insightsPayload.category && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface-secondary border border-border-strong text-text-secondary uppercase">
              {insightsPayload.category.replace(/_/g, ' ')}
            </span>
          )}
        </div>
        <span className="text-[10px] text-text-muted font-mono tracking-wide">EVIDENCE GROUNDED · CLIENT-SIDE</span>
      </div>

      <div className="p-5 sm:p-6 space-y-5">
        {/* Core Summary Overview */}
        <div className="border-l-2 border-accent pl-4 py-0.5">
          <p className="text-xs sm:text-sm font-medium leading-relaxed text-text-primary">
            {summaryText}
          </p>
        </div>

        {/* Key Findings List (adaptive: displayed only when verified findings exist) */}
        {hasFindings && (
          <div className="space-y-2 pt-1">
            <h5 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
              <span>📊 Key Findings</span>
            </h5>
            <ul className="space-y-1.5">
              {findings.map((item, idx) => (
                <li key={idx} className="text-xs text-text-secondary leading-relaxed flex items-start gap-2">
                  <span className="text-accent font-bold mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Performance Comparison (adaptive: displayed when comparative breakdown exists) */}
        {hasComparisons && (
          <div className="space-y-2 pt-1 bg-surface/40 border border-border-subtle p-3.5 rounded-lg">
            <h5 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
              <span>⚖️ Performance Comparison</span>
            </h5>
            <ul className="space-y-1.5">
              {comparisons.map((item, idx) => (
                <li key={idx} className="text-xs text-text-secondary leading-relaxed flex items-start gap-2">
                  <span className="text-accent font-bold mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 2-Column Grid for Anomalies and Implications (omitted if both are empty) */}
        {(hasAnomalies || hasImplications) && (
          <div className={`grid grid-cols-1 ${hasAnomalies && hasImplications ? 'md:grid-cols-2' : ''} gap-5 pt-1`}>
            {/* Column 1: Found Anomalies (omitted if none found) */}
            {hasAnomalies && (
              <div className="space-y-2 bg-surface/50 border border-border-subtle p-3.5 rounded-lg">
                <h5 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                  <span>🛑 Anomalies & Data Quality</span>
                </h5>
                <ul className="space-y-1.5">
                  {anomalies.map((item, idx) => (
                    <li key={idx} className="text-xs text-text-secondary leading-relaxed flex items-start gap-2">
                      <span className="text-rose-400 font-bold mt-0.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Column 2: Business Implications (omitted if none found) */}
            {hasImplications && (
              <div className="space-y-2 bg-surface/50 border border-border-subtle p-3.5 rounded-lg">
                <h5 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <span>💼 Business Implications</span>
                </h5>
                <ul className="space-y-1.5">
                  {implications.map((item, idx) => (
                    <li key={idx} className="text-xs text-text-secondary leading-relaxed flex items-start gap-2">
                      <span className="text-amber-400 font-bold mt-0.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Recommended Actions Row (strictly omitted when 0 actions exist) */}
        {hasActions && (
          <div className="bg-surface border border-border-subtle p-4 rounded-lg mt-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-text-primary mb-2 flex items-center gap-1.5">
              <span>🎯 Recommended Next Actions</span>
            </h5>
            <ol className="space-y-2">
              {actions.map((item, idx) => (
                <li key={idx} className="text-xs text-text-secondary leading-relaxed flex gap-2.5">
                  <span className="font-mono bg-surface-secondary border border-border-strong px-1.5 py-0.5 rounded text-text-primary font-bold text-[11px] self-start shadow-2xs">
                    {idx + 1}
                  </span>
                  <span className="mt-0.5">{item}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Analytical Limitations Row (strictly omitted when none exist) */}
        {hasLimitations && (
          <div className="text-[11px] text-text-muted border-t border-border-subtle/50 pt-3 flex items-start gap-1.5">
            <span className="font-semibold text-text-secondary">Limitations:</span>
            <span>{limitations.join(' ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
