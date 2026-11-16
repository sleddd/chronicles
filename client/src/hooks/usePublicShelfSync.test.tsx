import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const put = vi.fn();
vi.mock('../services/api.js', async () => {
  class ApiError extends Error { status: number; constructor(status: number) { super('x'); this.status = status; } }
  return {
    ApiError,
    retryDelayMs: () => 10_000,
    publicShelf: { mine: vi.fn(), put: (...a: unknown[]) => put(...a), remove: vi.fn(), reset: vi.fn() },
  };
});
vi.mock('../services/flashNotice.js', () => ({ showFlash: vi.fn() }));
vi.mock('../services/deviceConsent.js', () => ({ recordPublicShelfChoice: vi.fn(), reconcilePublicShelf: vi.fn(), publicShelfOnHere: () => true }));

import { usePublicShelfSync } from './usePublicShelfSync.js';
import { usePublicShelfStore } from '../stores/publicShelfStore.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { ApiError } from '../services/api.js';

const shelf = { token: 't'.repeat(32), title: 'My shelf', itemCount: 1, createdAt: '', updatedAt: '' };

beforeEach(() => {
  vi.useFakeTimers();
  put.mockReset();
  usePublicShelfStore.getState().reset();
  usePublicShelfStore.setState({ loaded: true, publicShelf: shelf as never, enabledHere: true, lastSentBody: 'something older' });
  useEntriesStore.setState({ decryptedEntries: [], allTopics: [], isInitialized: true } as never);
});
afterEach(() => { vi.useRealTimers(); });

describe('usePublicShelfSync', () => {
  it('tries again by itself after a publish fails, without waiting for another change', async () => {
    put.mockRejectedValueOnce(new (ApiError as unknown as new (s: number) => Error)(503)).mockResolvedValue(shelf);
    renderHook(() => usePublicShelfSync(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(put).toHaveBeenCalledTimes(1);
    expect(usePublicShelfStore.getState().status).toBe('error');
    // Nothing about the shelf changes; the retry comes on its own
    await act(async () => { await vi.advanceTimersByTimeAsync(10_500); });
    expect(put).toHaveBeenCalledTimes(2);
    expect(usePublicShelfStore.getState().status).toBe('idle');
    // …and once the server has it, nothing more is sent
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(put).toHaveBeenCalledTimes(2);
  });

  it('publishes when the browser comes back online', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    put.mockResolvedValue(shelf);
    renderHook(() => usePublicShelfSync(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(put).not.toHaveBeenCalled();
    onLine.mockReturnValue(true);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(put).toHaveBeenCalledTimes(1);
    onLine.mockRestore();
  });

  it('sends nothing from a browser the shelf was not turned on in', async () => {
    usePublicShelfStore.setState({ enabledHere: false });
    renderHook(() => usePublicShelfSync(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(put).not.toHaveBeenCalled();
  });
});
