/**
 * Generated SQL Card & Syntax Highlighter
 * Renders verified DuckDB SQL with JetBrains Mono font and clipboard copy support.
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
  btn.style.borderColor = 'var(--success)';

  setTimeout(() => {
    btn.textContent = origText;
    btn.style.color = '';
    btn.style.borderColor = '';
  }, 1500);
}

export function renderSqlCard(sql, activeTableName = null) {
  const card = document.createElement('div');
  card.className = 'sql-card';
  card.innerHTML = `
    <div class="card-hdr">
      <div class="card-hdr-left">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#34c97b" stroke-width="1.6">
          <path d="M2 4h12M5 8h8M8 12h4"/>
        </svg>
        Generated SQL
        <span class="badge badge-green" style="margin-left: 6px;">DuckDB-WASM · Local</span>
      </div>
      <button class="copy-btn" id="copySqlBtn">Copy</button>
    </div>
    <div class="sql-body">
      <pre class="sql-code">${highlightSQL(sql, activeTableName)}</pre>
    </div>
  `;

  const copyBtn = card.querySelector('#copySqlBtn');
  copyBtn.addEventListener('click', () => copySQL(copyBtn, sql));

  return card;
}
