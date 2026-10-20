import { describe, it, expect, vi, beforeEach } from 'vitest';

const del = vi.fn();
vi.mock('@/services/api', async () => {
  class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
  return { entries: { delete: (id: number) => del(id) }, ApiError };
});
vi.mock('@/services/imageStorage', () => ({ collectImageKeys: () => [], bestEffortDeleteImages: vi.fn() }));

import { deleteEntryWithImages } from '@/utils/entryActions';
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
