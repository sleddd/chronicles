import { describe, it, expect, vi, beforeEach } from 'vitest';

const reserveIds = vi.fn();
const reseal = vi.fn();
const upsert = vi.fn().mockResolvedValue({});
vi.mock('../../services/api.js', () => ({
  entries: { reserveIds: (n: number) => reserveIds(n), reseal: (e: unknown) => reseal(e) },
  settings: { upsert: (...a: unknown[]) => upsert(...a) },
}));

import {
  reserveEntryId, clearReservedEntryIds, resealOlderEntries, olderEntriesAllowed, setOlderEntriesAllowed, ENTRIES_SEAL_MARKER,
} from '../../services/entryReseal.js';
import type { DecryptedPost } from '@shared/crypto/types.js';

const encryptPost = vi.fn(async (id: number) => ({ contentEncrypted: `c${id}`, contentIv: 'i', metadataEncrypted: 'm', metadataIv: 'mi' }));
const encryptBytes = vi.fn(async (d: ArrayBuffer) => ({ ciphertext: d, iv: 'iv' }));
const entry = (id: number, older = true): DecryptedPost => ({
  id, content: `e${id}`, metadata: {}, isEncrypted: true,
  createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-02T03:04:05.678Z'),
  ...(older && { needsReseal: true as const }),
});

beforeEach(() => {
  vi.clearAllMocks();
  clearReservedEntryIds();
  setOlderEntriesAllowed(true);
});

describe('reserving ids for new entries', () => {
  it('reserves a batch and hands them out one by one', async () => {
    reserveIds.mockResolvedValueOnce({ ids: [5, 6, 7] });
    expect(await reserveEntryId()).toBe(5);
    expect(await reserveEntryId()).toBe(6);
    expect(reserveIds).toHaveBeenCalledTimes(1);
  });

  it('never hands one account\'s reserved ids to the next (cleared on lock)', async () => {
    reserveIds.mockResolvedValueOnce({ ids: [5, 6] }).mockResolvedValueOnce({ ids: [40] });
    await reserveEntryId();
    clearReservedEntryIds();
    expect(await reserveEntryId()).toBe(40);
  });

  it('shares one request between concurrent callers', async () => {
    reserveIds.mockResolvedValueOnce({ ids: [1, 2] });
    const [a, b] = await Promise.all([reserveEntryId(), reserveEntryId()]);
    expect([a, b].sort()).toEqual([1, 2]);
    expect(reserveIds).toHaveBeenCalledTimes(1);
  });
});

describe('the one-time move to id-bound entries', () => {
  it('re-saves only older entries, bound to their id, then writes the marker and stops allowing older formats', async () => {
    reseal.mockImplementation(async (batch: unknown[]) => ({ resealed: batch.length }));
    const n = await resealOlderEntries([entry(1), entry(2, false), entry(3)], encryptPost, encryptBytes);
    expect(n).toBe(2);
    expect(encryptPost.mock.calls.map(c => c[0])).toEqual([1, 3]);
    expect(reseal.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 1, updatedAt: '2026-10-02T03:04:05.678Z', contentEncrypted: 'c1' }),
      expect.objectContaining({ id: 3 }),
    ]);
    expect(upsert).toHaveBeenCalledWith(ENTRIES_SEAL_MARKER, expect.objectContaining({ v: 2 }));
    expect(olderEntriesAllowed()).toBe(false);
  });

  it('sends at most 100 entries per request', async () => {
    reseal.mockImplementation(async (batch: unknown[]) => ({ resealed: batch.length }));
    await resealOlderEntries(Array.from({ length: 250 }, (_, i) => entry(i + 1)), encryptPost, encryptBytes);
    expect(reseal.mock.calls.map(c => (c[0] as unknown[]).length)).toEqual([100, 100, 50]);
  });

  it('writes no marker when an entry was skipped (edited meanwhile), so the next load tries again', async () => {
    reseal.mockResolvedValue({ resealed: 1 });
    await resealOlderEntries([entry(1), entry(2)], encryptPost, encryptBytes);
    expect(upsert).not.toHaveBeenCalled();
    expect(olderEntriesAllowed()).toBe(true);
  });

  it('writes no marker when a request fails', async () => {
    reseal.mockRejectedValue(new Error('offline'));
    await expect(resealOlderEntries([entry(1)], encryptPost, encryptBytes)).rejects.toThrow('offline');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('a new account (nothing older) is marked straight away', async () => {
    await resealOlderEntries([entry(1, false)], encryptPost, encryptBytes);
    expect(reseal).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(ENTRIES_SEAL_MARKER, expect.anything());
  });
});
