import { ApiKeyConfig } from '../types';

const STORAGE_KEY = 'querymind_byok_config';

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
    return (globalThis as any).localStorage;
  }
  return null;
}

/**
 * Loads the user's persisted API key configuration if they previously opted in.
 * Returns null if no key is stored or persistent storage was not opted into.
 */
export function loadStoredApiKeyConfig(): ApiKeyConfig | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.rememberKey === true && typeof parsed.key === 'string') {
      return parsed as ApiKeyConfig;
    }
  } catch {}
  return null;
}

/**
 * Persists or clears the API key based on the user's explicit opt-in preference.
 * If rememberKey is false/falsy, any persisted key is deleted immediately to guarantee volatile memory.
 */
export function saveApiKeyConfig(config: ApiKeyConfig): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (config.rememberKey && config.key && config.key.trim().length > 0) {
      storage.setItem(STORAGE_KEY, JSON.stringify(config));
    } else {
      storage.removeItem(STORAGE_KEY);
    }
  } catch {}
}

/**
 * Explicitly purges any stored API key from persistent browser storage.
 */
export function clearStoredApiKeyConfig(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {}
}
