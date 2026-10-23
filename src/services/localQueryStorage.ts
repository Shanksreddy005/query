import { STARTER_SEED_TEMPLATES } from '../config/seedTemplates';

export interface UserSavedQuery {
  userQuery: string;
  schemaContextFingerprint: string; 
  successfulSql: string;
  savedAt: number;
}

export class LocalQueryStorage {
  private STORAGE_KEY = "query_mind_local_library";
  private INITIALIZED_KEY = "query_mind_library_seeded";

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
      
      STARTER_SEED_TEMPLATES.forEach(seed => {
        const checkDuplicate = merged.some(
          q => q.userQuery.toLowerCase() === seed.userQuery.toLowerCase() &&
               q.schemaContextFingerprint === seed.schemaContextFingerprint
        );
        if (!checkDuplicate) {
          merged.push(seed);
        }
      });

      storage.setItem(this.STORAGE_KEY, JSON.stringify(merged));
      storage.setItem(this.INITIALIZED_KEY, "true");
    }
  }

  private getFingerprint(columns: string[]): string {
    return [...columns].sort().join(",");
  }

  public getSavedQueries(): UserSavedQuery[] {
    const storage = this.getStorage();
    if (!storage) return [];
    const raw = storage.getItem(this.STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  public saveSuccessfulQuery(userQuery: string, activeColumns: string[], sql: string): void {
    const storage = this.getStorage();
    if (!storage) return;

    const fingerprint = this.getFingerprint(activeColumns);
    const currentLibrary = this.getSavedQueries();

    const isDuplicate = currentLibrary.some(
      q => q.userQuery.toLowerCase() === userQuery.toLowerCase() && 
           q.schemaContextFingerprint === fingerprint
    );

    if (isDuplicate) return;

    currentLibrary.push({
      userQuery,
      schemaContextFingerprint: fingerprint,
      successfulSql: sql,
      savedAt: Date.now()
    });

    storage.setItem(this.STORAGE_KEY, JSON.stringify(currentLibrary));
  }

  public getRelevantUserTemplates(activeColumns: string[], userQuery?: string): UserSavedQuery[] {
    const fingerprint = this.getFingerprint(activeColumns);
    const allSaved = this.getSavedQueries();

    return allSaved.filter(q => q.schemaContextFingerprint === fingerprint);
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
      byteSizeEstimate: typeof Blob !== 'undefined' ? new Blob([JSON.stringify(allQueries)]).size : Buffer.byteLength(JSON.stringify(allQueries)),
    };
  }
}

