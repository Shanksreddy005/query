/**
 * Dynamic Sidebar Schema View
 * Renders the dynamically discovered table name, column list, data types, and sample data drawer.
 */

export class SchemaView {
  constructor(containerEl) {
    this.container = containerEl;
    this.renderEmpty();
  }

  renderEmpty() {
    this.container.innerHTML = `
      <div class="sb-label">Schema · Dynamic DuckDB</div>
      <div class="schema-empty-notice">
        No dataset loaded yet. Upload a CSV or load the demo dataset to inspect table columns.
      </div>
    `;
  }

  renderSchema(datasetInfo) {
    if (!datasetInfo) {
      this.renderEmpty();
      return;
    }

    const { tableName, columns, sampleRows, totalRows } = datasetInfo;

    this.container.innerHTML = `
      <div class="sb-label">Schema · Table: ${escapeHTML(tableName)}</div>

      <div class="schema-item">
        <div class="schema-table">
          <span class="t-icon">T</span> <strong>${escapeHTML(tableName)}</strong>
          <span class="badge badge-subtle" style="margin-left: auto;">${totalRows} rows</span>
        </div>
        <div class="schema-cols">
          ${columns.map(col => `
            <div class="schema-col">
              <span class="col-left">
                <span class="col-name">${escapeHTML(col.name)}</span>
              </span>
              <span class="col-type">${escapeHTML(col.type.toLowerCase())}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="sample-preview-box">
        <div class="sample-preview-header" id="btnToggleSample">
          <span>Sample Rows (5)</span>
          <span id="sampleToggleIcon">▼</span>
        </div>
        <div class="sample-preview-content" id="sampleContent" style="display: none;">
          <pre class="sample-json">${escapeHTML(JSON.stringify(sampleRows, null, 2))}</pre>
        </div>
      </div>
    `;

    const toggleBtn = document.getElementById('btnToggleSample');
    const content = document.getElementById('sampleContent');
    const icon = document.getElementById('sampleToggleIcon');

    if (toggleBtn && content) {
      toggleBtn.addEventListener('click', () => {
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        icon.textContent = isHidden ? '▲' : '▼';
      });
    }
  }
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
