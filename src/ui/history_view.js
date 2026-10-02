/**
 * Memory-Only Query History View
 * Tracks questions asked during the active browser session.
 * Never persists queries or results to localStorage.
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
      <div class="sb-label">Recent Queries</div>
      <div class="hist-list">
        ${this.history.length === 0 ? `
          <div class="hist-empty">No recent queries in this session</div>
        ` : this.history.map(item => `
          <div class="hist-item" title="${escapeHTML(item)}">
            ${escapeHTML(item)}
          </div>
        `).join('')}
      </div>
    `;

    // Bind click events
    const items = this.container.querySelectorAll('.hist-item');
    items.forEach((el, idx) => {
      el.addEventListener('click', () => {
        this.onSelectQuery(this.history[idx]);
      });
    });
  }
}
