/**
 * Results Table & KPI Card Renderer (Hex / Linear inspired)
 * Displays KPI cards derived from result set, followed by a clean sticky-header data table.
 */

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const isMetric = val => /^\s*[$€£₹]?[-+]?\d+(?:,\d+)*(?:\.\d+)?%?\s*$/.test(String(val).trim());

/**
 * Extracts 2-4 representative KPI metrics from the results
 */
function extractKpis(columns = [], rows = [], totalRowCount = 0) {
  const kpis = [];

  // If single row result (common for aggregated analytics e.g. COUNT, SUM, AVG)
  if (rows.length === 1 && columns.length <= 4) {
    columns.forEach((col, idx) => {
      const val = rows[0][idx];
      let formattedVal = String(val);
      if (typeof val === 'number') {
        formattedVal = Number.isInteger(val) ? val.toLocaleString() : val.toFixed(2);
      }
      kpis.push({
        label: col.replace(/_/g, ' '),
        value: formattedVal
      });
    });
    return kpis;
  }

  // Standard multi-row result
  // 1. Total Count KPI
  kpis.push({
    label: 'Total Matching Records',
    value: totalRowCount.toLocaleString()
  });

  // 2. Look for numeric columns to compute sum or average
  columns.forEach((col, colIdx) => {
    if (kpis.length >= 3) return;
    const lower = col.toLowerCase();
    const isSumCandidate = lower.includes('mrr') || lower.includes('revenue') || lower.includes('amount') || lower.includes('total');
    
    if (isSumCandidate) {
      let sum = 0;
      let numericCount = 0;
      for (const row of rows) {
        const raw = row[colIdx];
        const num = parseFloat(String(raw).replace(/[^0-9.-]/g, ''));
        if (!isNaN(num)) {
          sum += num;
          numericCount++;
        }
      }

      if (numericCount > 0) {
        const isCurrency = lower.includes('mrr') || lower.includes('revenue') || lower.includes('amount');
        const prefix = isCurrency ? '$' : '';
        kpis.push({
          label: `Sample ${col.replace(/_/g, ' ')} Sum`,
          value: `${prefix}${Math.round(sum).toLocaleString()}`
        });
      }
    }
  });

  return kpis;
}

export function renderResultsTable(results) {
  const container = document.createElement('div');
  container.className = 'results-view-wrap';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = 'var(--space-4)';

  if (!results || (!results.rows && !results.columns)) {
    const emptyCard = document.createElement('div');
    emptyCard.className = 'table-card';
    emptyCard.innerHTML = `
      <div class="table-card-header">
        <span class="table-card-title">Query Results</span>
        <span class="table-meta-text">0 rows · DuckDB-WASM</span>
      </div>
      <div style="padding: 32px; text-align: center; color: var(--text-muted); font-size: 13px;">
        Query returned no records.
      </div>
    `;
    container.appendChild(emptyCard);
    return container;
  }

  const {
    columns = [],
    rows = [],
    totalRowCount = rows.length,
    displayRowCount = rows.length,
    executionTimeMs = 0,
    isCapped = false
  } = results;

  // 1. Render KPI Cards Grid if metrics exist
  const kpis = extractKpis(columns, rows, totalRowCount);
  if (kpis.length > 0) {
    const kpiGrid = document.createElement('div');
    kpiGrid.className = 'kpi-grid';
    kpiGrid.innerHTML = kpis.map(k => `
      <div class="kpi-card">
        <span class="kpi-val">${escapeHTML(k.value)}</span>
        <span class="kpi-label">${escapeHTML(k.label)}</span>
      </div>
    `).join('');
    container.appendChild(kpiGrid);
  }

  // 2. Render Results Table
  const tableCard = document.createElement('div');
  tableCard.className = 'table-card';

  const rowCountText = isCapped
    ? `Showing ${displayRowCount} of ${totalRowCount.toLocaleString()} rows (capped)`
    : `${totalRowCount.toLocaleString()} row${totalRowCount === 1 ? '' : 's'}`;

  tableCard.innerHTML = `
    <div class="table-card-header">
      <span class="table-card-title">
        <span>Detailed Results</span>
      </span>
      <span class="table-meta-text">
        ${rowCountText} · ${executionTimeMs} ms · <strong>DuckDB-WASM · Local</strong>
      </span>
    </div>

    <div class="table-scroll-wrap">
      <table class="data-table">
        <thead>
          <tr>
            ${columns.map(col => `<th>${escapeHTML(col)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              ${row.map(cell => {
                const cellStr = cell === null || cell === undefined ? 'NULL' : String(cell);
                const isNull = cellStr === 'NULL';
                const isNum = !isNull && isMetric(cellStr);
                const cls = isNull ? 'null-val' : (isNum ? 'numeric' : '');
                return `<td class="${cls}">${escapeHTML(cellStr)}</td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    ${isCapped ? `
      <div class="table-capping-bar">
        <span>Display capped at ${displayRowCount} rows for fluid browser performance.</span>
        <span>${totalRowCount.toLocaleString()} records in DuckDB</span>
      </div>
    ` : ''}
  `;

  container.appendChild(tableCard);
  return container;
}
