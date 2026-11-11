import { describe, it, expect } from 'vitest';
import {
  publicShelfItemSchema, putPublicShelfSchema, PUBLIC_SHELF_ITEMS_MAX, PUBLIC_SHELF_COVER_MAX, PUBLIC_SHELF_PAGE_SIZE,
} from '../validation/schemas.js';

const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAg=';
const item = { title: 'Dune', creator: 'Frank Herbert', year: '1965', type: 'book', rating: 4.5, shelf: 'done', cover: jpeg };

describe('public shelf schema', () => {
  it('accepts a shelf of items with JPEG covers', () => {
    const parsed = putPublicShelfSchema.safeParse({ title: 'My shelf', items: [item, { ...item, cover: undefined, shelf: '' }] });
    expect(parsed.success).toBe(true);
    expect(PUBLIC_SHELF_PAGE_SIZE).toBe(24);
  });

  it('keeps only what the public page shows — notes, progress, genre and ids are dropped', () => {
    const parsed = publicShelfItemSchema.safeParse({ ...item, notes: 'private thoughts', progress: 45, genre: 'Sci-fi', id: 12, _isFavorite: true });
    expect(parsed.success).toBe(true);
    expect(Object.keys(parsed.success ? parsed.data : {}).sort()).toEqual(['cover', 'creator', 'rating', 'shelf', 'title', 'type', 'year']);
  });

  it('refuses anything but a JPEG data URL as a cover', () => {
    expect(publicShelfItemSchema.safeParse({ ...item, cover: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }).success).toBe(false);
    expect(publicShelfItemSchema.safeParse({ ...item, cover: 'https://evil.example/x.jpg' }).success).toBe(false);
    expect(publicShelfItemSchema.safeParse({ ...item, cover: 'data:image/jpeg;base64,' + 'A'.repeat(PUBLIC_SHELF_COVER_MAX) }).success).toBe(false);
  });

  it('refuses bad ratings, types, titles and too many items', () => {
    expect(publicShelfItemSchema.safeParse({ ...item, rating: 4.3 }).success).toBe(false);
    expect(publicShelfItemSchema.safeParse({ ...item, rating: 6 }).success).toBe(false);
    expect(publicShelfItemSchema.safeParse({ ...item, type: 'game' }).success).toBe(false);
    expect(publicShelfItemSchema.safeParse({ ...item, shelf: 'maybe' }).success).toBe(false);
    expect(publicShelfItemSchema.safeParse({ ...item, title: '   ' }).success).toBe(false);
    expect(putPublicShelfSchema.safeParse({ title: '', items: [] }).success).toBe(false);
    const many = Array.from({ length: PUBLIC_SHELF_ITEMS_MAX + 1 }, () => ({ ...item, cover: undefined }));
    expect(putPublicShelfSchema.safeParse({ title: 'x', items: many }).success).toBe(false);
  });
});
