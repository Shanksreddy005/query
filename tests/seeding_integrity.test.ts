import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { LocalQueryStorage } from '../src/services/localQueryStorage';

// Polyfill localStorage for Node.js test environment if needed
if (typeof globalThis.localStorage === 'undefined') {
  class MockLocalStorage {
    private store = new Map<string, string>();
    getItem(key: string): string | null {
      return this.store.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
      this.store.set(key, String(value));
    }
    removeItem(key: string): void {
      this.store.delete(key);
    }
    clear(): void {
      this.store.clear();
    }
    get length(): number {
      return this.store.size;
    }
    key(index: number): string | null {
      return Array.from(this.store.keys())[index] ?? null;
    }
  }
  (globalThis as any).localStorage = new MockLocalStorage();
}

const expect = (actual: any) => ({
  toBe: (expected: any) => assert.strictEqual(actual, expected),
  toBeGreaterThanOrEqual: (expected: number) =>
    assert.ok(actual >= expected, `Expected ${actual} to be >= ${expected}`),
  toContain: (expected: string) =>
    assert.ok(actual.includes(expected), `Expected "${actual}" to contain "${expected}"`),
});

describe("Antigravity Build Loop: In-Browser Auto-Seed Verification", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should compile dependencies cleanly and populate seed library on storage instance spin-up", () => {
    const storage = new LocalQueryStorage();
    const activeQueries = storage.getSavedQueries();
    
    // Assert seed block parsing count matches configured pack counts
    expect(activeQueries.length).toBeGreaterThanOrEqual(8);
    expect(localStorage.getItem("query_mind_library_seeded")).toBe("true");
  });

  it("should target and return correct few-shot arrays based on schema fingerprint matching", () => {
    const storage = new LocalQueryStorage();
    const mockSaaSColumns = ["active_users","churn_status","company_name","customer_id","industry","mrr","nps_score","plan_tier","signup_date","support_tickets"];
    
    const matchedTemplates = storage.getRelevantUserTemplates(mockSaaSColumns, "Get active revenue accounts");
    expect(matchedTemplates.length).toBe(3);
    expect(matchedTemplates[0].successfulSql).toContain("SELECT");
  });

  it("should calculate correct library diagnostics and allow resetting to factory defaults", () => {
    const storage = new LocalQueryStorage();
    
    // Add custom query
    storage.saveSuccessfulQuery("Custom query for testing", ["col_a", "col_b"], "SELECT * FROM test;");
    
    const diagBefore = storage.getLibraryDiagnostics();
    expect(diagBefore.totalTemplates).toBeGreaterThanOrEqual(9);
    expect(diagBefore.userCustomCount).toBe(1);
    expect(diagBefore.standardSeedCount).toBe(8);

    // Reset to factory defaults
    storage.resetToFactoryDefaults();
    
    const diagAfter = storage.getLibraryDiagnostics();
    expect(diagAfter.userCustomCount).toBe(0);
    expect(diagAfter.standardSeedCount).toBe(8);
    expect(diagAfter.totalTemplates).toBe(8);
  });
});

