import { describe, it, expect, vi, beforeEach } from 'vitest';

const remove = vi.hoisted(() => vi.fn());
vi.mock('@/services/imageStorage', () => ({
  bestEffortDeleteImages: remove,
  collectImageKeys: (entries: { metadata: { _images?: { key: string; thumbKey: string }[] } }[]) =>
    entries.flatMap(e => (e.metadata._images ?? []).flatMap(i => [i.key, i.thumbKey])),
}));

import { dropUnusedImage, replaceStoredImage } from '@/services/backgroundImages';
import { useEntriesStore } from '@/stores/entriesStore';
import type { EntryImage } from '@/services/imageStorage';

const photo = (n: number): EntryImage => ({
  key: `img/0000000${n}-0000-4000-8000-000000000000`, iv: 'aXY=',
  thumbKey: `img/0000000${n}-0000-4000-8000-000000000000-t`, thumbIv: 'aXY=',
  mimeType: 'image/jpeg', size: 1,
});
const keys = (p: EntryImage) => [p.key, p.thumbKey];
const journal = (images: EntryImage[], isInitialized = true) =>
  useEntriesStore.setState({ isInitialized, decryptedEntries: [{ id: 1, content: '', metadata: { _images: images } }] } as never);

beforeEach(() => { remove.mockReset(); journal([]); });

describe('dropUnusedImage', () => {
  it('deletes a photo no entry has, and keeps one an entry has', () => {
    dropUnusedImage(photo(1));
    expect(remove).toHaveBeenCalledWith(keys(photo(1)));
    remove.mockReset();
    journal([photo(2)]);
    dropUnusedImage(photo(2));
    expect(remove).not.toHaveBeenCalled();
  });

  it('does nothing until the journal is loaded', () => {
    journal([], false);
    dropUnusedImage(photo(1));
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('replaceStoredImage', () => {
  it('lets the old photo go only after the save has succeeded', async () => {
    let finish!: () => void;
    const save = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const repin = vi.fn();
    const done = replaceStoredImage({ old: photo(1), next: photo(2), save, repin });
    await Promise.resolve();
    expect(remove).not.toHaveBeenCalled();
    finish();
    expect(await done).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(keys(photo(1)));
    expect(repin).not.toHaveBeenCalled();
  });

  it('a failed save keeps the old photo, puts its pins back and removes the new upload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const order: string[] = [];
    remove.mockImplementation(() => { order.push('remove'); });
    const repin = vi.fn(() => { order.push('repin'); });
    const saved = await replaceStoredImage({ old: photo(1), next: photo(2), save: () => Promise.reject(new Error('offline')), repin });
    expect(saved).toBe(false);
    expect(order).toEqual(['repin', 'remove']);
    expect(remove).toHaveBeenCalledWith(keys(photo(2)));
  });

  it('a failed save never removes a photo taken from the library', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    journal([photo(2)]);
    await replaceStoredImage({ old: photo(1), next: photo(2), save: () => Promise.reject(new Error('offline')), repin: () => {} });
    expect(remove).not.toHaveBeenCalled();
  });

  it('removing the photo deletes it once saved, and the same photo again deletes nothing', async () => {
    expect(await replaceStoredImage({ old: photo(1), next: null, save: () => Promise.resolve(), repin: () => {} })).toBe(true);
    expect(remove).toHaveBeenCalledWith(keys(photo(1)));
    remove.mockReset();
    await replaceStoredImage({ old: photo(1), next: photo(1), save: () => Promise.resolve(), repin: () => {} });
    expect(remove).not.toHaveBeenCalled();
  });
});
