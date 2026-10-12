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
}

export interface QueryInsight {
  summary: string;
  highlights: string[];
  caveats?: string[];
  recommendedAction?: string;
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
}

export interface HistoryItem {
  id: string;
  question: string;
  sql: string;
  datasetName: string;
  rowCount: number;
  timestamp: string;
}
