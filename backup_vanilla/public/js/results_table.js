/**
 * Query Results Table Renderer
 * Displays query results with clean formatting, currency/percentage highlights (.nc), and responsive overflow.
 */

function renderResultsTable(results, isSample = false) {
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
        <span class="results-meta">0 rows</span>
      </div>
      <div style="padding: 24px; text-align: center; color: var(--muted); font-size: 13px;">
        Query returned no records.
      </div>
    `;
    return card;
  }

  const { columns = [], rows = [], rowCount = rows.length, isLiveDb } = results;
  const sourceLabel = isLiveDb ? 'live database' : (isSample ? 'sample data' : 'verified benchmark');

  // Check if string is a numeric, currency, or percentage metric
  const isMetric = val => /^\s*[$€£₹]?[-+]?\d+(?:,\d+)*(?:\.\d+)?%?\s*$/.test(String(val).trim());

  let tableHtml = `
    <div class="card-hdr">
      <div class="card-hdr-left">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#34c97b" stroke-width="1.6">
          <rect x="2" y="2" width="12" height="12" rx="1"/>
          <path d="M2 6h12M6 6v8"/>
        </svg>
        Query results
      </div>
      <span class="results-meta">${rowCount} row${rowCount === 1 ? '' : 's'} · ${sourceLabel}</span>
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
                const isNum = isMetric(cellStr);
                return `<td class="${isNum ? 'nc' : ''}">${escapeHTML(cellStr)}</td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  card.innerHTML = tableHtml;
  return card;
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

window.renderResultsTable = renderResultsTable;
