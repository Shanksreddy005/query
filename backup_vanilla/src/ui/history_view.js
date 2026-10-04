/**
 * Memory-Only Query History View (Linear inspired)
 * Compact list of questions asked during the active browser session.
 */

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export class HistoryView {
  constructor({ containerEl, onSelectQuery = () => {} }) {
    this.container = containerEl;
    this.onSelectQuery = onSelectQuery;
    this.history = [];
    this.render();
  }

  add(question) {
    const q = (question || '').trim();
    if (!q) return;
    if (this.history[0] === q) return; // avoid immediate duplicate

    this.history.unshift(q);
    if (this.history.length > 8) {
      this.history.pop();
    }
    this.render();
  }

  clear() {
    this.history = [];
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="sb-heading">
        <span>HISTORY</span>
        ${this.history.length > 0 ? `
          <button id="btnClearHistoryBtn" class="btn btn-ghost btn-sm" style="height: auto; padding: 0; font-size: 10px; color: var(--text-muted);">
            Clear
          </button>
        ` : ''}
      </div>

      <div class="history-list">
        ${this.history.length === 0 ? `
          <div class="history-empty">No recent queries in session</div>
        ` : this.history.map(item => `
          <div class="history-item" title="${escapeHTML(item)}">
            <span style="color: var(--text-muted); font-size: 11px;">↳</span>
            <span style="overflow: hidden; text-overflow: ellipsis;">${escapeHTML(item)}</span>
          </div>
        `).join('')}
      </div>
    `;

    // Bind click events to items
    const items = this.container.querySelectorAll('.history-item');
    items.forEach((el, idx) => {
      el.addEventListener('click', () => {
        this.onSelectQuery(this.history[idx]);
      });
    });

    const clearBtn = this.container?.querySelector ? this.container.querySelector('#btnClearHistoryBtn') : null;
    if (clearBtn && typeof clearBtn.addEventListener === 'function') {
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clear();
      });
    }
  }
}
