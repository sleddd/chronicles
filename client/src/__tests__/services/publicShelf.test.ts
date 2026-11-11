import { describe, it, expect } from 'vitest';
import { buildPublicShelfItems, isOnPublicShelf, pageOf, publicShelfUrl, publishableCover, ON_PUBLIC_SHELF } from '@/services/publicShelf';
import type { MediaItem } from '@/utils/media';
import { PUBLIC_SHELF_COVER_MAX } from '@shared/validation/schemas';

const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAg=';
const item = (over: Partial<MediaItem> & { id: number }): MediaItem => ({
  title: 'Dune', type: 'book', creator: 'Frank Herbert', album: '', season: '', year: '1965', genre: 'Science fiction',
  rating: 4.5, shelf: 'done', progress: 40, createdAt: new Date(), fields: { [ON_PUBLIC_SHELF]: true, notes: 'private' },
  ...over,
});

describe('what the public shelf carries', () => {
  it('publishes only bookmarked items, and only the fields the page shows', () => {
    const out = buildPublicShelfItems([
      item({ id: 1, cover: jpeg }),
      item({ id: 2, fields: {} }),
      item({ id: 3, fields: { [ON_PUBLIC_SHELF]: 'yes' } }),
    ]);
    expect(out).toHaveLength(1);
    expect(Object.keys(out[0]).sort()).toEqual(['cover', 'creator', 'rating', 'shelf', 'title', 'type', 'year']);
    expect(out[0]).toEqual({ title: 'Dune', creator: 'Frank Herbert', year: '1965', type: 'book', rating: 4.5, shelf: 'done', cover: jpeg });
    expect(isOnPublicShelf(item({ id: 9 }))).toBe(true);
    expect(isOnPublicShelf(item({ id: 9, fields: { [ON_PUBLIC_SHELF]: false } }))).toBe(false);
  });

  it('never publishes the entry’s own photo, a non-JPEG or an oversize cover', () => {
    const [noCover] = buildPublicShelfItems([item({ id: 1, image: { key: 'img/a', iv: 'x', mimeType: 'image/jpeg' } })]);
    expect(noCover.cover).toBeUndefined();
    expect(publishableCover('data:image/png;base64,iVBOR')).toBeUndefined();
    expect(publishableCover('https://static.tvmaze.com/x.jpg')).toBeUndefined();
    expect(publishableCover('data:image/jpeg;base64,' + 'A'.repeat(PUBLIC_SHELF_COVER_MAX))).toBeUndefined();
    expect(publishableCover(jpeg)).toBe(jpeg);
  });

  it('keeps the shelf order, trims, and gives a nameless item a title', () => {
    const out = buildPublicShelfItems([item({ id: 2, title: '  Blue ' }), item({ id: 1, title: '   ' })]);
    expect(out.map(i => i.title)).toEqual(['Blue', 'Untitled']);
    expect(buildPublicShelfItems([])).toEqual([]);
  });

  it('builds the link from the origin', () => {
    expect(publicShelfUrl('tok', 'https://x.example')).toBe('https://x.example/public-shelf/tok');
  });
});

describe('pageOf', () => {
  const list = Array.from({ length: 30 }, (_, i) => i + 1);
  it('slices 24 a page and clamps the page', () => {
    expect(pageOf(list, 1)).toMatchObject({ page: 1, pages: 2, total: 30 });
    expect(pageOf(list, 1).items).toHaveLength(24);
    expect(pageOf(list, 2).items).toEqual([25, 26, 27, 28, 29, 30]);
    expect(pageOf(list, 0).page).toBe(1);
    expect(pageOf(list, 9).page).toBe(2);
    expect(pageOf(list, Number.NaN).page).toBe(1);
  });
  it('treats an empty list as one empty page', () => {
    expect(pageOf([], 3)).toEqual({ items: [], page: 1, pages: 1, total: 0 });
  });
});
