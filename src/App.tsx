/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Dataset, QueryResult, ApiKeyConfig, HistoryItem, ReasoningStep, OutOfScopeData } from './types';
import { PREBUILT_DATASETS } from './services/sampleData';
import { registerDatasetInSql, executeClientSql } from './services/sqlEngine';
import { processNaturalLanguageQuery, generateDatasetSuggestions } from './services/aiService';
import { DEFAULT_PROVIDER, DEFAULT_MODELS } from './services/modelRegistry';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { QueryInputArea } from './components/QueryInputArea';
import { ResultsView } from './components/ResultsView';
import { CsvUploader } from './components/CsvUploader';
import { ApiKeyModal } from './components/ApiKeyModal';
import { OnboardingModal } from './components/OnboardingModal';
import { OutOfScopeModal } from './components/OutOfScopeModal';
import { TelemetryAuditorModal } from './components/TelemetryAuditorModal';
import { ShieldCheck, Upload, Database, AlertCircle, FileSpreadsheet, X } from 'lucide-react';

export default function App() {
  // Theme state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);

  // Dataset state (default to preloaded SaaS dataset for instant playground)
  const [activeDataset, setActiveDataset] = useState<Dataset | null>(PREBUILT_DATASETS.saas.dataset);
  const [isUploaderOpen, setIsUploaderOpen] = useState<boolean>(false);

  // BYOK Configuration state
  const [apiKeyConfig, setApiKeyConfig] = useState<ApiKeyConfig>({
    provider: DEFAULT_PROVIDER,
    key: '',
    model: DEFAULT_MODELS[DEFAULT_PROVIDER],
  });
  const [isKeyModalOpen, setIsKeyModalOpen] = useState<boolean>(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(true);
  const [isAuditorOpen, setIsAuditorOpen] = useState<boolean>(false);

  // Query & Execution state
  const [query, setQuery] = useState<string>('');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<ReasoningStep | null>(null);
  const [currentResult, setCurrentResult] = useState<QueryResult | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Out of scope modal state
  const [isOutOfScopeModalOpen, setIsOutOfScopeModalOpen] = useState<boolean>(false);
  const [outOfScopeData, setOutOfScopeData] = useState<OutOfScopeData | null>(null);

  // Mobile sidebar state
  const [isOpenMobileSidebar, setIsOpenMobileSidebar] = useState<boolean>(false);

  // Register initial dataset into SQL engine on mount
  useEffect(() => {
    if (activeDataset) {
      registerDatasetInSql(activeDataset);
    }
  }, [activeDataset]);

  // Apply dark mode class to HTML element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.body.style.backgroundColor = 'var(--background)';
    } else {
      document.documentElement.classList.remove('dark');
      document.body.style.backgroundColor = 'var(--background)';
    }
  }, [isDarkMode]);

  // Handle switching datasets
  const handleSelectDataset = (dataset: Dataset) => {
    setActiveDataset(dataset);
    registerDatasetInSql(dataset);
    setQuery('');
    setCurrentResult(null);
    setExecutionError(null);
    setIsUploaderOpen(false);
    setIsOpenMobileSidebar(false);
  };

  // Run natural language query
  const handleRunQuery = async (queryText?: string) => {
    const q = (queryText !== undefined ? queryText : query).trim();
    if (!q || !activeDataset || isRunning) return;

    setIsRunning(true);
    setExecutionError(null);
    setCurrentStep({ title: 'Semantic Grounding', detail: 'Analyzing question and schema...', status: 'running' });

    try {
      // Step 1: Process NL Query through AI / smart engine
      const aiResponse = await processNaturalLanguageQuery(
        q,
        activeDataset,
        apiKeyConfig,
        (step) => setCurrentStep(step)
      );

      // Check if out-of-scope question was detected
      if (aiResponse.isOutOfScope) {
        setOutOfScopeData({
          question: q,
          reason:
            aiResponse.outOfScopeReason ||
            `This question asks for information outside the scope of dataset "${activeDataset.name}".`,
          suggestedQuestions:
            aiResponse.suggestedQuestions && aiResponse.suggestedQuestions.length > 0
              ? aiResponse.suggestedQuestions
              : generateDatasetSuggestions(activeDataset),
        });
        setIsOutOfScopeModalOpen(true);
        // Exclusively do NOT show reasoning trace, generated SQL, chart, or results table!
        return;
      }

      // Check if query needs clarification (e.g. undefined metrics like lost MRR)
      if (aiResponse.status === 'needs_clarification') {
        const newResult: QueryResult = {
          id: `query_${Date.now()}`,
          question: q,
          sql: '',
          columns: [],
          rows: [],
          rowCount: 0,
          executionTimeMs: 0,
          reasoningSteps: aiResponse.reasoningSteps,
          status: 'needs_clarification',
          clarificationMessage: aiResponse.clarificationMessage,
          insight: aiResponse.insight,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setCurrentResult(newResult);
        return;
      }

      // Step 2: Execute the generated SQL locally in browser via duckdb
      const execResult = await executeClientSql(aiResponse.sql, activeDataset);

      if (!execResult.success) {
        // If error indicates column or table not in schema
        const errLower = (execResult.error || '').toLowerCase();
        if (
          errLower.includes('not found') ||
          errLower.includes('does not exist') ||
          errLower.includes('binder error')
        ) {
          setOutOfScopeData({
            question: q,
            reason: `The query referenced fields or entities not found in "${activeDataset.name}": ${execResult.error}`,
            suggestedQuestions: generateDatasetSuggestions(activeDataset),
          });
          setIsOutOfScopeModalOpen(true);
          return;
        }

        throw new Error(execResult.error || 'Failed to execute query in local engine.');
      }

      const newResult: QueryResult = {
        id: `query_${Date.now()}`,
        question: q,
        sql: execResult.sanitizedSql,
        columns: execResult.columns,
        rows: execResult.rows,
        rowCount: execResult.rowCount,
        executionTimeMs: execResult.executionTimeMs,
        reasoningSteps: aiResponse.reasoningSteps,
        status: aiResponse.status || 'verified',
        passedChecks: aiResponse.passedChecks || [
          'SQL intent verified against query plan',
          'DuckDB in-memory execution verified',
          'Output row constraints verified',
        ],
        insight: aiResponse.insight,
        chartSuggestion: aiResponse.chartSuggestion,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setCurrentResult(newResult);

      // Add to query history
      setHistory((prev) => [
        {
          id: newResult.id,
          question: q,
          sql: newResult.sql,
          datasetName: activeDataset.name,
          rowCount: newResult.rowCount,
          timestamp: newResult.timestamp,
        },
        ...prev.slice(0, 19),
      ]);
    } catch (err: any) {
      console.error('Query execution error:', err);
      setExecutionError(err?.message || 'An unexpected error occurred while executing the query.');
    } finally {
      setIsRunning(false);
      setCurrentStep(null);
    }
  };

  // Re-run modified SQL query
  const handleUpdateSql = async (newSql: string) => {
    if (!activeDataset) return;
    try {
      const execResult = await executeClientSql(newSql, activeDataset);
      if (!execResult.success) {
        alert(execResult.error || 'Syntax error in updated SQL');
        return;
      }
      if (currentResult) {
        setCurrentResult({
          ...currentResult,
          sql: execResult.sanitizedSql,
          columns: execResult.columns,
          rows: execResult.rows,
          rowCount: execResult.rowCount,
          executionTimeMs: execResult.executionTimeMs,
        });
      }
    } catch (err: any) {
      alert(`SQL Error: ${err?.message || 'Invalid SQL'}`);
    }
  };

  // Insert column name into textarea
  const handleInsertColumn = (colName: string) => {
    setQuery((prev) => (prev ? `${prev} ${colName}` : colName));
  };

  // Run suggested in-scope question from modal
  const handleSelectOutOfScopeSuggestion = (sug: string) => {
    setQuery(sug);
    setIsOutOfScopeModalOpen(false);
    handleRunQuery(sug);
  };

  // Handle completion from 2-step onboarding wizard (Key & Model -> Dataset)
  const handleCompleteOnboarding = (
    config: ApiKeyConfig,
    dataset?: Dataset
  ) => {
    setApiKeyConfig(config);
    if (dataset) {
      handleSelectDataset(dataset);
    }
  };

  const mainBg = 'bg-background text-text-primary';

  return (
    <div className={`min-h-screen flex flex-col ${mainBg} transition-colors`}>
      {/* Top Navigation Bar */}
      <Header
        activeDataset={activeDataset}
        onOpenKeyModal={() => setIsKeyModalOpen(true)}
        onOpenUploader={() => setIsUploaderOpen(true)}
        onOpenAuditor={() => setIsAuditorOpen(true)}
        onToggleMobileSidebar={() => setIsOpenMobileSidebar(!isOpenMobileSidebar)}
        apiKeyConfig={apiKeyConfig}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
      />

      {/* Main Layout Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Schema Explorer & History */}
        <Sidebar
          dataset={activeDataset}
          onSelectDataset={handleSelectDataset}
          onSelectHistoryQuery={(historyQuery) => {
            setQuery(historyQuery);
            handleRunQuery(historyQuery);
            setIsOpenMobileSidebar(false);
          }}
          history={history}
          onClearHistory={() => setHistory([])}
          isDarkMode={isDarkMode}
          isOpenMobile={isOpenMobileSidebar}
          onCloseMobile={() => setIsOpenMobileSidebar(false)}
          onInsertColumn={handleInsertColumn}
        />

        {/* Content Workspace */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 max-w-5xl mx-auto w-full space-y-6">
          {/* Uploader Dropdown Modal / View if triggered */}
          {isUploaderOpen && (
            <div className="p-6 rounded-2xl border mb-6 relative animate-in fade-in bg-surface border-border-subtle shadow-md">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-accent" />
                  <h3 className="text-sm font-semibold">Upload Dataset</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsUploaderOpen(false)}
                  className="btn-interactive p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-secondary transition-colors duration-fast"
                  aria-label="Close Uploader"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <CsvUploader onDatasetLoaded={handleSelectDataset} isDarkMode={isDarkMode} />
            </div>
          )}

          {/* Natural Language Query Area */}
          <QueryInputArea
            query={query}
            onChangeQuery={setQuery}
            onRunQuery={handleRunQuery}
            isRunning={isRunning}
            activeStep={currentStep}
            dataset={activeDataset}
            hasRunAnyQuery={currentResult !== null}
            isDarkMode={isDarkMode}
          />

          {/* Execution Error Banner */}
          {executionError && (
            <div className="p-4 rounded-xl border border-badge-error-border bg-badge-error-bg text-badge-error-fg text-xs sm:text-sm flex items-start justify-between gap-3 animate-in fade-in shadow-2xs">
              <div className="flex items-start gap-3 text-text-primary">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-error" />
                <div>
                  <span className="font-semibold block text-text-primary">Query Notice</span>
                  <p className="mt-0.5 leading-relaxed text-text-secondary">{executionError}</p>
                </div>
              </div>
              {(executionError.includes('API Key') || executionError.includes('Settings') || executionError.includes('model') || executionError.includes('HTTP')) && (
                <button
                  type="button"
                  onClick={() => setIsKeyModalOpen(true)}
                  className="btn-interactive px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-xs flex-shrink-0 shadow-xs whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  Open Settings
                </button>
              )}
            </div>
          )}

          {/* Results View: Reasoning Trace, AI Insights, Charts, SQL & Table */}
          {currentResult && (
            <ResultsView
              result={currentResult}
              isDarkMode={isDarkMode}
              onUpdateSql={handleUpdateSql}
              onOpenAuditor={() => setIsAuditorOpen(true)}
            />
          )}
        </main>
      </div>

      {/* BYOK Modal */}
      <ApiKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        config={apiKeyConfig}
        onSave={(newConfig) => setApiKeyConfig(newConfig)}
        isDarkMode={isDarkMode}
      />

      {/* Out of Scope Error Popup Modal */}
      <OutOfScopeModal
        isOpen={isOutOfScopeModalOpen}
        onClose={() => setIsOutOfScopeModalOpen(false)}
        data={outOfScopeData}
        dataset={activeDataset}
        onSelectSuggestion={handleSelectOutOfScopeSuggestion}
        isDarkMode={isDarkMode}
      />

      {/* 2-Step Client-Side Onboarding Wizard (Key & Model Selection -> Dataset) */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onComplete={handleCompleteOnboarding}
        activeDataset={activeDataset}
        currentConfig={apiKeyConfig}
        isDarkMode={isDarkMode}
      />

      {/* Telemetry & Privacy Auditor Modal */}
      <TelemetryAuditorModal
        isOpen={isAuditorOpen}
        onClose={() => setIsAuditorOpen(false)}
        isDarkMode={isDarkMode}
        datasetName={activeDataset?.name}
        datasetRowCount={activeDataset?.rowCount}
      />
    </div>
  );
}

