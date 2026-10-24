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

    const payload: LibraryExportPayload = {
      platform: 'QueryMind Local Analyst Architecture',
      version: '2.0.0',
      compiledAt: Date.now(),
      totalQueries: rawQueries.length,
      queries: rawQueries,
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
      message: `Exported ${rawQueries.length} query blueprint(s) to JSON.`,
      count: rawQueries.length,
    };
  }

  public exportLibraryAsJsonString(): string {
    const rawQueries = this.storage.getSavedQueries();
    const payload: LibraryExportPayload = {
      platform: 'QueryMind Local Analyst Architecture',
      version: '2.0.0',
      compiledAt: Date.now(),
      totalQueries: rawQueries.length,
      queries: rawQueries,
    };
    return JSON.stringify(payload, null, 2);
  }

  public importLibraryFromString(rawJson: string): LibraryImportResult {
    try {
      const parsed = JSON.parse(rawJson);
      const incomingQueries: UserSavedQuery[] = Array.isArray(parsed)
        ? parsed
        : parsed?.queries && Array.isArray(parsed.queries)
        ? parsed.queries
        : null;

      if (!incomingQueries) {
        return {
          success: false,
          message: 'Invalid JSON format: missing "queries" array.',
          addedCount: 0,
          totalNow: this.storage.getSavedQueries().length,
        };
      }

      const current = this.storage.getSavedQueries();
      let addedCount = 0;

      incomingQueries.forEach((incoming: UserSavedQuery) => {
        if (!incoming.userQuery || !incoming.successfulSql) return;

        const duplicate = current.some(
          (ex) =>
            ex.userQuery.toLowerCase() === incoming.userQuery.toLowerCase() &&
            ex.schemaContextFingerprint === incoming.schemaContextFingerprint
        );

        if (!duplicate) {
          current.unshift({
            ...incoming,
            savedAt: incoming.savedAt || Date.now(),
            id: incoming.id || `imported_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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

      return {
        success: true,
        message:
          addedCount > 0
            ? `Successfully imported ${addedCount} new query blueprint(s)!`
            : 'All queries in the file are already in your memory library.',
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
