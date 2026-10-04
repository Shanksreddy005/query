/**
 * SQL Syntax Highlighter & Clipboard Manager
 * Tokenizes and highlights PostgreSQL queries with JetBrains Mono styling.
 */

function highlightSQL(rawSql) {
  if (!rawSql) return '';

  // Clean raw markdown if present
  let sql = rawSql
    .replace(/^```(?:sql|postgresql)?/gim, '')
    .replace(/```$/gim, '')
    .trim();

  // Escape HTML entities to prevent XSS
  const escapeHTML = str => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Separate line comments first so their keywords are not colored
  const lines = sql.split('\n');
  const highlightedLines = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('--')) {
      return `<span class="cmt">${escapeHTML(line)}</span>`;
    }

    // Check for inline comment at end of line
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
      'TRUE', 'FALSE', 'NULL', 'BY', 'UNION', 'ALL'
    ];
    const kwRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');
    escaped = escaped.replace(kwRegex, match => `<span class="kw">${match.toUpperCase()}</span>`);

    // 3. SQL Functions
    const functions = [
      'SUM', 'COUNT', 'AVG', 'MAX', 'MIN', 'ROUND', 'DATE_TRUNC', 'DATE_PART',
      'NOW', 'AGE', 'LAG', 'RANK', 'CONCAT', 'TO_CHAR', 'COALESCE', 'NULLIF'
    ];
    const fnRegex = new RegExp(`\\b(${functions.join('|')})(?=\\s*\\()`, 'gi');
    escaped = escaped.replace(fnRegex, match => `<span class="fn">${match.toUpperCase()}</span>`);

    // 4. Schema Tables
    const tables = ['customers', 'orders', 'subscriptions', 'events'];
    const tblRegex = new RegExp(`\\b(${tables.join('|')})\\b`, 'gi');
    escaped = escaped.replace(tblRegex, '<span class="tbl">$1</span>');

    // 5. Numeric constants
    escaped = escaped.replace(/\b(\d+(?:\.\d+)?)\b(?![^<]*>)/g, '<span class="num">$1</span>');

    if (commentPart) {
      return `${escaped}<span class="cmt">${escapeHTML(commentPart)}</span>`;
    }
    return escaped;
  });

  return highlightedLines.join('\n');
}

function copySQL(btn, rawSql) {
  if (!navigator.clipboard) {
    // Fallback
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

window.highlightSQL = highlightSQL;
window.copySQL = copySQL;
