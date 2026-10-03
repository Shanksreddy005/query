/**
 * QueryMind Main Application Controller
 * Linear × Perplexity × Hex × Vercel Inspired UI/UX Architecture
 * Coordinates DuckDB-WASM, BYOK AI Agent, local CSV ingestion, and the answer-first interactive workspace.
 */

import { getDuckDB } from './duckdb/init.js';
import { executeQuery } from './duckdb/executor.js';
import { ApiKeyModal } from './ui/api_key_modal.js';
import { UploaderView } from './ui/uploader_view.js';
import { SchemaView } from './ui/schema_view.js';
import { TraceView } from './ui/trace_view.js';
import { renderSqlCard, renderTechnicalDetailsCard } from './ui/sql_view.js';
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
  const sidebarEl = document.getElementById('sidebarEl');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const sidebarSchemaEl = document.getElementById('sidebarSchema');
  const sidebarHistoryEl = document.getElementById('sidebarHistory');
  const privacySlotEl = document.getElementById('privacyIndicatorSlot');
  const uploaderSlotEl = document.getElementById('uploaderSlot');
  const queryWorkspaceWrap = document.getElementById('queryWorkspaceWrap');
  const heroStateEl = document.getElementById('heroState');
  const queryInput = document.getElementById('qi');
  const runBtn = document.getElementById('runBtn');
  const exampleChipsContainer = document.getElementById('exampleChips');
  const mainWorkspaceArea = document.getElementById('area');

  // Mobile drawer toggle
  if (mobileMenuBtn && sidebarEl) {
    mobileMenuBtn.addEventListener('click', () => {
      sidebarEl.classList.toggle('open');
    });
  }

  // 1. Render Privacy Guarantee Widget in Sidebar Footer
  if (privacySlotEl) {
    renderPrivacyIndicator(privacySlotEl);
  }

  // 2. Initialize Dynamic Sidebar Schema View
  const schemaView = new SchemaView(sidebarSchemaEl);

  // 3. Initialize Sidebar History View
  const historyView = new HistoryView({
    containerEl: sidebarHistoryEl,
    onSelectQuery: (q) => {
      if (queryInput) {
        queryInput.value = q;
        autoResizeInput(queryInput);
        queryInput.focus();
        if (sidebarEl) sidebarEl.classList.remove('open');
      }
    }
  });

  // 4. Initialize CSV Uploader (Effortless Dropzone)
  const uploaderView = new UploaderView({
    containerEl: uploaderSlotEl,
    getDuckDB: getDuckDB,
    onDatasetLoaded: (datasetInfo) => {
      activeDataset = datasetInfo;
      schemaView.renderSchema(datasetInfo);
      updateDynamicExampleChips(datasetInfo);

      if (queryWorkspaceWrap) queryWorkspaceWrap.style.display = 'flex';
      if (heroStateEl) {
        heroStateEl.querySelector('.hero-subtitle').textContent = `Ask anything about ${datasetInfo.tableName} (${datasetInfo.totalRows.toLocaleString()} rows, ${datasetInfo.columns.length} columns)`;
      }

      if (queryInput) {
        queryInput.disabled = false;
        queryInput.placeholder = `Ask a question about ${datasetInfo.tableName}... (Press ⌘↵ or Ctrl+Enter to run)`;
        queryInput.focus();
      }
      if (runBtn) runBtn.disabled = false;
    },
    onDatasetCleared: () => {
      activeDataset = null;
      schemaView.renderEmpty();
      renderDefaultExampleChips();
      mainWorkspaceArea.innerHTML = '';

      if (queryWorkspaceWrap) queryWorkspaceWrap.style.display = 'none';
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
      if (!activeDataset) {
        uploaderView.loadDemoDataset();
      }
    },
    onDemoMode: () => {
      if (!activeDataset) {
        uploaderView.loadDemoDataset();
      }
    }
  });

  // Startup prompt if no key is configured
  if (!providerManager.hasAnyKey()) {
    apiKeyModal.show();
  } else {
    uploaderView.loadDemoDataset();
  }

  // 6. Query Input Auto-Resize & Shortcuts
  function autoResizeInput(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
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

  // 7. Dynamic Suggestion Pills
  function renderDefaultExampleChips() {
    if (!exampleChipsContainer) return;
    exampleChipsContainer.innerHTML = `
      <button class="suggestion-pill" data-q="Show customers who cancelled their subscription last month.">Cancelled last month</button>
      <button class="suggestion-pill" data-q="Which plan has the highest average MRR?">Avg MRR by plan</button>
      <button class="suggestion-pill" data-q="How many active customers are there by plan?">Active customers by plan</button>
      <button class="suggestion-pill" data-q="Which customers generated more than $5,000 in monthly recurring revenue?">MRR > $5,000</button>
    `;
    bindChipClicks();
  }

  function updateDynamicExampleChips(datasetInfo) {
    if (!exampleChipsContainer) return;
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
      .map(c => `<button class="suggestion-pill" data-q="${escapeAttr(c.q)}">${escapeHTML(c.label)}</button>`)
      .join('');

    bindChipClicks();
  }

  function bindChipClicks() {
    if (!exampleChipsContainer) return;
    const chips = exampleChipsContainer.querySelectorAll('.suggestion-pill');
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

  // 8. Primary Query Execution Pipeline (Answer-First Architecture)
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

    // Check if API key is configured
    if (!providerManager.hasApiKey()) {
      const provName = providerManager.getActiveConfig().provider;
      const proceed = confirm(
        `Natural-language analysis requires an API key for ${provName}.\n\nClick OK to configure your key in Key Settings, or Cancel to run raw SQL directly.`
      );
      if (proceed) {
        apiKeyModal.show();
        return;
      }
    }

    isRunning = true;
    runBtn.disabled = true;
    runBtn.innerHTML = `
      <span style="display: inline-block; width: 12px; height: 12px; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></span>
      <span>Analyzing</span>
    `;

    historyView.add(question);
    mainWorkspaceArea.innerHTML = '';

    const { conn } = await getDuckDB();

    // Direct SQL check (if user entered raw SELECT / WITH statement)
    if (/^\s*(SELECT|WITH)\b/i.test(question)) {
      await handleDirectSqlQuery(conn, question);
      resetRunButton();
      return;
    }

    // 1. Compact AI Activity Stream
    const traceView = new TraceView(mainWorkspaceArea);
    traceView.renderShell([
      { label: 'Understanding your question' },
      { label: 'Inspecting dataset schema' },
      { label: 'Generating SQL query' },
      { label: 'Executing query locally in DuckDB' },
      { label: 'Synthesizing business insight' }
    ]);

    try {
      const activeConfig = providerManager.getActiveConfig();

      const agentResult = await runAgentLoop({
        question,
        conn,
        datasetInfo: activeDataset,
        onTraceStep: async (stepIdx, label, detail) => {
          await traceView.animateStep(stepIdx, detail);
        },
        onSqlGenerated: () => {}
      });

      if (!agentResult.success) {
        traceView.setError(agentResult.error);
        renderErrorCard(agentResult.error);
        return;
      }

      traceView.complete();

      // Clear activity stream card to give prime visual focus to the answer
      // (or settle it smoothly)
      const activityEl = document.getElementById('aiActivityCard');
      if (activityEl) {
        activityEl.style.opacity = '0.6';
        activityEl.style.transform = 'scale(0.99)';
        activityEl.style.transition = 'all 0.3s ease';
      }

      // 2. Question Banner
      const qBanner = document.createElement('div');
      qBanner.className = 'question-banner';
      qBanner.innerHTML = `
        <span style="color: var(--accent); font-weight: 600;">Q:</span>
        <strong>${escapeHTML(question)}</strong>
      `;
      mainWorkspaceArea.appendChild(qBanner);

      // 3. ANSWER-FIRST: AI Executive Insight
      if (agentResult.insight) {
        const insightView = new InsightView(mainWorkspaceArea);
        await insightView.render(agentResult.insight);
      }

      // 4. KPI Cards + Detailed Results Data Table
      if (agentResult.results) {
        const resultsTable = renderResultsTable(agentResult.results);
        mainWorkspaceArea.appendChild(resultsTable);
      }

      // 5. PROGRESSIVE DISCLOSURE: Generated SQL Accordion
      if (agentResult.sql) {
        const sqlAccordion = renderSqlCard(agentResult.sql, activeDataset.tableName);
        mainWorkspaceArea.appendChild(sqlAccordion);
      }

      // 6. PROGRESSIVE DISCLOSURE: Technical Execution Details Accordion
      const techDetails = renderTechnicalDetailsCard({
        provider: activeConfig.provider,
        model: activeConfig.modelLabel,
        executionTimeMs: agentResult.results?.executionTimeMs || 0,
        totalRowCount: agentResult.results?.totalRowCount || 0,
        rounds: agentResult.rounds || 1
      });
      mainWorkspaceArea.appendChild(techDetails);

      // Smooth scroll to answer
      qBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (err) {
      traceView.setError(err.message);
      renderErrorCard(err.message);
    } finally {
      resetRunButton();
    }
  }

  async function handleDirectSqlQuery(conn, sql) {
    const activeConfig = providerManager.getActiveConfig();
    const execRes = await executeQuery(conn, sql, [activeDataset.tableName]);

    const qBanner = document.createElement('div');
    qBanner.className = 'question-banner';
    qBanner.innerHTML = `
      <span style="color: var(--accent); font-weight: 600;">SQL:</span>
      <span class="mono">${escapeHTML(sql)}</span>
    `;
    mainWorkspaceArea.appendChild(qBanner);

    if (execRes.success) {
      const resultsTable = renderResultsTable(execRes);
      mainWorkspaceArea.appendChild(resultsTable);

      const sqlAccordion = renderSqlCard(sql, activeDataset.tableName);
      mainWorkspaceArea.appendChild(sqlAccordion);

      const techDetails = renderTechnicalDetailsCard({
        provider: 'Direct SQL',
        model: 'None (Local DuckDB)',
        executionTimeMs: execRes.executionTimeMs || 0,
        totalRowCount: execRes.totalRowCount || 0,
        rounds: 1
      });
      mainWorkspaceArea.appendChild(techDetails);
    } else {
      renderErrorCard(execRes.error);
    }
  }

  function renderErrorCard(message) {
    const errorCard = document.createElement('div');
    errorCard.className = 'error-card';
    errorCard.innerHTML = `
      <div class="error-hdr">
        <span>⚠ Execution Notice</span>
      </div>
      <div class="error-body">${escapeHTML(message)}</div>
    `;
    mainWorkspaceArea.appendChild(errorCard);
  }

  function resetRunButton() {
    isRunning = false;
    runBtn.disabled = false;
    runBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 2.5v11l9-5.5-9-5.5z"/>
      </svg>
      <span>Run</span>
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
