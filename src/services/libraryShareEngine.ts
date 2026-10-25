import { LocalQueryStorage, UserSavedQuery } from './localQueryStorage';

export interface LibraryExportPayload {
  platform: string;
  version: string;
  compiledAt: number;
  totalQueries: number;
  queries: UserSavedQuery[];
}

export interface LibraryImportResult {
  success: boolean;
  message: string;
  addedCount: number;
  totalNow: number;
}

const MAX_IMPORT_SIZE_BYTES = 1024 * 1024; // 1 MB payload limit
const MAX_IMPORT_QUERY_COUNT = 500;

/**
 * Sanitizes plain text to prevent HTML tags or script injection.
 */
function sanitizePlainText(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/[<>]/g, '')
    .trim();
}

/**
 * Validates that an imported query satisfies safe structure and read-only SQL requirements.
 */
function isSafeImportedQuery(q: any): boolean {
  if (!q || typeof q !== 'object') return false;
  if (typeof q.userQuery !== 'string' || q.userQuery.trim().length === 0) return false;
  if (typeof q.successfulSql !== 'string' || q.successfulSql.trim().length === 0) return false;
  
  // Guard against massive string payloads
  if (q.userQuery.length > 2000 || q.successfulSql.length > 10000) return false;

  const upperSql = q.successfulSql.trim().toUpperCase();
  // Must be strictly read-only
  if (!upperSql.startsWith('SELECT') && !upperSql.startsWith('WITH')) {
    return false;
  }

  // Reject dangerous DDL/DML keywords or external file loading
  const forbidden = /\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|GRANT|REVOKE|ATTACH|DETACH|PRAGMA|INSTALL|LOAD|COPY|SYSTEM|READ_CSV|READ_PARQUET|HTTPFS)\b/i;
  if (forbidden.test(q.successfulSql)) {
    return false;
  }

  return true;
}

export class LibraryShareEngine {
  private storage = new LocalQueryStorage();

  public exportLocalLibraryToFile(): { success: boolean; message: string; count: number } {
    const rawQueries = this.storage.getSavedQueries();

    if (rawQueries.length === 0) {
      return {
        success: false,
        message: 'No saved queries in memory to export.',
        count: 0,
      };
    }

    // Strictly ensure no API keys or raw record rows are included in the export payload
    const sanitizedQueries: UserSavedQuery[] = rawQueries.map((q) => ({
      id: q.id,
      userQuery: sanitizePlainText(q.userQuery),
      successfulSql: q.successfulSql.trim(),
      schemaContextFingerprint: q.schemaContextFingerprint,
      savedAt: q.savedAt,
    }));

    const payload: LibraryExportPayload = {
      platform: 'QueryMind Local Analyst Architecture',
      version: '2.0.0',
      compiledAt: Date.now(),
      totalQueries: sanitizedQueries.length,
      queries: sanitizedQueries,
    };

    if (typeof document !== 'undefined') {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `query_mind_blueprints_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(anchor);
      anchor.click();

      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    }

    return {
      success: true,
      message: `Exported ${sanitizedQueries.length} query blueprint(s) to JSON.`,
      count: sanitizedQueries.length,
    };
  }

  public exportLibraryAsJsonString(): string {
    const rawQueries = this.storage.getSavedQueries();
    const sanitizedQueries: UserSavedQuery[] = rawQueries.map((q) => ({
      id: q.id,
      userQuery: sanitizePlainText(q.userQuery),
      successfulSql: q.successfulSql.trim(),
      schemaContextFingerprint: q.schemaContextFingerprint,
      savedAt: q.savedAt,
    }));

    const payload: LibraryExportPayload = {
      platform: 'QueryMind Local Analyst Architecture',
      version: '2.0.0',
      compiledAt: Date.now(),
      totalQueries: sanitizedQueries.length,
      queries: sanitizedQueries,
    };
    return JSON.stringify(payload, null, 2);
  }

  public importLibraryFromString(rawJson: string): LibraryImportResult {
    // 1. Guard against oversized payloads (DoS protection)
    if (rawJson.length > MAX_IMPORT_SIZE_BYTES) {
      return {
        success: false,
        message: `Import rejected: File size (${Math.round(rawJson.length / 1024)} KB) exceeds 1 MB security limit.`,
        addedCount: 0,
        totalNow: this.storage.getSavedQueries().length,
      };
    }

    try {
      const parsed = JSON.parse(rawJson);
      const incomingQueries: any[] = Array.isArray(parsed)
        ? parsed
        : parsed?.queries && Array.isArray(parsed.queries)
        ? parsed.queries
        : null;

      if (!incomingQueries) {
        return {
          success: false,
          message: 'Invalid JSON format: missing valid "queries" array.',
          addedCount: 0,
          totalNow: this.storage.getSavedQueries().length,
        };
      }

      if (incomingQueries.length > MAX_IMPORT_QUERY_COUNT) {
        return {
          success: false,
          message: `Import rejected: Contains ${incomingQueries.length} queries, exceeding maximum allowed limit of ${MAX_IMPORT_QUERY_COUNT}.`,
          addedCount: 0,
          totalNow: this.storage.getSavedQueries().length,
        };
      }

      const current = this.storage.getSavedQueries();
      let addedCount = 0;
      let rejectedUnsafeCount = 0;

      incomingQueries.forEach((incoming: any) => {
        // Enforce strict schema and security boundary
        if (!isSafeImportedQuery(incoming)) {
          rejectedUnsafeCount++;
          return;
        }

        const cleanQuery = sanitizePlainText(incoming.userQuery);
        const cleanSql = incoming.successfulSql.trim();
        const fingerprint = typeof incoming.schemaContextFingerprint === 'string' ? incoming.schemaContextFingerprint : '';

        const duplicate = current.some(
          (ex) =>
            ex.userQuery.toLowerCase() === cleanQuery.toLowerCase() &&
            ex.schemaContextFingerprint === fingerprint
        );

        if (!duplicate) {
          current.unshift({
            id: `imported_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            userQuery: cleanQuery,
            successfulSql: cleanSql,
            schemaContextFingerprint: fingerprint,
            savedAt: typeof incoming.savedAt === 'number' ? incoming.savedAt : Date.now(),
          });
          addedCount++;
        }
      });

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('query_mind_local_library', JSON.stringify(current));
      }

      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('querymind_library_updated'));
      }

      let message = '';
      if (addedCount > 0) {
        message = `Successfully imported ${addedCount} new query blueprint(s)!`;
        if (rejectedUnsafeCount > 0) {
          message += ` (${rejectedUnsafeCount} invalid or unsafe queries were rejected).`;
        }
      } else if (rejectedUnsafeCount > 0) {
        message = `No queries imported: ${rejectedUnsafeCount} query blueprints failed security/schema validation.`;
      } else {
        message = 'All valid queries in the file are already in your memory library.';
      }

      return {
        success: addedCount > 0 || rejectedUnsafeCount === 0,
        message,
        addedCount,
        totalNow: current.length,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to parse blueprint file: ${err?.message || 'Invalid JSON syntax'}`,
        addedCount: 0,
        totalNow: this.storage.getSavedQueries().length,
      };
    }
  }

  public importLibraryFromFile(
    file: File,
    callback: (result: LibraryImportResult) => void
  ): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const res = this.importLibraryFromString(content);
      callback(res);
    };
    reader.onerror = () => {
      callback({
        success: false,
        message: 'Could not read the uploaded JSON file.',
        addedCount: 0,
        totalNow: this.storage.getSavedQueries().length,
      });
    };
    reader.readAsText(file);
  }
}
