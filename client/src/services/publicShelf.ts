/*
 * The public shelf — pure helpers. What the owner's browser publishes is built
 * here from the media items flagged `onPublicShelf`: only the fields the public
 * page shows (title, maker, year, type, rating, the Shelf status and a found
 * catalogue cover), never notes, progress, genre, album / season, the entry id
 * or the entry's own photo. `pageOf` is the one paging rule shared by the
 * owner's grid and the public page.
 */

import { PUBLIC_SHELF_COVER_MAX, PUBLIC_SHELF_ITEMS_MAX, PUBLIC_SHELF_PAGE_SIZE, type PublicShelfItem } from '@shared/validation/schemas';
import { clampRating, type MediaItem } from '../utils/media.js';

/** The custom field a media entry carries while it's on the public shelf (never the journal's `_isFavorite`) */
export const ON_PUBLIC_SHELF = 'onPublicShelf';

export function isOnPublicShelf(item: Pick<MediaItem, 'fields'>): boolean {
  return item.fields[ON_PUBLIC_SHELF] === true;
}

const JPEG_DATA_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

/** A found cover the public page may carry: a JPEG data URL under the cap (an entry's own photo never is) */
export function publishableCover(cover: string | undefined): string | undefined {
  return cover && cover.length <= PUBLIC_SHELF_COVER_MAX && JPEG_DATA_URL.test(cover) ? cover : undefined;
}

/** The flagged items as what the public page shows, in the shelf's order */
export function buildPublicShelfItems(items: MediaItem[]): PublicShelfItem[] {
  const out: PublicShelfItem[] = [];
  for (const item of items) {
    if (!isOnPublicShelf(item)) continue;
    const cover = publishableCover(item.cover);
    out.push({
      title: item.title.trim().slice(0, 200) || 'Untitled',
      creator: item.creator.trim().slice(0, 200),
      year: item.year.trim().slice(0, 12),
      type: item.type,
      rating: clampRating(item.rating),
      shelf: item.shelf,
      ...(cover ? { cover } : {}),
    });
    if (out.length >= PUBLIC_SHELF_ITEMS_MAX) break;
  }
  return out;
}

export function publicShelfUrl(token: string, origin = typeof location !== 'undefined' ? location.origin : ''): string {
  return `${origin}/public-shelf/${token}`;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pages: number;
  total: number;
}

/** One page of a list (1-based; a page past the end is the last one; no items = one empty page) */
export function pageOf<T>(items: T[], page: number, size = PUBLIC_SHELF_PAGE_SIZE): Paged<T> {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(pages, Math.max(1, Math.floor(page) || 1));
  const start = (current - 1) * size;
  return { items: items.slice(start, start + size), page: current, pages, total };
}
