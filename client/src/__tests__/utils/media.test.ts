import { describe, it, expect } from 'vitest';
import {
  clampRating, formatRating, shelfLabel, shelfFilterLabel, isMediaTopic, mediaTopicIds, legacyMediaType,
  mediaItems, mediaSubtitle, filterMedia, sortMedia, EMPTY_MEDIA_FILTER, mediaFilterCount,
  parseLegacyRating, parseLegacyShelf, titleFromText, titleFromTextParts, looksLikeTv, legacyMediaFields, entryImageRef,
} from '@/utils/media';
import { missingDefaultTopics } from '@/utils/defaultTopics';

const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const entry = (id: number, fields: Record<string, unknown>, extra: Record<string, unknown> = {}, content = '<p>x</p>', created = '2026-11-0' + id) => ({
  id, content, createdAt: new Date(`${created}T12:00:00`), metadata: { _taxonomyId: 7, _customFields: fields, ...extra },
});

describe('ratings', () => {
  it('keeps ratings to halves within 0–5', () => {
    expect(clampRating(4.3)).toBe(4.5);
    expect(clampRating(4.2)).toBe(4);
    expect(clampRating(9)).toBe(5);
    expect(clampRating(-1)).toBe(0);
    expect(clampRating('3.5')).toBe(3.5);
    expect(clampRating(undefined)).toBe(0);
  });

  it('formats without a trailing .0', () => {
    expect(formatRating(4)).toBe('4');
    expect(formatRating(4.5)).toBe('4.5');
  });

  it('reads old ratings out of 5, out of 10 and with words', () => {
    expect(parseLegacyRating('4/5')).toBe(4);
    expect(parseLegacyRating('8/10')).toBe(4);
    expect(parseLegacyRating('4.5 stars')).toBe(4.5);
    expect(parseLegacyRating(9)).toBe(4.5);
    expect(parseLegacyRating('great')).toBe(0);
  });
});

describe('shelves and types', () => {
  it('names the shelf by the type', () => {
    expect(shelfLabel('current', 'book')).toBe('Reading');
    expect(shelfLabel('want', 'movie')).toBe('Want to watch');
    expect(shelfLabel('done', 'music')).toBe('Listened');
    expect(shelfLabel('', 'tv')).toBe('No shelf');
    expect(shelfLabel('paused', 'book')).toBe('Paused');
    expect(shelfLabel('dnf', 'movie')).toBe('Didn’t finish');
    expect(shelfFilterLabel('dnf')).toBe('Didn’t finish');
    expect(shelfFilterLabel('current')).toBe('Active');
    expect(shelfFilterLabel('want')).toBe('Saved');
  });

  it('knows the Media topic and the old ones', () => {
    expect(isMediaTopic('Media')).toBe(true);
    expect(isMediaTopic('media library')).toBe(true);
    expect(isMediaTopic('Books')).toBe(false);
    expect(mediaTopicIds([{ id: 1, name: 'Books' }, { id: 2, name: 'Media' }])).toEqual([2]);
    expect(legacyMediaType('Books')).toBe('book');
    expect(legacyMediaType('TV/Movies')).toBe('movie');
    expect(legacyMediaType('Music')).toBe('music');
    expect(legacyMediaType('Journal')).toBeNull();
  });

  it('is a default topic', () => {
    expect(missingDefaultTopics([]).map(t => t.name)).toContain('Media');
    expect(missingDefaultTopics([{ name: 'Media' }]).map(t => t.name)).not.toContain('Media');
  });

  it('reads old shelf words', () => {
    expect(parseLegacyShelf('Currently reading')).toBe('current');
    expect(parseLegacyShelf('want to watch')).toBe('want');
    expect(parseLegacyShelf('Finished')).toBe('done');
    expect(parseLegacyShelf('Watched')).toBe('done');
    expect(parseLegacyShelf('Paused')).toBe('paused');
    expect(parseLegacyShelf('On hold')).toBe('paused');
    expect(parseLegacyShelf('DNF')).toBe('dnf');
    expect(parseLegacyShelf("Didn't finish")).toBe('dnf');
    expect(parseLegacyShelf('Abandoned')).toBe('dnf');
    expect(parseLegacyShelf('')).toBe('');
  });
});

describe('items', () => {
  const entries = [
    entry(1, { mediaTitle: 'Dune', mediaType: 'book', creator: 'Frank Herbert', year: '1965', rating: 4.5, shelf: 'done' }),
    entry(2, { mediaTitle: 'Blue', mediaType: 'music', creator: 'Joni Mitchell', album: '', year: '1971', rating: 5, shelf: 'current', cover: { dataUrl: 'data:image/jpeg;base64,AAAA', source: 'itunes' } }),
    entry(3, { mediaTitle: 'Severance', mediaType: 'tv', season: 'Season 2', rating: 0, shelf: 'want' }, { _images: [{ key: 'img/a', iv: 'iv', thumbKey: 'img/a-t', thumbIv: 'tiv', mimeType: 'image/jpeg' }], _featuredKey: 'img/a' }),
    entry(4, { mediaTitle: '', mediaType: 'bogus', rating: 'x', cover: { dataUrl: 'https://evil.example/x.jpg' } }, {}, '<p>Untitled thing here</p>'),
    { id: 5, content: '<p>not media</p>', createdAt: new Date(), metadata: { _taxonomyId: 8, _customFields: { mediaTitle: 'Nope' } } },
  ];
  const items = mediaItems(entries, [7], strip);

  it('reads the Media topic only, newest first, with safe defaults', () => {
    expect(items.map(i => i.id)).toEqual([4, 3, 2, 1]);
    const odd = items.find(i => i.id === 4)!;
    expect(odd.type).toBe('book');
    expect(odd.rating).toBe(0);
    expect(odd.shelf).toBe('');
    expect(odd.title).toBe('Untitled thing here');
    // Only a data URL counts as a cover — never an address
    expect(odd.cover).toBeUndefined();
    expect(items.find(i => i.id === 2)!.cover).toMatch(/^data:image\/jpeg/);
  });

  it('uses the entry’s own thumbnail when it has one', () => {
    expect(items.find(i => i.id === 3)!.image).toEqual({ key: 'img/a-t', iv: 'tiv', mimeType: 'image/jpeg', focusX: undefined, focusY: undefined });
    expect(entryImageRef(undefined)).toBeUndefined();
  });

  it('writes a subtitle by type', () => {
    expect(mediaSubtitle(items.find(i => i.id === 1)!)).toBe('Frank Herbert · 1965');
    expect(mediaSubtitle({ type: 'music', creator: 'Joni Mitchell', album: 'Blue', season: '', year: '1971' })).toBe('Joni Mitchell · Blue · 1971');
    expect(mediaSubtitle(items.find(i => i.id === 3)!)).toBe('Season 2');
  });

  it('filters by type, shelf, rating and every word of a search', () => {
    expect(filterMedia(items, { ...EMPTY_MEDIA_FILTER, type: 'book' }).map(i => i.id)).toEqual([4, 1]);
    expect(filterMedia(items, { ...EMPTY_MEDIA_FILTER, shelf: 'current' }).map(i => i.id)).toEqual([2]);
    expect(filterMedia(items, { ...EMPTY_MEDIA_FILTER, minRating: 4.5 }).map(i => i.id)).toEqual([2, 1]);
    expect(filterMedia(items, { ...EMPTY_MEDIA_FILTER, query: 'joni 1971' }).map(i => i.id)).toEqual([2]);
    expect(filterMedia(items, { ...EMPTY_MEDIA_FILTER, query: 'joni 1965' })).toEqual([]);
    expect(mediaFilterCount({ ...EMPTY_MEDIA_FILTER, type: 'tv', minRating: 3 })).toBe(2);
  });

  it('sorts by rating, title and type', () => {
    expect(sortMedia(items, 'rating').map(i => i.id)).toEqual([2, 1, 4, 3]);
    expect(sortMedia(items, 'title').map(i => i.title)).toEqual(['Blue', 'Dune', 'Severance', 'Untitled thing here']);
    expect(sortMedia(items, 'type').map(i => i.id)).toEqual([1, 4, 3, 2]);
    expect(sortMedia(items, 'newest').map(i => i.id)).toEqual([4, 3, 2, 1]);
  });
});

describe('moving the old topics', () => {
  it('pulls a title out of free text', () => {
    expect(titleFromText('Watched Severance S2 — the worldbuilding keeps getting deeper.')).toBe('Severance');
    expect(titleFromText('Reading "Designing Data-Intensive Applications" by Martin Kleppmann — chapter on replication')).toBe('Designing Data-Intensive Applications');
    expect(titleFromTextParts('Finished "Tomorrow, and Tomorrow, and Tomorrow" by Gabrielle Zevin. The middle section wrecked me.'))
      .toEqual({ title: 'Tomorrow, and Tomorrow, and Tomorrow', creator: 'Gabrielle Zevin', season: '' });
    expect(titleFromTextParts('Watched Severance S2 — the worldbuilding keeps getting deeper.'))
      .toEqual({ title: 'Severance', creator: '', season: 'Season 2' });
    expect(titleFromTextParts('Breaking Bad season 5 was the best of them')).toEqual({ title: 'Breaking Bad season 5 was the best of them', creator: '', season: '' });
    // "by" followed by lower-case words isn't an author
    expect(titleFromTextParts('Stunned by how good this was')).toEqual({ title: 'Stunned by how good this was', creator: '', season: '' });
    expect(titleFromText('Discovered Khruangbin: incredible blend of funk. On repeat')).toBe('Khruangbin');
    expect(looksLikeTv('Watched Severance S2')).toBe(true);
    expect(looksLikeTv('Past Lives was quiet')).toBe(false);
  });

  it('maps user-defined fields by label and keeps the writing as notes', () => {
    const defs = [
      { id: 'f1', label: 'Title', type: 'text' as const },
      { id: 'f2', label: 'Author', type: 'text' as const },
      { id: 'f3', label: 'Rating', type: 'text' as const },
      { id: 'f4', label: 'Status', type: 'text' as const },
      { id: 'f5', label: 'Pages', type: 'number' as const },
    ];
    const e = { id: 1, content: '<p>Tomorrow, and Tomorrow, and Tomorrow — Gabrielle Zevin · 4/5</p>', createdAt: new Date(),
      metadata: { _taxonomyId: 3, _customFields: { _userFields: { f1: 'Tomorrow, and Tomorrow, and Tomorrow', f2: 'Gabrielle Zevin', f3: '4/5', f4: 'Finished', f5: 400 }, _importKey: 'k' } } };
    const moved = legacyMediaFields(e, 'Books', defs, strip)!;
    expect(moved.fields.mediaType).toBe('book');
    expect(moved.fields.mediaTitle).toBe('Tomorrow, and Tomorrow, and Tomorrow');
    expect(moved.fields.creator).toBe('Gabrielle Zevin');
    expect(moved.fields.rating).toBe(4);
    expect(moved.fields.shelf).toBe('done');
    // A fields-only summary isn't notes; an unmapped field is kept there
    expect(moved.fields.notes).toBe('Pages: 400');
    expect((moved.fields as unknown as Record<string, unknown>)._importKey).toBe('k');
  });

  it('turns a plain text entry into a titled media entry with the text as notes', () => {
    const e = { id: 2, content: '<p>Watched Severance S2 — the worldbuilding keeps getting deeper.</p>', createdAt: new Date(), metadata: { _taxonomyId: 4, _customFields: {} } };
    const moved = legacyMediaFields(e, 'TV/Movies', [], strip)!;
    expect(moved.fields.mediaType).toBe('tv');
    expect(moved.fields.mediaTitle).toBe('Severance');
    expect(moved.fields.season).toBe('Season 2');
    expect(moved.fields.notes).toBe('Watched Severance S2 — the worldbuilding keeps getting deeper.');
    expect(moved.fields.shelf).toBe('');
    expect(legacyMediaFields(e, 'Journal', [], strip)).toBeNull();
  });
});
