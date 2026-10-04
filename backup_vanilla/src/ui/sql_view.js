/**
 * Generated SQL & Execution Details (Progressive Disclosure)
 * Renders verified DuckDB SQL inside an expandable accordion with JetBrains Mono syntax highlighting and copy support.
 */

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function highlightSQL(rawSql, activeTableName = null) {
  if (!rawSql) return '';

  let sql = rawSql
    .replace(/^```(?:sql|duckdb|postgresql)?/gim, '')
    .replace(/```$/gim, '')
    .trim();

  const lines = sql.split('\n');
  const highlightedLines = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('--')) {
      return `<span class="cmt">${escapeHTML(line)}</span>`;
    }

    const commentIdx = line.indexOf('--');
    let codePart = commentIdx !== -1 ? line.slice(0, commentIdx) : line;
    let commentPart = commentIdx !== -1 ? line.slice(commentIdx) : '';

    let escaped = escapeHTML(codePart);

    // 1. Strings: '...'
    escaped = escaped.replace(/('(?:''|[^'])*')/g, '<span class="str">$1</span>');

    // 2. SQL Keywords
    const keywords = [
      'SELECT', 'FROM', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'JOIN',
      'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'WITH', 'AS', 'ON',
      'AND', 'OR', 'NOT', 'BETWEEN', 'IN', 'CASE', 'WHEN', 'THEN', 'ELSE',
      'END', 'DISTINCT', 'OVER', 'PARTITION BY', 'DESC', 'ASC', 'INTERVAL',
      'TRUE', 'FALSE', 'NULL', 'BY', 'UNION', 'ALL', 'LIKE', 'ILIKE', 'IS'
    ];
    const kwRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');
    escaped = escaped.replace(kwRegex, match => `<span class="kw">${match.toUpperCase()}</span>`);

    // 3. DuckDB / SQL Functions
    const functions = [
      'SUM', 'COUNT', 'AVG', 'MAX', 'MIN', 'ROUND', 'DATE_TRUNC', 'STRFTIME',
      'STRPTIME', 'CURRENT_DATE', 'AGE', 'RANK', 'ROW_NUMBER', 'CONCAT', 'LOWER',
      'UPPER', 'TRIM', 'COALESCE', 'NULLIF', 'REGEXP_MATCHES', 'STRING_SPLIT'
    ];
    const fnRegex = new RegExp(`\\b(${functions.join('|')})(?=\\s*\\()`, 'gi');
    escaped = escaped.replace(fnRegex, match => `<span class="fn">${match.toUpperCase()}</span>`);

    // 4. Highlight active table name if provided
    if (activeTableName) {
      const tblRegex = new RegExp(`\\b(${activeTableName})\\b`, 'gi');
      escaped = escaped.replace(tblRegex, '<span class="tbl">$1</span>');
    }

    // 5. Numeric constants
    escaped = escaped.replace(/\b(\d+(?:\.\d+)?)\b(?![^<]*>)/g, '<span class="num">$1</span>');

    if (commentPart) {
      return `${escaped}<span class="cmt">${escapeHTML(commentPart)}</span>`;
    }
    return escaped;
  });

  return highlightedLines.join('\n');
}

export function copySQL(btn, rawSql) {
  if (!navigator.clipboard) {
    const textarea = document.createElement('textarea');
    textarea.value = rawSql;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  } else {
    navigator.clipboard.writeText(rawSql);
  }

  const origText = btn.textContent;
  btn.textContent = 'Copied!';
  btn.style.color = 'var(--success)';

  setTimeout(() => {
    btn.textContent = origText;
    btn.style.color = '';
  }, 1500);
}

/**
 * Renders Progressive Disclosure Accordion for Generated SQL
 */
export function renderSqlCard(sql, activeTableName = null) {
  const card = document.createElement('div');
  card.className = 'accordion-card';
  card.innerHTML = `
    <button class="accordion-trigger" type="button" id="toggleSqlBtn">
      <span style="display: flex; align-items: center; gap: 8px;">
        <span style="color: var(--accent);">⌨</span>
        <span>Generated SQL</span>
        <span class="provider-tier-badge badge-green" style="font-size: 11px;">DuckDB-WASM · Local</span>
      </span>
      <span class="accordion-icon" id="sqlAccordionIcon" style="font-size: 11px; color: var(--text-muted);">▼ Expand</span>
    </button>
    <div class="accordion-content" id="sqlContent">
      <div style="display: flex; justify-content: flex-end; margin-bottom: 8px;">
        <button class="btn btn-ghost btn-sm" id="copySqlBtn" style="border: 1px solid var(--border); border-radius: var(--radius-sm);">
          Copy SQL
        </button>
      </div>
      <pre class="sql-code-block">${highlightSQL(sql, activeTableName)}</pre>
    </div>
  `;

  const toggleBtn = card.querySelector('#toggleSqlBtn');
  const content = card.querySelector('#sqlContent');
  const icon = card.querySelector('#sqlAccordionIcon');
  const copyBtn = card.querySelector('#copySqlBtn');

  toggleBtn.addEventListener('click', () => {
    const isOpen = content.classList.contains('open');
    if (isOpen) {
      content.classList.remove('open');
      icon.textContent = '▼ Expand';
    } else {
      content.classList.add('open');
      icon.textContent = '▲ Collapse';
    }
  });

  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copySQL(copyBtn, sql);
  });

  return card;
}

/**
 * Renders Progressive Disclosure Accordion for Execution Details
 */
export function renderTechnicalDetailsCard(details = {}) {
  const card = document.createElement('div');
  card.className = 'accordion-card';
  card.innerHTML = `
    <button class="accordion-trigger" type="button" id="toggleDetailsBtn">
      <span style="display: flex; align-items: center; gap: 8px;">
        <span style="color: var(--text-secondary);">⚙</span>
        <span>Execution Details</span>
      </span>
      <span class="accordion-icon" id="detailsAccordionIcon" style="font-size: 11px; color: var(--text-muted);">▼ Expand</span>
    </button>
    <div class="accordion-content" id="detailsContent">
      <div class="tech-details-grid">
        <div class="tech-detail-item">
          <span class="tech-detail-label">AI Provider</span>
          <span class="tech-detail-val">${escapeHTML(details.provider || 'Anthropic')}</span>
        </div>
        <div class="tech-detail-item">
          <span class="tech-detail-label">Model</span>
          <span class="tech-detail-val">${escapeHTML(details.model || 'claude-sonnet-5-5')}</span>
        </div>
        <div class="tech-detail-item">
          <span class="tech-detail-label">Local Query Latency</span>
          <span class="tech-detail-val">${details.executionTimeMs || 0} ms</span>
        </div>
        <div class="tech-detail-item">
          <span class="tech-detail-label">Rows Returned</span>
          <span class="tech-detail-val">${details.totalRowCount || 0} rows</span>
        </div>
        <div class="tech-detail-item">
          <span class="tech-detail-label">Agent Planning Rounds</span>
          <span class="tech-detail-val">${details.rounds || 1} / 5 max</span>
        </div>
        <div class="tech-detail-item">
          <span class="tech-detail-label">Execution Engine</span>
          <span class="tech-detail-val">DuckDB-WASM (In-Browser Worker)</span>
        </div>
      </div>
    </div>
  `;

  const toggleBtn = card.querySelector('#toggleDetailsBtn');
  const content = card.querySelector('#detailsContent');
  const icon = card.querySelector('#detailsAccordionIcon');

  toggleBtn.addEventListener('click', () => {
    const isOpen = content.classList.contains('open');
    if (isOpen) {
      content.classList.remove('open');
      icon.textContent = '▼ Expand';
    } else {
      content.classList.add('open');
      icon.textContent = '▲ Collapse';
    }
  });

  return card;
}
