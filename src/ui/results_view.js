/**
 * Results Table Renderer
 * Displays local DuckDB execution results with latency, row counts, capping notice, and numeric styling.
 */

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const isMetric = val => /^\s*[$€£₹]?[-+]?\d+(?:,\d+)*(?:\.\d+)?%?\s*$/.test(String(val).trim());

export function renderResultsTable(results) {
  const card = document.createElement('div');
  card.className = 'results-card';

  if (!results || (!results.rows && !results.columns)) {
    card.innerHTML = `
      <div class="card-hdr">
        <div class="card-hdr-left">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#34c97b" stroke-width="1.6">
            <rect x="2" y="2" width="12" height="12" rx="1"/>
            <path d="M2 6h12M6 6v8"/>
          </svg>
          Query results
        </div>
        <span class="results-meta">0 rows · DuckDB-WASM · Local</span>
      </div>
      <div style="padding: 24px; text-align: center; color: var(--muted); font-size: 13px;">
        Query returned no records.
      </div>
    `;
    return card;
  }

  const {
    columns = [],
    rows = [],
    totalRowCount = rows.length,
    displayRowCount = rows.length,
    executionTimeMs = 0,
    isCapped = false
  } = results;

  const rowCountText = isCapped
    ? `Showing ${displayRowCount} of ${totalRowCount.toLocaleString()} rows (capped)`
    : `${totalRowCount} row${totalRowCount === 1 ? '' : 's'}`;

  let tableHtml = `
    <div class="card-hdr">
      <div class="card-hdr-left">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#34c97b" stroke-width="1.6">
          <rect x="2" y="2" width="12" height="12" rx="1"/>
          <path d="M2 6h12M6 6v8"/>
        </svg>
        Query results
      </div>
      <span class="results-meta">
        ${rowCountText} · ${executionTimeMs} ms · <strong>DuckDB-WASM · Local</strong>
      </span>
    </div>
    <div class="table-wrap">
      <table class="rt">
        <thead>
          <tr>
            ${columns.map(col => `<th>${escapeHTML(col)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              ${row.map(cell => {
                const cellStr = String(cell);
                const isNull = cellStr === 'NULL';
                const isNum = !isNull && isMetric(cellStr);
                const cls = isNull ? 'null-cell' : (isNum ? 'nc' : '');
                return `<td class="${cls}">${escapeHTML(cellStr)}</td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  if (isCapped) {
    tableHtml += `
      <div class="table-cap-notice">
        Capped at ${displayRowCount} rows for browser UI performance. Total matching records in DuckDB: ${totalRowCount.toLocaleString()}.
      </div>
    `;
  }

  card.innerHTML = tableHtml;
  return card;
}
