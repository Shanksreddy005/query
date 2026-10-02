/**
 * QueryMind Main Application Controller
 * Browser-native natural language to SQL analytics engine.
 * Coordinates DuckDB-WASM, BYOK Claude Agent, local CSV ingestion, and the interactive UI.
 */

import { getDuckDB } from './duckdb/init.js';
import { executeQuery } from './duckdb/executor.js';
import { ApiKeyModal } from './ui/api_key_modal.js';
import { UploaderView } from './ui/uploader_view.js';
import { SchemaView } from './ui/schema_view.js';
import { TraceView } from './ui/trace_view.js';
import { renderSqlCard } from './ui/sql_view.js';
import { renderResultsTable } from './ui/results_view.js';
import { InsightView } from './ui/insight_view.js';
import { HistoryView } from './ui/history_view.js';
import { renderPrivacyIndicator } from './ui/privacy_badge.js';
import { runAgentLoop } from './agent/agent_loop.js';
import { providerManager } from './agent/provider_manager.js';

let activeDataset = null;
let isRunning = false;

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const sidebarSchemaEl = document.getElementById('sidebarSchema');
  const sidebarHistoryEl = document.getElementById('sidebarHistory');
  const privacySlotEl = document.getElementById('privacyIndicatorSlot');
  const uploaderSlotEl = document.getElementById('uploaderSlot');
  const queryInput = document.getElementById('qi');
  const runBtn = document.getElementById('runBtn');
  const exampleChipsContainer = document.getElementById('exampleChips');
  const mainWorkspaceArea = document.getElementById('area');

  // 1. Render Privacy Guarantee Widget
  if (privacySlotEl) {
    renderPrivacyIndicator(privacySlotEl);
  }

  // 2. Initialize Sidebar Schema View
  const schemaView = new SchemaView(sidebarSchemaEl);

  // 3. Initialize Sidebar History View
  const historyView = new HistoryView({
    containerEl: sidebarHistoryEl,
    onSelectQuery: (q) => {
      if (queryInput) {
        queryInput.value = q;
        autoResizeInput(queryInput);
        queryInput.focus();
      }
    }
  });

  // 4. Initialize CSV Uploader
  const uploaderView = new UploaderView({
    containerEl: uploaderSlotEl,
    getDuckDB: getDuckDB,
    onDatasetLoaded: (datasetInfo) => {
      activeDataset = datasetInfo;
      schemaView.renderSchema(datasetInfo);
      updateDynamicExampleChips(datasetInfo);
      if (queryInput) {
        queryInput.disabled = false;
        queryInput.placeholder = `Ask a question about "${datasetInfo.tableName}"... (Press ⌘↵ or Ctrl+Enter to run)`;
      }
      if (runBtn) runBtn.disabled = false;
    },
    onDatasetCleared: () => {
      activeDataset = null;
      schemaView.renderEmpty();
      renderDefaultExampleChips();
      mainWorkspaceArea.innerHTML = '';
      if (queryInput) {
        queryInput.value = '';
        queryInput.placeholder = 'Upload a CSV dataset above to start querying...';
        queryInput.disabled = true;
      }
      if (runBtn) runBtn.disabled = true;
    }
  });

  // 5. Initialize BYOK API Key Modal
  const apiKeyModal = new ApiKeyModal({
    onKeyConfigured: () => {
      // Auto-load demo dataset if no dataset is loaded yet
      if (!activeDataset) {
        uploaderView.loadDemoDataset();
      }
    },
    onDemoMode: () => {
      // Load demo dataset in demo mode
      if (!activeDataset) {
        uploaderView.loadDemoDataset();
      }
    }
  });

  // Prompt for key on startup if not already entered
  if (!providerManager.hasAnyKey()) {
    apiKeyModal.show();
  } else {
    uploaderView.loadDemoDataset();
  }

  // 6. Query Input Auto-Resize & Shortcuts
  function autoResizeInput(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }

  if (queryInput) {
    queryInput.addEventListener('input', function() {
      autoResizeInput(this);
    });

    queryInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleExecuteQuery();
      }
    });
  }

  if (runBtn) {
    runBtn.addEventListener('click', () => handleExecuteQuery());
  }

  // 7. Dynamic Example Chips
  function renderDefaultExampleChips() {
    exampleChipsContainer.innerHTML = `
      <button class="chip" data-q="Show customers who cancelled their subscription last month.">Cancelled last month</button>
      <button class="chip" data-q="Which plan has the highest average MRR?">Avg MRR by plan</button>
      <button class="chip" data-q="How many active customers are there by plan?">Active customers by plan</button>
      <button class="chip" data-q="Which customers generated more than $5,000 in monthly recurring revenue?">MRR > $5,000</button>
    `;
    bindChipClicks();
  }

  function updateDynamicExampleChips(datasetInfo) {
    const cols = datasetInfo.columns.map(c => c.name.toLowerCase());
    const chips = [];

    if (cols.includes('cancelled_at') || cols.includes('status')) {
      chips.push({ label: 'Churned accounts', q: `Show all customers who churned or cancelled their subscription.` });
    }
    if (cols.includes('mrr') || cols.includes('revenue') || cols.includes('amount')) {
      chips.push({ label: 'Top 5 by revenue', q: `Show the top 5 records with the highest revenue or amount.` });
    }
    if (cols.includes('plan')) {
      chips.push({ label: 'Breakdown by plan', q: `What is the count and total revenue breakdown by plan?` });
    }
    if (cols.includes('country') || cols.includes('region')) {
      chips.push({ label: 'Distribution by country', q: `What is the customer distribution and revenue by country?` });
    }

    if (chips.length === 0) {
      chips.push({ label: 'Overview', q: `Show a summary of the first 10 rows from ${datasetInfo.tableName}.` });
    }

    exampleChipsContainer.innerHTML = chips
      .map(c => `<button class="chip" data-q="${escapeAttr(c.q)}">${escapeHTML(c.label)}</button>`)
      .join('');

    bindChipClicks();
  }

  function bindChipClicks() {
    const chips = exampleChipsContainer.querySelectorAll('.chip');
    chips.forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.q;
        if (q && queryInput) {
          queryInput.value = q;
          autoResizeInput(queryInput);
          queryInput.focus();
          handleExecuteQuery();
        }
      });
    });
  }

  renderDefaultExampleChips();

  // 8. Primary Query Execution Pipeline
  async function handleExecuteQuery() {
    if (isRunning) return;

    if (!activeDataset) {
      alert('Please upload a CSV or click "Load Sample customers.csv" before querying.');
      return;
    }

    const question = queryInput.value.trim();
    if (!question) {
      queryInput.focus();
      return;
    }

    // Check if API key is present for active provider
    if (!providerManager.hasApiKey()) {
      const provName = providerManager.getActiveProvider() === 'openai' ? 'OpenAI' : 'Anthropic Claude';
      const proceed = confirm(
        `Natural-language analysis requires your ${provName} API key.\n\nClick OK to enter your API key, or Cancel to execute raw SQL directly.`
      );
      if (proceed) {
        apiKeyModal.show();
        return;
      }
    }

    isRunning = true;
    runBtn.disabled = true;
    runBtn.innerHTML = '<span class="dots">Analyzing</span>';

    historyView.add(question);
    mainWorkspaceArea.innerHTML = '';

    const { conn } = await getDuckDB();

    // Direct SQL check (if user entered raw SELECT ... query)
    if (/^\s*(SELECT|WITH)\b/i.test(question)) {
      await handleDirectSqlQuery(conn, question);
      resetRunButton();
      return;
    }

    // 6-step reasoning trace shell
    const traceView = new TraceView(mainWorkspaceArea);
    traceView.renderShell([
      { label: 'Understanding your question' },
      { label: 'Inspecting the dataset schema' },
      { label: 'Planning the SQL query' },
      { label: 'Generating SQL' },
      { label: 'Running SQL locally in DuckDB' },
      { label: 'Checking the results' }
    ]);

    let generatedSqlHolder = null;

    try {
      const agentResult = await runAgentLoop({
        question,
        conn,
        datasetInfo: activeDataset,
        onTraceStep: async (stepIdx, label, detail) => {
          await traceView.animateStep(stepIdx, detail);
        },
        onSqlGenerated: (sql) => {
          generatedSqlHolder = sql;
        }
      });

      if (!agentResult.success) {
        traceView.setError(agentResult.error);
        renderErrorCard(agentResult.error);
        return;
      }

      traceView.complete();

      // Render Generated SQL Card
      if (agentResult.sql) {
        const sqlCard = renderSqlCard(agentResult.sql, activeDataset.tableName);
        mainWorkspaceArea.appendChild(sqlCard);
      }

      // Render Results Table
      if (agentResult.results) {
        const resultsTable = renderResultsTable(agentResult.results);
        mainWorkspaceArea.appendChild(resultsTable);
      }

      // Render AI Insight
      if (agentResult.insight) {
        const insightView = new InsightView(mainWorkspaceArea);
        await insightView.render(agentResult.insight);
      }
    } catch (err) {
      traceView.setError(err.message);
      renderErrorCard(err.message);
    } finally {
      resetRunButton();
    }
  }

  async function handleDirectSqlQuery(conn, sql) {
    const execRes = await executeQuery(conn, sql, [activeDataset.tableName]);
    const sqlCard = renderSqlCard(sql, activeDataset.tableName);
    mainWorkspaceArea.appendChild(sqlCard);

    if (execRes.success) {
      const resultsTable = renderResultsTable(execRes);
      mainWorkspaceArea.appendChild(resultsTable);
    } else {
      renderErrorCard(execRes.error);
    }
  }

  function renderErrorCard(message) {
    const errorCard = document.createElement('div');
    errorCard.className = 'error-card';
    errorCard.innerHTML = `
      <div class="error-hdr">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 10a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm1-4a1 1 0 0 1-2 0V4a1 1 0 0 1 2 0v3z"/>
        </svg>
        Execution Notice
      </div>
      <div class="error-body">${escapeHTML(message)}</div>
    `;
    mainWorkspaceArea.appendChild(errorCard);
  }

  function resetRunButton() {
    isRunning = false;
    runBtn.disabled = false;
    runBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 2.5v11l9-5.5-9-5.5z"/>
      </svg>
      Run analysis
    `;
  }
});

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return String(str)
    .replace(/"/g, '&quot;');
}
