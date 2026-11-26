import { describe, it, expect, vi, beforeEach } from 'vitest';

const del = vi.fn();
const delMany = vi.fn();
vi.mock('@/services/api', async () => {
  class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
  return { entries: { delete: (id: number) => del(id), deleteMany: (ids: number[]) => delMany(ids) }, ApiError };
});
vi.mock('@/services/imageStorage', () => ({ collectImageKeys: () => [], bestEffortDeleteImages: vi.fn() }));

import { deleteEntryWithImages, deleteEntriesWithImages } from '@/utils/entryActions';
import { useEntriesStore } from '@/stores/entriesStore';
import { getFlash, clearFlash } from '@/services/flashNotice';
import { ApiError } from '@/services/api';

const entry = (id: number) => ({ id, content: `<p>${id}</p>`, metadata: {}, isEncrypted: true, createdAt: new Date(), updatedAt: new Date() });

describe('deleteEntryWithImages', () => {
  beforeEach(() => {
    del.mockReset();
    clearFlash();
    useEntriesStore.setState({ decryptedEntries: [entry(1), entry(2)] as never, rawEntries: [] });
  });

  it('removes the entry at once, before the server answers', async () => {
    let finish!: () => void;
    del.mockReturnValue(new Promise<void>(r => { finish = r; }));
    const done = deleteEntryWithImages(1);
    expect(useEntriesStore.getState().decryptedEntries.map(e => e.id)).toEqual([2]);
    finish();
    await done;
    expect(useEntriesStore.getState().decryptedEntries.map(e => e.id)).toEqual([2]);
    expect(getFlash()).toBeNull();
  });

  it('puts it back and says so when the server delete fails', async () => {
    del.mockRejectedValue(new Error('offline'));
    await expect(deleteEntryWithImages(1)).rejects.toThrow('offline');
    expect(useEntriesStore.getState().decryptedEntries.map(e => e.id).sort()).toEqual([1, 2]);
    expect(getFlash()).toMatch(/Couldn’t delete that entry/);
  });

  it('treats already-gone (404) as done', async () => {
    del.mockRejectedValue(new (ApiError as unknown as new (s: number, m: string) => Error)(404, 'Not found'));
    await deleteEntryWithImages(1);
    expect(useEntriesStore.getState().decryptedEntries.map(e => e.id)).toEqual([2]);
    expect(getFlash()).toBeNull();
  });
});

describe('deleteEntriesWithImages', () => {
  beforeEach(() => {
    delMany.mockReset();
    clearFlash();
    useEntriesStore.setState({ decryptedEntries: [entry(1), entry(2), entry(3), entry(4)] as never, rawEntries: [] });
  });

  it('removes them all at once and sends one call for the lot, each id once', async () => {
    let finish!: (v: { deleted: number[] }) => void;
    delMany.mockReturnValue(new Promise(r => { finish = r; }));
    const done = deleteEntriesWithImages([1, 2, 2, 3]);
    expect(useEntriesStore.getState().decryptedEntries.map(e => e.id)).toEqual([4]);
    finish({ deleted: [1, 2, 3] });
    expect(await done).toEqual([1, 2, 3]);
    expect(delMany).toHaveBeenCalledTimes(1);
    expect(delMany).toHaveBeenCalledWith([1, 2, 3]);
    expect(getFlash()).toBeNull();
  });

  it('puts back only the ones that were not deleted, with one note, and does not throw', async () => {
    delMany.mockResolvedValue({ deleted: [1], error: new Error('offline') });
    expect(await deleteEntriesWithImages([1, 2, 3])).toEqual([1]);
    expect(useEntriesStore.getState().decryptedEntries.map(e => e.id).sort()).toEqual([2, 3, 4]);
    expect(getFlash()).toMatch(/Couldn’t delete 2 entries/);
  });

  it('says "that entry" when one is left', async () => {
    delMany.mockResolvedValue({ deleted: [], error: new Error('offline') });
    expect(await deleteEntriesWithImages([1])).toEqual([]);
    expect(getFlash()).toMatch(/Couldn’t delete that entry/);
  });

  it('does nothing for an empty list', async () => {
    expect(await deleteEntriesWithImages([])).toEqual([]);
    expect(delMany).not.toHaveBeenCalled();
  });
});
