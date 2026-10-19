import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const authState: { encryptionData: Record<string, unknown> | null } = { encryptionData: null };
const encryptionState = {
  isUnlocked: true,
  isRestoring: false,
  unlock: vi.fn(),
  decryptPosts: vi.fn(),
  encryptBytes: vi.fn(),
  decryptBytes: vi.fn(),
};

vi.mock('../contexts/AuthContext.js', () => ({ useAuth: () => authState }));
vi.mock('../contexts/EncryptionContext.js', () => ({ useEncryption: () => encryptionState }));
vi.mock('../services/imageStorage.js', () => ({ loadImageStorageConfig: vi.fn().mockResolvedValue(false) }));
vi.mock('../services/aiAssistant.js', () => ({ loadAiConfig: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/privateSettings.js', () => ({
  openStartupSettings: vi.fn(async (rows: { key: string; value: unknown }[]) => ({
    map: Object.fromEntries(rows.map(r => [r.key, r.value])), sealed: () => undefined,
  })),
}));
vi.mock('../services/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api.js')>();
  return {
    ...actual,
    entries: { getAll: vi.fn() },
    topics: { getAll: vi.fn() },
    settings: { getAll: vi.fn() },
  };
});

import { useInitializeData } from '../hooks/useInitializeData.js';
import { entries as entriesApi, topics as topicsApi, settings as settingsApi, ApiError } from '../services/api.js';
import { openStartupSettings } from '../services/privateSettings.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { DEFAULT_ACCENT_COLOR } from '../styles/accent.js';

const rawEntry = (id: number) => ({
  id, contentEncrypted: `c${id}`, contentIv: 'iv', metadataEncrypted: `m${id}`, metadataIv: 'iv',
  isEncrypted: true, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z',
});

function serverReturns(settings: { key: string; value: unknown }[] = [], entryIds = [1, 2]) {
  (entriesApi.getAll as any).mockResolvedValue(entryIds.map(rawEntry));
  (topicsApi.getAll as any).mockResolvedValue([{ id: 5, name: 'Journal' }]);
  (settingsApi.getAll as any).mockResolvedValue(settings);
}

describe('useInitializeData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    useEntriesStore.getState().clearAll();
    useUIStore.setState({ accentColor: '#ff0000', themeMode: 'dark' });
    authState.encryptionData = { encryptionEnabled: true, kekSalt: 's', encryptedMasterKey: 'k', kekWrapIv: 'i', kekIterations: 600000 };
    Object.assign(encryptionState, { isUnlocked: true, isRestoring: false });
    encryptionState.decryptPosts.mockImplementation(async ([p]: any[]) => [{
      id: p.id, content: `entry ${p.id}`, metadata: {}, isEncrypted: true, createdAt: p.createdAt, updatedAt: p.updatedAt,
    }]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing while the journal is locked', async () => {
    encryptionState.isUnlocked = false;
    serverReturns();
    renderHook(() => useInitializeData());
    await Promise.resolve();
    expect(entriesApi.getAll).not.toHaveBeenCalled();
  });

  it('loads and decrypts entries, topics and settings, then reports ready', async () => {
    serverReturns([{ key: 'themeMode', value: 'light' }]);
    const { result } = renderHook(() => useInitializeData());

    await waitFor(() => expect(result.current.isReady).toBe(true));
    const store = useEntriesStore.getState();
    expect(store.decryptedEntries.map(e => e.content)).toEqual(['entry 1', 'entry 2']);
    expect(store.topics).toEqual([{ id: 5, name: 'Journal' }]);
    expect(useUIStore.getState().themeMode).toBe('light');
  });

  it("uses Teal when the account has no saved accent — never the previous account's colour", async () => {
    serverReturns();
    const { result } = renderHook(() => useInitializeData());
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(useUIStore.getState().accentColor).toBe(DEFAULT_ACCENT_COLOR);
  });

  it('turns every feature on by default except the opt-in Finance ones', async () => {
    serverReturns([{ key: 'healthEnabled', value: false }]);
    const { result } = renderHook(() => useInitializeData());
    await waitFor(() => expect(result.current.isReady).toBe(true));
    const flags = useEntriesStore.getState().featureFlags;
    expect(flags.healthEnabled).toBe(false);
    expect(flags.financeEnabled).toBe(false);
    expect(flags.reconcileEnabled).toBe(false);
    expect(Object.entries(flags).filter(([k, v]) => !v && !['healthEnabled', 'financeEnabled', 'reconcileEnabled'].includes(k))).toEqual([]);
  });

  it('keeps going when one entry fails to decrypt, showing a placeholder for it', async () => {
    serverReturns([], [1, 2, 3]);
    encryptionState.decryptPosts.mockImplementation(async ([p]: any[]) => {
      if (p.id === 2) throw new Error('bad tag');
      return [{ id: p.id, content: `entry ${p.id}`, metadata: {}, isEncrypted: true, createdAt: p.createdAt, updatedAt: p.updatedAt }];
    });
    const { result } = renderHook(() => useInitializeData());
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(useEntriesStore.getState().decryptedEntries.map(e => e.content)).toEqual(['entry 1', '[Decryption failed]', 'entry 3']);
  });

  it('opens settings through the shared startup path (sealed, key-bound, migrated once)', async () => {
    serverReturns([{ key: 'displayName', value: 'Alex' }]);
    const { result } = renderHook(() => useInitializeData());
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(openStartupSettings).toHaveBeenCalledWith([{ key: 'displayName', value: 'Alex' }], encryptionState.decryptBytes, encryptionState.encryptBytes);
    expect(useUIStore.getState().displayName).toBe('Alex');
  });

  describe('a failed load', () => {
    it('never falls back to an empty journal, and retries until it loads', async () => {
      vi.useFakeTimers();
      serverReturns();
      (entriesApi.getAll as any).mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const { result } = renderHook(() => useInitializeData());

      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(result.current.isReady).toBe(false);
      expect(useEntriesStore.getState().isInitialized).toBe(false);
      expect(useEntriesStore.getState().isLoading).toBe(true);

      // First retry after 10s
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(entriesApi.getAll).toHaveBeenCalledTimes(2);
      expect(result.current.isReady).toBe(true);
    });

    it("waits as long as a 429's Retry-After asks", async () => {
      vi.useFakeTimers();
      serverReturns();
      (entriesApi.getAll as any).mockRejectedValueOnce(new ApiError(429, 'Too many requests', 120));
      renderHook(() => useInitializeData());

      await act(async () => { await vi.advanceTimersByTimeAsync(119_000); });
      expect(entriesApi.getAll).toHaveBeenCalledTimes(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      expect(entriesApi.getAll).toHaveBeenCalledTimes(2);
    });

    it('stops retrying once unmounted', async () => {
      vi.useFakeTimers();
      serverReturns();
      (entriesApi.getAll as any).mockRejectedValue(new TypeError('Failed to fetch'));
      const { unmount } = renderHook(() => useInitializeData());
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      unmount();
      await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
      expect(entriesApi.getAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('needsUnlock', () => {
    it('asks for the password when encrypted and locked', () => {
      encryptionState.isUnlocked = false;
      const { result } = renderHook(() => useInitializeData());
      expect(result.current.needsUnlock).toBe(true);
    });

    it('does not ask while a remembered unlock is being restored', () => {
      Object.assign(encryptionState, { isUnlocked: false, isRestoring: true });
      const { result } = renderHook(() => useInitializeData());
      expect(result.current.needsUnlock).toBe(false);
    });
  });

  describe('handleUnlock', () => {
    it('unlocks with the account params', async () => {
      encryptionState.isUnlocked = false;
      const { result } = renderHook(() => useInitializeData());
      await result.current.handleUnlock('pw', true);
      expect(encryptionState.unlock).toHaveBeenCalledWith('pw', 's', 'k', 'i', 600000, true);
    });

    it('refuses without encryption params', async () => {
      encryptionState.isUnlocked = false;
      authState.encryptionData = { encryptionEnabled: true };
      const { result } = renderHook(() => useInitializeData());
      await expect(result.current.handleUnlock('pw')).rejects.toThrow('Missing encryption data');
    });
  });
});
