/**
 * CSV Export Sanitizer
 * Mitigates spreadsheet formula injection (CSV Injection / Formula Injection)
 * when exporting tabular results to CSV for consumption in Excel, Google Sheets,
 * LibreOffice Calc, or Apple Numbers.
 *
 * Defense:
 * - Detects formula triggers: '=', '+', '-', '@', '\t', '\r' (including when preceded by whitespace)
 * - Escapes formula cells by prefixing with a single quote (')
 * - Follows RFC 4180 double-quote escaping for cells containing quotes, commas, newlines, or escaped formulas
 * - Preserves original runtime row records and column definitions in-place without mutation
 */

const FORMULA_PREFIX_REGEX = /^[\s\u0000-\u001f]*[=+\-@\t\r]/;

/**
 * Sanitizes and escapes an individual cell value for safe RFC 4180 CSV export.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  // Preserve native finite numbers directly without formula injection risk
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return String(value);
  }

  let str = '';
  if (typeof value === 'string') {
    str = value;
  } else if (value instanceof Date) {
    str = value.toISOString();
  } else {
    try {
      str = JSON.stringify(value);
    } catch {
      str = String(value);
    }
  }

  // Strip dangerous null bytes
  str = str.replace(/\u0000/g, '');

  let isFormulaTriggered = false;
  if (FORMULA_PREFIX_REGEX.test(str)) {
    // Prefix with single quote to disable automatic formula execution in spreadsheet software
    str = `'${str}`;
    isFormulaTriggered = true;
  }

  // Determine if RFC 4180 quotes are needed:
  // Required if cell contains double quotes, commas, newlines, or was formula-escaped,
  // or starts/ends with whitespace.
  const requiresQuotes =
    isFormulaTriggered ||
    str.includes('"') ||
    str.includes(',') ||
    str.includes('\n') ||
    str.includes('\r') ||
    str.startsWith(' ') ||
    str.endsWith(' ');

  if (requiresQuotes) {
    // RFC 4180: double-quote any internal double quotes
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Formats columns and row objects into a sanitized RFC 4180 CSV text string.
 * Original dataset remains completely unchanged.
 */
export function formatSanitizedCsv(columns: string[], rows: Record<string, any>[]): string {
  if (!columns || columns.length === 0) {
    return '';
  }

  // Sanitize headers as well (headers can also be formula-injected if dynamically generated)
  const headerLine = columns.map((col) => escapeCsvCell(col)).join(',');

  if (!rows || rows.length === 0) {
    return headerLine;
  }

  const rowLines = rows.map((row) =>
    columns.map((col) => escapeCsvCell(row[col])).join(',')
  );

  return [headerLine, ...rowLines].join('\r\n');
}
