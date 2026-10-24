import { STARTER_SEED_TEMPLATES } from '../config/seedTemplates';

export interface UserSavedQuery {
  id?: string;
  userQuery: string;
  schemaContextFingerprint: string;
  successfulSql: string;
  savedAt: number;
  datasetName?: string;
  rowCount?: number;
  tableName?: string;
  insightSummary?: string;
}

export class LocalQueryStorage {
  private STORAGE_KEY = 'query_mind_local_library';
  private INITIALIZED_KEY = 'query_mind_library_seeded';

  constructor() {
    this.initializeDefaultSeeds();
  }

  private getStorage(): Storage | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage;
      }
      if (typeof localStorage !== 'undefined') {
        return localStorage;
      }
      if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
        return (globalThis as any).localStorage;
      }
    } catch {}
    return null;
  }

  private notifySubscribers(): void {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent('querymind_library_updated'));
      } catch {}
    }
  }

  /**
   * Automatically populates browser memory with verified templates on the first launch
   * without requiring cloud network syncs or backend data requests.
   */
  private initializeDefaultSeeds(): void {
    const storage = this.getStorage();
    if (!storage) return;

    const isSeeded = storage.getItem(this.INITIALIZED_KEY);

    if (!isSeeded) {
      const existingQueries = this.getSavedQueries();
      const merged = [...existingQueries];

      STARTER_SEED_TEMPLATES.forEach((seed) => {
        const checkDuplicate = merged.some(
          (q) =>
            q.userQuery.toLowerCase() === seed.userQuery.toLowerCase() &&
            q.schemaContextFingerprint === seed.schemaContextFingerprint
        );
        if (!checkDuplicate) {
          merged.push({
            ...seed,
            id: seed.id || `seed_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          });
        }
      });

      storage.setItem(this.STORAGE_KEY, JSON.stringify(merged));
      storage.setItem(this.INITIALIZED_KEY, 'true');
    }
  }

  public getFingerprint(columns: string[]): string {
    return [...columns].sort().join(',');
  }

  public getSavedQueries(): UserSavedQuery[] {
    const storage = this.getStorage();
    if (!storage) return [];
    const raw = storage.getItem(this.STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  public isQuerySaved(userQuery: string, activeColumns: string[]): boolean {
    const fingerprint = this.getFingerprint(activeColumns);
    const currentLibrary = this.getSavedQueries();
    const cleanQ = userQuery.trim().toLowerCase();

    return currentLibrary.some(
      (q) =>
        q.userQuery.trim().toLowerCase() === cleanQ &&
        q.schemaContextFingerprint === fingerprint
    );
  }

  public saveSuccessfulQuery(
    userQuery: string,
    activeColumns: string[],
    sql: string,
    meta?: {
      datasetName?: string;
      rowCount?: number;
      tableName?: string;
      insightSummary?: string;
    }
  ): boolean {
    const storage = this.getStorage();
    if (!storage) return false;

    const fingerprint = this.getFingerprint(activeColumns);
    const currentLibrary = this.getSavedQueries();
    const cleanQ = userQuery.trim();

    const isDuplicate = currentLibrary.some(
      (q) =>
        q.userQuery.toLowerCase() === cleanQ.toLowerCase() &&
        q.schemaContextFingerprint === fingerprint
    );

    if (isDuplicate) return false;

    currentLibrary.unshift({
      id: `saved_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userQuery: cleanQ,
      schemaContextFingerprint: fingerprint,
      successfulSql: sql,
      savedAt: Date.now(),
      datasetName: meta?.datasetName,
      rowCount: meta?.rowCount,
      tableName: meta?.tableName,
      insightSummary: meta?.insightSummary,
    });

    storage.setItem(this.STORAGE_KEY, JSON.stringify(currentLibrary));
    this.notifySubscribers();
    return true;
  }

  public deleteSavedQuery(userQuery: string, fingerprint?: string): boolean {
    const storage = this.getStorage();
    if (!storage) return false;

    const currentLibrary = this.getSavedQueries();
    const cleanQ = userQuery.trim().toLowerCase();

    const initialLength = currentLibrary.length;
    const filtered = currentLibrary.filter((q) => {
      const matchQuery = q.userQuery.trim().toLowerCase() === cleanQ;
      if (fingerprint) {
        return !(matchQuery && q.schemaContextFingerprint === fingerprint);
      }
      return !matchQuery;
    });

    if (filtered.length !== initialLength) {
      storage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
      this.notifySubscribers();
      return true;
    }

    return false;
  }

  public getRelevantUserTemplates(activeColumns: string[], _userQuery?: string): UserSavedQuery[] {
    const fingerprint = this.getFingerprint(activeColumns);
    const allSaved = this.getSavedQueries();

    return allSaved.filter((q) => q.schemaContextFingerprint === fingerprint);
  }

  /**
   * Hard-purges user-saved experimental templates and completely overrides 
   * local space with the production-verified starter packs.
   */
  public resetToFactoryDefaults(): void {
    const storage = this.getStorage();
    if (storage) {
      storage.removeItem(this.STORAGE_KEY);
      storage.removeItem(this.INITIALIZED_KEY);
    }

    // Re-invoke seed constructor initialization cleanly
    this.initializeDefaultSeeds();
    this.notifySubscribers();
  }

  /**
   * Returns structural runtime telemetry statistics to update the UI dashboard indicators.
   */
  public getLibraryDiagnostics() {
    const allQueries = this.getSavedQueries();
    const seedFingerprints = new Set(STARTER_SEED_TEMPLATES.map((s) => s.schemaContextFingerprint));

    const userCustomCount = allQueries.filter((q) => !seedFingerprints.has(q.schemaContextFingerprint)).length;
    const standardSeedCount = allQueries.length - userCustomCount;

    return {
      totalTemplates: allQueries.length,
      standardSeedCount,
      userCustomCount,
      byteSizeEstimate:
        typeof Blob !== 'undefined'
          ? new Blob([JSON.stringify(allQueries)]).size
          : Buffer.byteLength(JSON.stringify(allQueries)),
    };
  }
}
