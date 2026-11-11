export interface ColumnMeta {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'unknown';
  sampleValues: any[];
  uniqueCount: number;
  min?: number | string;
  max?: number | string;
  nullable: boolean;
}

export interface Dataset {
  id: string;
  name: string;
  tableName: string;
  rowCount: number;
  columns: ColumnMeta[];
  data: Record<string, any>[];
  fileSizeFormatted?: string;
  uploadedAt: string;
}

export interface ReasoningStep {
  title: string;
  detail: string;
  status: 'waiting' | 'running' | 'done' | 'error';
  timestamp?: number;
}

export type QueryExecutionStatus =
  | 'planning'
  | 'validating_sql'
  | 'executing'
  | 'validating_result'
  | 'verified'
  | 'needs_clarification'
  | 'failed';

export interface ValidationCheck {
  name: string;
  description: string;
  passed: boolean;
  details?: string;
}

export interface ChartSuggestion {
  type: 'bar' | 'horizontal_bar' | 'line' | 'donut' | 'area';
  xAxisKey: string;
  yAxisKey: string;
  title: string;
  categoryLabel?: string;
  metricLabel?: string;
  metricUnit?: string;
  isAggregated?: boolean;
  description?: string;
  /** Optional: prefix for axis/label values e.g. '$' */
  valuePrefix?: string;
  /** Optional: suffix for axis/label values e.g. 'K' or '%' */
  valueSuffix?: string;
  /** Optional: 0-based index of the bar/segment to highlight in amber */
  highlightIndex?: number;
}

export interface KpiCallout {
  label: string;
  value: string;
  delta?: string;
  direction?: 'up' | 'down' | 'neutral';
  context?: string;
}

export type AnalyticalCategory =
  | 'simple_count'
  | 'total_sum'
  | 'statistical_aggregation'
  | 'grouped_comparison'
  | 'ranking_top_n'
  | 'filtering_retrieval'
  | 'time_trend'
  | 'segmentation'
  | 'multi_metric'
  | 'data_quality'
  | 'operational_risk'
  | 'customer_concentration'
  | 'revenue_concentration'
  | 'multi_query_executive'
  | 'unsupported_request';

export interface KeyFinding {
  finding: string;
  evidence?: string;
  importance?: 'low' | 'medium' | 'high';
}

export interface AnomalyObservation {
  observation: string;
  evidence?: string;
  severity?: 'low' | 'medium' | 'high';
  type?: 'data_quality' | 'statistical' | 'operational';
}

export interface BusinessImplication {
  implication: string;
  evidence?: string;
  confidence?: 'low' | 'medium' | 'high';
}

export interface RecommendedAction {
  action: string;
  evidence?: string;
  issue?: string;
  recommendation?: string;
  metric_to_monitor?: string;
  reason?: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface QueryInsight {
  status?: 'verified' | 'success' | 'empty' | 'error' | 'needs_clarification';
  category?: AnalyticalCategory;
  /** Primary concise evidence-first executive overview */
  overview?: string;
  /** Tight 1-sentence quantitative executive summary */
  executive_summary?: string;
  /** @deprecated use executive_summary / overview */
  summary?: string;

  /** Structured and string-array key findings */
  key_findings?: KeyFinding[];
  /** 2-4 KPI stat cards with actual data values */
  kpi_callouts?: KpiCallout[];
  /** Factual data findings with specific numbers */
  findings?: string[];
  /** @deprecated use findings */
  highlights?: string[];

  /** Traceable anomalies and data quality issues */
  anomalies?: (AnomalyObservation | string)[];
  critical_anomalies?: string[];

  /** Risk or limitation observations */
  risks?: string[];
  /** Traceable business implications */
  business_implications?: (BusinessImplication | string)[];
  caveats?: string[];

  /** Comparative performance breakdown between categories */
  performance_comparison?: string[];

  /** Concrete recommended actions */
  recommended_actions?: RecommendedAction[];
  recommended_action?: string;
  recommendedAction?: string;
  strategic_experiments?: string[];

  /** Analytical limitations and scope constraints */
  limitations?: string[];
}

export interface QueryResult {
  id: string;
  question: string;
  sql: string;
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  executionTimeMs: number;
  reasoningSteps: ReasoningStep[];
  status?: QueryExecutionStatus;
  passedChecks?: string[];
  clarificationMessage?: string;
  insight?: QueryInsight;
  chartSuggestion?: ChartSuggestion;
  error?: string;
  timestamp: string;
}

export interface OutOfScopeData {
  question: string;
  reason: string;
  suggestedQuestions?: string[];
}

export type AiProvider = 'gemini' | 'groq' | 'openai';

export interface ApiKeyConfig {
  provider: AiProvider;
  key: string;
  model: string;
  useEnvKey?: boolean;
  rememberKey?: boolean;
}

export interface HistoryItem {
  id: string;
  question: string;
  sql: string;
  datasetName: string;
  rowCount: number;
  timestamp: string;
}
