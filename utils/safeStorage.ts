/**
 * localStorage access that never throws.
 *
 * Safari private mode, blocked third-party storage, disabled cookies and quota
 * errors all make `localStorage` throw on plain reads and writes — not just on
 * writes. A throw inside a mount effect takes the whole app down, so every
 * access goes through here and degrades to an in-memory store for the rest of
 * the session instead of crashing.
 */

const memoryStore = new Map<string, string>();

// `undefined` means "not probed yet", `null` means "probed and unavailable".
let backingStore: Storage | null | undefined;

const resolveBackingStore = (): Storage | null => {
  if (backingStore !== undefined) return backingStore;

  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      backingStore = null;
      return backingStore;
    }
    // A read-only probe is not enough: some browsers allow getItem but throw on
    // setItem, so the probe has to round-trip a write.
    const probeKey = '__event_chaos_storage_probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    backingStore = window.localStorage;
  } catch {
    backingStore = null;
  }

  return backingStore;
};

export const isPersistentStorageAvailable = (): boolean => resolveBackingStore() !== null;

export const readStoredValue = (key: string): string | null => {
  const storage = resolveBackingStore();
  if (!storage) return memoryStore.get(key) ?? null;

  try {
    return storage.getItem(key);
  } catch {
    return memoryStore.get(key) ?? null;
  }
};

/** Returns true when the value reached persistent storage, false when it only landed in memory. */
export const writeStoredValue = (key: string, value: string): boolean => {
  memoryStore.set(key, value);

  const storage = resolveBackingStore();
  if (!storage) return false;

  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const removeStoredValue = (key: string): void => {
  memoryStore.delete(key);

  const storage = resolveBackingStore();
  if (!storage) return;

  try {
    storage.removeItem(key);
  } catch {
    // Nothing to recover from: the in-memory copy is already gone.
  }
};

/** Reads and parses JSON, falling back on missing keys, unavailable storage and corrupted payloads alike. */
export const readStoredJson = <T>(key: string, fallback: T): T => {
  const raw = readStoredValue(key);
  if (raw === null) return fallback;

  try {
    const parsed = JSON.parse(raw) as T;
    if (parsed === null || typeof parsed !== 'object') return fallback;
    return parsed;
  } catch {
    return fallback;
  }
};

export const writeStoredJson = (key: string, value: unknown): boolean => {
  try {
    return writeStoredValue(key, JSON.stringify(value));
  } catch {
    // Circular structures and BigInt values make JSON.stringify throw.
    return false;
  }
};

/** Test-only: clears the cached probe result and the in-memory fallback. */
export const resetSafeStorageForTests = (): void => {
  backingStore = undefined;
  memoryStore.clear();
};
