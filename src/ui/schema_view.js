/**
 * Dynamic Sidebar Schema View (Linear / Hex inspired)
 * Renders collapsible table tree, column data types, and clickable column drawers showing sample values.
 */

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export class SchemaView {
  constructor(containerEl) {
    this.container = containerEl;
    this.activeColumnIndex = null;
    this.renderEmpty();
  }

  renderEmpty() {
    this.container.innerHTML = `
      <div class="sb-heading">SCHEMA</div>
      <div style="font-size: 12px; color: var(--text-muted); padding: 4px 8px;">
        Upload a CSV to explore schema
      </div>
    `;
  }

  renderSchema(datasetInfo) {
    if (!datasetInfo) {
      this.renderEmpty();
      return;
    }

    const { tableName, columns, sampleRows = [] } = datasetInfo;

    this.container.innerHTML = `
      <div class="sb-heading">
        <span>SCHEMA</span>
        <span style="font-family: var(--font-mono); font-size: 10.5px;">${columns.length} cols</span>
      </div>

      <div class="schema-tree">
        <div class="schema-table-hdr" id="toggleTableSchema">
          <span style="display: flex; align-items: center; gap: 6px;">
            <span id="schemaTableChevron" style="font-size: 10px;">▾</span>
            <span style="font-weight: 600; color: var(--text-primary); font-family: var(--font-mono);">${escapeHTML(tableName)}</span>
          </span>
        </div>

        <div class="schema-cols-list" id="schemaColsList">
          ${columns.map((col, idx) => `
            <div class="schema-col-item" data-idx="${idx}" title="Click to view sample values">
              <span class="schema-col-name">${escapeHTML(col.name)}</span>
              <span class="schema-col-type">${escapeHTML(col.type.toLowerCase())}</span>
            </div>
            <div class="sample-drawer" id="colDrawer_${idx}" style="display: none;"></div>
          `).join('')}
        </div>
      </div>
    `;

    // Toggle entire table schema
    const toggleHdr = document.getElementById('toggleTableSchema');
    const colsList = document.getElementById('schemaColsList');
    const chevron = document.getElementById('schemaTableChevron');

    if (toggleHdr && colsList) {
      toggleHdr.addEventListener('click', () => {
        const isHidden = colsList.style.display === 'none';
        colsList.style.display = isHidden ? 'flex' : 'none';
        if (chevron) chevron.textContent = isHidden ? '▾' : '▸';
      });
    }

    // Toggle individual column sample drawers
    const colItems = this.container.querySelectorAll('.schema-col-item');
    colItems.forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.idx, 10);
        const drawer = document.getElementById(`colDrawer_${idx}`);
        if (!drawer) return;

        const isVisible = drawer.style.display === 'block';

        // Close any other open drawers
        this.container.querySelectorAll('.sample-drawer').forEach(d => d.style.display = 'none');

        if (!isVisible) {
          drawer.style.display = 'block';
          const colName = columns[idx]?.name;
          const sampleVals = sampleRows.slice(0, 4).map(r => r[colName]);
          drawer.innerHTML = `
            <div style="color: var(--text-muted); margin-bottom: 2px;">Examples:</div>
            <div>${escapeHTML(sampleVals.join(', '))}</div>
          `;
        }
      });
    });
  }
}
