/**
 * QueryMind Main Application Controller
 * Orchestrates UI interactions, keyboard shortcuts, history, and step-by-step animations.
 */

let running = false;
let queryHistory = [];

// Load query history from localStorage
try {
  const saved = localStorage.getItem('querymind_history');
  if (saved) {
    queryHistory = JSON.parse(saved);
  }
} catch (e) {}

document.addEventListener('DOMContentLoaded', async () => {
  renderHistory();
  initAutoResize();
  initShortcuts();
  checkProviderStatus();
});

/**
 * Checks provider health to update model badge in topbar
 */
async function checkProviderStatus() {
  const health = await PipelineClient.checkHealth();
  const badge = document.getElementById('modelBadge');
  if (!badge) return;

  if (health && health.mode === 'live_ready') {
    if (health.providers?.gemini?.configured) {
      badge.innerHTML = `<svg width="7" height="7" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="currentColor"/></svg>Live · Gemini`;
      badge.className = 'badge badge-green';
    } else if (health.providers?.groq?.configured) {
      badge.innerHTML = `<svg width="7" height="7" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="currentColor"/></svg>Live · Groq`;
      badge.className = 'badge badge-green';
    }
  } else {
    badge.innerHTML = `<svg width="7" height="7" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="currentColor"/></svg>Demo Mode`;
    badge.className = 'badge badge-blue';
  }
}

/**
 * Textarea auto-resize
 */
function initAutoResize() {
  const qi = document.getElementById('qi');
  if (!qi) return;

  qi.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 140) + 'px';
  });
}

/**
 * Keyboard shortcuts: ⌘+Enter or Ctrl+Enter
 */
function initShortcuts() {
  const qi = document.getElementById('qi');
  if (!qi) return;

  qi.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      runQuery();
    }
  });
}

/**
 * Sets input query from example chip and runs
 */
function setQ(btn) {
  const q = btn.dataset.q;
  if (!q) return;
  const input = document.getElementById('qi');
  input.value = q;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  input.focus();
  runQuery();
}

/**
 * Sets query string from history without immediate auto-run
 */
function setQStr(q) {
  const input = document.getElementById('qi');
  input.value = q;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  input.focus();
}

/**
 * Manages query history in sidebar
 */
function addHistory(q) {
  // Avoid immediate duplicates
  if (queryHistory[0] === q) return;
  queryHistory.unshift(q);
  if (queryHistory.length > 7) queryHistory.pop();

  try {
    localStorage.setItem('querymind_history', JSON.stringify(queryHistory));
  } catch (e) {}

  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('histList');
  if (!list) return;

  if (queryHistory.length === 0) {
    list.innerHTML = '<div class="hist-empty">No recent queries yet</div>';
    return;
  }

  list.innerHTML = queryHistory.map(item => `
    <div class="hist-item" onclick="setQStr(${escapeAttr(item)})" title="${escapeAttr(item)}">
      ${escapeHTML(item)}
    </div>
  `).join('');
}

/**
 * Primary Query Runner
 */
async function runQuery() {
  if (running) return;
  const input = document.getElementById('qi');
  const q = input.value.trim();
  if (!q) {
    input.focus();
    return;
  }

  running = true;
  const btn = document.getElementById('runBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="dots">Thinking</span>';

  addHistory(q);

  const area = document.getElementById('area');
  area.innerHTML = '';

  // 1. Initial placeholder steps for trace
  const initialSteps = [
    { label: 'Parsing intent' },
    { label: 'Schema analysis' },
    { label: 'Planning the join' },
    { label: 'Generating SQL' },
    { label: 'Verifying query' },
    { label: 'Reading results' }
  ];

  const trace = new TraceController(area);
  trace.renderShell(initialSteps);

  try {
    // 2. Call backend /api/pipeline
    const resultPromise = PipelineClient.executeQuery(q);

    // Animate Step 1 (Intent)
    await trace.animateStep(0, 'Analyzing question for entities, metrics, and filters...');
    await sleep(200);

    // Wait for backend result
    const result = await resultPromise;

    if (!result || !result.success) {
      throw new Error(result?.error || 'Failed to process natural language query.');
    }

    const { steps, sql, results, insight, badgeLabel, isSampleData } = result;

    // Animate Step 2 (Schema)
    await trace.animateStep(1, steps[1]?.detail || 'Mapping request to tables and foreign keys...');
    await sleep(200);

    // Animate Step 3 (Join Planner)
    await trace.animateStep(2, steps[2]?.detail || 'Formulating relational join plan...');
    await sleep(200);

    // Animate Step 4 (SQL Generator)
    await trace.animateStep(3, steps[3]?.detail || 'Generating production PostgreSQL with clause comments...');
    await sleep(200);

    // Animate Step 5 (Query Verifier)
    await trace.animateStep(4, steps[4]?.detail || 'Checked: column names exist · joins valid · SELECT-only safe');
    await sleep(200);

    // Complete trace badge
    trace.complete();

    // 3. Render Generated SQL Card
    const sqlCard = document.createElement('div');
    sqlCard.className = 'sql-card';
    const isLive = badgeLabel && badgeLabel.startsWith('Live');
    const badgeClass = isLive ? 'badge badge-green' : 'badge badge-blue';

    sqlCard.innerHTML = `
      <div class="card-hdr">
        <div class="card-hdr-left">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#34c97b" stroke-width="1.6">
            <path d="M2 4h12M5 8h8M8 12h4"/>
          </svg>
          Generated SQL
          <span class="${badgeClass}" style="margin-left: 6px;">${escapeHTML(badgeLabel || 'Sample')}</span>
        </div>
        <button class="copy-btn" id="copySqlBtn">Copy</button>
      </div>
      <div class="sql-body">
        <pre class="sql-code">${highlightSQL(sql)}</pre>
      </div>
    `;

    sqlCard.querySelector('#copySqlBtn').addEventListener('click', function () {
      copySQL(this, sql);
    });

    area.appendChild(sqlCard);
    await sleep(300);

    // Animate Step 6 (Reading results)
    await trace.animateStep(5, steps[5]?.detail || 'Surfacing key business signal from returned records...');
    await sleep(250);

    // 4. Render Results Table Card
    const resultsCard = renderResultsTable(results, isSampleData);
    area.appendChild(resultsCard);
    await sleep(300);

    // 5. Render AI Insight Card with Typewriter & Blinking Cursor
    await renderInsightCard(area, insight);

  } catch (err) {
    const errCard = document.createElement('div');
    errCard.className = 'err-card';
    errCard.innerHTML = `
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
        <circle cx="8" cy="8" r="7"/>
        <path d="M8 4v5M8 11.5v.5"/>
      </svg>
      <div>
        <strong>Query Processing Error</strong>
        <div style="margin-top: 4px; color: rgba(248, 113, 113, 0.9); font-size: 12.5px;">
          ${escapeHTML(err.message)}
        </div>
      </div>
    `;
    area.appendChild(errCard);
  } finally {
    running = false;
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M3 2l11 6-11 6V2z"/>
      </svg>
      Run query
    `;
  }
}

/**
 * Mobile sidebar toggle
 */
function toggleSidebar() {
  const sb = document.querySelector('.sidebar');
  if (sb) {
    sb.classList.toggle('open');
  }
}

function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return JSON.stringify(String(str || ''));
}

window.runQuery = runQuery;
window.setQ = setQ;
window.setQStr = setQStr;
window.toggleSidebar = toggleSidebar;
