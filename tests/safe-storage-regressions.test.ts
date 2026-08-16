import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isPersistentStorageAvailable,
  readStoredJson,
  readStoredValue,
  removeStoredValue,
  resetSafeStorageForTests,
  writeStoredJson,
  writeStoredValue
} from '../utils/safeStorage';

const createWorkingStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key)
  } as unknown as Storage;
};

/** Mirrors Safari private mode: the API exists but every access throws. */
const createThrowingStorage = () =>
  ({
    getItem: () => {
      throw new DOMException('denied', 'SecurityError');
    },
    setItem: () => {
      throw new DOMException('denied', 'SecurityError');
    },
    removeItem: () => {
      throw new DOMException('denied', 'SecurityError');
    }
  }) as unknown as Storage;

const installWindow = (storage: Storage | undefined) => {
  vi.stubGlobal('window', storage ? { localStorage: storage } : {});
};

beforeEach(() => {
  resetSafeStorageForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetSafeStorageForTests();
});

describe('Safe Storage Regressions', () => {
  it('round-trips values through a working localStorage', () => {
    installWindow(createWorkingStorage());

    expect(isPersistentStorageAvailable()).toBe(true);
    expect(writeStoredValue('career', 'alpha')).toBe(true);
    expect(readStoredValue('career')).toBe('alpha');

    removeStoredValue('career');
    expect(readStoredValue('career')).toBeNull();
  });

  it('never throws when localStorage denies every access, and keeps values in memory', () => {
    installWindow(createThrowingStorage());

    expect(() => isPersistentStorageAvailable()).not.toThrow();
    expect(isPersistentStorageAvailable()).toBe(false);

    // Reports the write did not persist, but the session still reads it back.
    expect(writeStoredValue('career', 'alpha')).toBe(false);
    expect(readStoredValue('career')).toBe('alpha');
    expect(readStoredValue('missing')).toBeNull();
  });

  it('never throws when window is absent', () => {
    vi.stubGlobal('window', undefined);

    expect(() => readStoredValue('career')).not.toThrow();
    expect(readStoredValue('career')).toBeNull();
    expect(writeStoredValue('career', 'alpha')).toBe(false);
    expect(readStoredValue('career')).toBe('alpha');
  });

  it('falls back on corrupted json instead of propagating a parse error', () => {
    installWindow(createWorkingStorage());
    writeStoredValue('settings', '{ not valid json');

    const fallback = { visualQualityMode: 'AUTO' };
    expect(readStoredJson('settings', fallback)).toBe(fallback);
  });

  it('falls back when stored json is a bare scalar rather than an object', () => {
    installWindow(createWorkingStorage());
    writeStoredValue('settings', '42');

    const fallback = { visualQualityMode: 'AUTO' };
    expect(readStoredJson('settings', fallback)).toBe(fallback);
  });

  it('returns parsed json when the payload is valid', () => {
    installWindow(createWorkingStorage());
    writeStoredJson('settings', { visualQualityMode: 'CINEMATIC', reducedMotion: true });

    expect(readStoredJson('settings', {})).toEqual({
      visualQualityMode: 'CINEMATIC',
      reducedMotion: true
    });
  });

  it('reports failure instead of throwing on non-serializable payloads', () => {
    installWindow(createWorkingStorage());

    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(writeStoredJson('settings', circular)).toBe(false);
  });
});
