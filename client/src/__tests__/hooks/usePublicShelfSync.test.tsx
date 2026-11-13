import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePublicShelfSync, enablePublicShelf, disablePublicShelf } from '@/hooks/usePublicShelfSync';
import { usePublicShelfStore } from '@/stores/publicShelfStore';
import { setEgressAccount, publicShelfOnHere } from '@/services/deviceConsent';

const api = vi.hoisted(() => ({ put: vi.fn(), mine: vi.fn(), reset: vi.fn(), remove: vi.fn() }));
vi.mock('@/services/api', () => ({ publicShelf: api, ApiError: class extends Error {}, retryDelayMs: () => 1000 }));
vi.mock('@/services/flashNotice', () => ({ showFlash: vi.fn() }));
const entries = vi.hoisted(() => ({ decryptedEntries: [], allTopics: [], isInitialized: true }));
vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: Object.assign((pick: (s: typeof entries) => unknown) => pick(entries), { getState: () => entries }),
}));

const shelf = { token: 't'.repeat(32), title: 'My shelf', itemCount: 2, createdAt: '', updatedAt: '' };

describe('usePublicShelfSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    Object.values(api).forEach(f => f.mockReset());
    usePublicShelfStore.getState().reset();
    setEgressAccount('acct');
  });
  afterEach(() => { vi.useRealTimers(); setEgressAccount(null); });

  it('uploads nothing when only the server says a shelf exists', async () => {
    api.mine.mockResolvedValue({ publicShelf: shelf });
    renderHook(() => usePublicShelfSync(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(usePublicShelfStore.getState().publicShelf).toEqual(shelf);
    expect(usePublicShelfStore.getState().enabledHere).toBe(false);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('publishes once the owner turned it on in this browser, and stops after Turn off', async () => {
    api.put.mockResolvedValue(shelf);
    api.remove.mockResolvedValue({ success: true });
    await enablePublicShelf('My shelf');
    expect(publicShelfOnHere()).toBe(true);
    expect(api.put).toHaveBeenCalledTimes(1);

    // A later visit: the record is what lets the sync publish a change
    usePublicShelfStore.getState().reset();
    api.mine.mockResolvedValue({ publicShelf: shelf });
    renderHook(() => usePublicShelfSync(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(usePublicShelfStore.getState().enabledHere).toBe(true);
    expect(api.put).toHaveBeenCalledTimes(2);

    await act(async () => { await disablePublicShelf(); });
    expect(publicShelfOnHere()).toBe(false);
    expect(usePublicShelfStore.getState().enabledHere).toBe(false);
  });

  it('another account on this browser has no record', async () => {
    api.put.mockResolvedValue(shelf);
    await enablePublicShelf('My shelf');
    setEgressAccount('someone-else');
    expect(publicShelfOnHere()).toBe(false);
  });
});
