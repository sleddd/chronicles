/*
 * The media journal — books, movies, TV shows and music on shelves.
 * Pure helpers shared by the Media form (fields), the Media view (cards,
 * filters, sorting), the title it saves and the one-time move of the old
 * Books / Music / TV/Movies topics into Media. No DOM, no stores.
 */

import type { UserFieldDef } from '../types/userFields.js';

export type MediaType = 'book' | 'movie' | 'tv' | 'music';
/** '' = on no shelf */
export type MediaShelf = 'current' | 'want' | 'done' | 'paused' | 'dnf' | '';

/** A cover found for the entry — a small JPEG kept inside the encrypted entry */
export interface MediaCover {
  /** data:image/jpeg;base64,… */
  dataUrl: string;
  source: 'openlibrary' | 'itunes' | 'tvmaze' | 'wikipedia';
  width?: number;
  height?: number;
}

export interface MediaFieldValues {
  /** The entry's name — the book / film / show / album title */
  mediaTitle: string;
  mediaType: MediaType;
  /** Author / director / creator / artist, by type */
  creator: string;
  /** Music: the album a song is on (blank for an album itself) */
  album?: string;
  /** TV: "Season 2", "S1–3" */
  season?: string;
  year: string;
  genre: string;
  /** 0 = unrated, else 0.5 … 5 in halves */
  rating: number;
  shelf: MediaShelf;
  notes: string;
  cover?: MediaCover | null;
}

export const MEDIA_DEFAULTS: MediaFieldValues = {
  mediaTitle: '', mediaType: 'book', creator: '', album: '', season: '', year: '', genre: '',
  rating: 0, shelf: '', notes: '', cover: null,
};

export interface MediaTypeInfo {
  value: MediaType;
  label: string;
  /** Material Symbols glyph for the placeholder and filters */
  glyph: string;
  /** The label over the creator field */
  creatorLabel: string;
  titlePlaceholder: string;
  verb: 'read' | 'watch' | 'listen';
}

export const MEDIA_TYPES: MediaTypeInfo[] = [
  { value: 'book', label: 'Book', glyph: 'auto_stories', creatorLabel: 'Author', titlePlaceholder: 'Book title', verb: 'read' },
  { value: 'movie', label: 'Movie', glyph: 'movie', creatorLabel: 'Director', titlePlaceholder: 'Movie title', verb: 'watch' },
  { value: 'tv', label: 'TV show', glyph: 'tv', creatorLabel: 'Creator', titlePlaceholder: 'Show title', verb: 'watch' },
  { value: 'music', label: 'Music', glyph: 'headphones', creatorLabel: 'Artist', titlePlaceholder: 'Album or song', verb: 'listen' },
];

export const SHELVES: { value: Exclude<MediaShelf, ''>; }[] = [{ value: 'current' }, { value: 'want' }, { value: 'done' }, { value: 'paused' }, { value: 'dnf' }];
const SHELF_VALUES = new Set<string>(SHELVES.map(s => s.value));

export function mediaTypeInfo(type: string | undefined): MediaTypeInfo {
  return MEDIA_TYPES.find(t => t.value === type) ?? MEDIA_TYPES[0];
}

/** "Reading" / "Want to watch" / "Listened" — the shelf's name for a type */
export function shelfLabel(shelf: MediaShelf, type: MediaType = 'book'): string {
  const verb = mediaTypeInfo(type).verb;
  const ing = { read: 'Reading', watch: 'Watching', listen: 'Listening' }[verb];
  const past = { read: 'Read', watch: 'Watched', listen: 'Listened' }[verb];
  if (shelf === 'current') return ing;
  if (shelf === 'want') return `Want to ${verb}`;
  if (shelf === 'done') return past;
  if (shelf === 'paused') return 'Paused';
  if (shelf === 'dnf') return 'Didn’t finish';
  return 'No shelf';
}

/** The shelf's name across every type, for the filter: Active / Saved / Finished / Paused / Didn’t finish */
export function shelfFilterLabel(shelf: Exclude<MediaShelf, ''>): string {
  if (shelf === 'current') return 'Active';
  if (shelf === 'want') return 'Saved';
  if (shelf === 'paused') return 'Paused';
  if (shelf === 'dnf') return 'Didn’t finish';
  return 'Finished';
}

/** Rating kept to halves within 0–5 */
export function clampRating(r: unknown): number {
  const n = typeof r === 'number' ? r : typeof r === 'string' ? parseFloat(r) : 0;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(5, Math.round(n * 2) / 2);
}

/** "4.5" / "4" — no trailing .0 */
export function formatRating(r: number): string {
  const n = clampRating(r);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Whether a topic is the media journal (its default name, or near it) */
export function isMediaTopic(name: string | undefined | null): boolean {
  const n = (name ?? '').trim().toLowerCase();
  return n === 'media' || n === 'media journal' || n === 'media library' || n === 'my media';
}

/** The ids of every media topic */
export function mediaTopicIds(topics: { id: number; name: string }[]): number[] {
  return topics.filter(t => isMediaTopic(t.name)).map(t => t.id);
}

/** Topics the old entertainment entries lived in (each read as a media type) */
export const LEGACY_MEDIA_TOPICS: Record<string, MediaType> = {
  books: 'book', book: 'book',
  music: 'music',
  'tv/movies': 'movie', 'tv & movies': 'movie', movies: 'movie', tv: 'tv', 'tv shows': 'tv',
};

export function legacyMediaType(topicName: string | undefined | null): MediaType | null {
  return LEGACY_MEDIA_TOPICS[(topicName ?? '').trim().toLowerCase()] ?? null;
}

/* ── Items for the Media view ── */

export interface MediaImageRef {
  key: string; iv: string; mimeType: string; focusX?: number; focusY?: number;
}

export interface MediaItem {
  id: number;
  title: string;
  type: MediaType;
  creator: string;
  album: string;
  season: string;
  year: string;
  genre: string;
  rating: number;
  shelf: MediaShelf;
  /** The entry's own photo (encrypted thumbnail), which wins over a found cover */
  image?: MediaImageRef;
  /** A found cover, as a data URL */
  cover?: string;
  createdAt: Date;
  fields: Record<string, unknown>;
}

type EntryLike = {
  id: number;
  content: string;
  createdAt: Date | string;
  metadata: Record<string, unknown> | undefined;
};

/** An entry's own picture as its thumbnail: the featured image, else the first */
export function entryImageRef(meta: Record<string, unknown> | undefined): MediaImageRef | undefined {
  const imgs = Array.isArray(meta?._images)
    ? meta!._images as { key: string; iv: string; thumbKey?: string; thumbIv?: string; mimeType: string; focusX?: number; focusY?: number }[]
    : [];
  const img = imgs.find(i => i.key === meta?._featuredKey) ?? imgs[0];
  if (!img) return undefined;
  const focus = { focusX: img.focusX, focusY: img.focusY };
  return img.thumbKey && img.thumbIv
    ? { key: img.thumbKey, iv: img.thumbIv, mimeType: img.mimeType, ...focus }
    : { key: img.key, iv: img.iv, mimeType: img.mimeType, ...focus };
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** The Media topic's entries as items, newest first */
export function mediaItems(entries: EntryLike[], topicIds: number[], stripHtml: (html: string) => string): MediaItem[] {
  const ids = new Set(topicIds);
  const items: MediaItem[] = [];
  for (const e of entries) {
    const meta = e.metadata ?? {};
    const tid = meta._taxonomyId;
    if (typeof tid !== 'number' || !ids.has(tid)) continue;
    const cf = (meta._customFields as Record<string, unknown> | undefined) ?? {};
    const type = MEDIA_TYPES.some(t => t.value === cf.mediaType) ? cf.mediaType as MediaType : 'book';
    const shelf = typeof cf.shelf === 'string' && SHELF_VALUES.has(cf.shelf) ? cf.shelf as MediaShelf : '';
    const cover = cf.cover && typeof cf.cover === 'object' ? (cf.cover as MediaCover).dataUrl : undefined;
    items.push({
      id: e.id,
      title: str(cf.mediaTitle) || stripHtml(e.content).trim().slice(0, 80) || 'Untitled',
      type,
      creator: str(cf.creator),
      album: str(cf.album),
      season: str(cf.season),
      year: str(cf.year),
      genre: str(cf.genre),
      rating: clampRating(cf.rating),
      shelf,
      image: entryImageRef(meta),
      cover: typeof cover === 'string' && cover.startsWith('data:image/') ? cover : undefined,
      createdAt: e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt),
      fields: cf,
    });
  }
  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id);
}

/** "Frank Herbert · 1965" / "Joni Mitchell · Blue · 1971" / "Season 2 · 2025" */
export function mediaSubtitle(item: Pick<MediaItem, 'type' | 'creator' | 'album' | 'season' | 'year'>): string {
  const parts: string[] = [];
  if (item.creator) parts.push(item.creator);
  if (item.type === 'music' && item.album) parts.push(item.album);
  if (item.type === 'tv' && item.season) parts.push(item.season);
  if (item.year) parts.push(item.year);
  return parts.join(' · ');
}

export type MediaSort = 'newest' | 'rating' | 'title' | 'type';

export interface MediaFilter {
  type: MediaType | '';
  shelf: MediaShelf;
  /** 0 = any, else at least this many stars */
  minRating: number;
  query: string;
}

export const EMPTY_MEDIA_FILTER: MediaFilter = { type: '', shelf: '', minRating: 0, query: '' };

export const MEDIA_SORTS: { value: MediaSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'rating', label: 'Rating' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'type', label: 'Type' },
];

/** Every word of the query must be in the title, creator, album, genre or year */
export function filterMedia(items: MediaItem[], filter: MediaFilter): MediaItem[] {
  const words = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(it => {
    if (filter.type && it.type !== filter.type) return false;
    if (filter.shelf && it.shelf !== filter.shelf) return false;
    if (filter.minRating > 0 && it.rating < filter.minRating) return false;
    if (words.length) {
      const hay = [it.title, it.creator, it.album, it.season, it.genre, it.year].join(' ').toLowerCase();
      if (!words.every(w => hay.includes(w))) return false;
    }
    return true;
  });
}

const TYPE_ORDER: Record<MediaType, number> = { book: 0, movie: 1, tv: 2, music: 3 };

export function sortMedia(items: MediaItem[], sort: MediaSort): MediaItem[] {
  const byNewest = (a: MediaItem, b: MediaItem) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id;
  const list = [...items];
  switch (sort) {
    case 'rating':
      return list.sort((a, b) => b.rating - a.rating || byNewest(a, b));
    case 'title':
      return list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || byNewest(a, b));
    case 'type':
      return list.sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    default:
      return list.sort(byNewest);
  }
}

/** How many filters are set (the Filters count on phones) */
export function mediaFilterCount(f: MediaFilter): number {
  return (f.type ? 1 : 0) + (f.shelf ? 1 : 0) + (f.minRating > 0 ? 1 : 0);
}

/* ── Moving the old topics into Media ── */

/** A label of one of the old topics' user-defined fields → the media field it fills */
function legacyFieldKey(label: string): keyof MediaFieldValues | null {
  const l = label.trim().toLowerCase();
  if (/^(title|name|book|book title|album|song|track|film|movie|show|series)$/.test(l)) return 'mediaTitle';
  if (/^(author|director|artist|artist name|band|creator|by|written by|directed by)$/.test(l)) return 'creator';
  if (/^(album|album name|record)$/.test(l)) return 'album';
  if (/^(season|seasons|episode|episodes)$/.test(l)) return 'season';
  if (/^(year|released|release year|published|publication year)$/.test(l)) return 'year';
  if (/^(genre|genres|category)$/.test(l)) return 'genre';
  if (/^(rating|stars|score|my rating)$/.test(l)) return 'rating';
  if (/^(status|shelf|progress)$/.test(l)) return 'shelf';
  if (/^(notes|review|thoughts|comments|summary)$/.test(l)) return 'notes';
  return null;
}

/** "4/5", "8/10", "4.5", "4 stars" → halves out of 5 */
export function parseLegacyRating(v: unknown): number {
  if (typeof v === 'number') return clampRating(v > 5 && v <= 10 ? v / 2 : v);
  if (typeof v !== 'string') return 0;
  const m = v.match(/(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+))?/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const outOf = m[2] ? parseFloat(m[2]) : (n > 5 ? 10 : 5);
  return clampRating(outOf > 0 ? (n / outOf) * 5 : n);
}

/** "reading" / "want to watch" / "finished" / "paused" / "dnf" → a shelf */
export function parseLegacyShelf(v: unknown): MediaShelf {
  if (typeof v !== 'string') return '';
  const s = v.toLowerCase();
  if (/\bdnf\b|did ?n[o']t finish|abandon|gave up|dropped|quit/.test(s)) return 'dnf';
  if (/paus|on hold|shelved|stalled|taking a break/.test(s)) return 'paused';
  if (/want|to[- ]?read|to[- ]?watch|to[- ]?listen|wishlist|queue|planned/.test(s)) return 'want';
  if (/currently|reading|watching|listening|in progress|started/.test(s)) return 'current';
  if (/finished|done|read|watched|listened|complete/.test(s)) return 'done';
  return '';
}

/** "Watched Severance S2 — the worldbuilding…" → a title for an entry that only has text */
export function titleFromText(text: string): string {
  return titleFromTextParts(text).title;
}

/** The title, and the author / season the sentence names: "“Title” by Author", "Show S2" */
export function titleFromTextParts(text: string): { title: string; creator: string; season: string } {
  let t = text.trim().split(/\n/)[0].trim();
  // Lead-ins people wrote: "Watched …", "Reading …", "Finished …", "Listening to …"
  t = t.replace(/^(?:just\s+)?(?:watched|watching|read|reading|finished|started|listening to|listened to|discovered|re-?watched|re-?read)\s+/i, '');
  // Up to a dash, a colon or the first sentence end
  t = t.split(/\s[—–-]\s|:\s/)[0];
  t = t.split(/(?<=[.!?])\s/)[0].replace(/[.!?]+$/, '');
  let creator = '';
  let season = '';
  // "“Title” by Author Name" — the author is the capitalised words after "by"
  const by = t.match(/^(.*?)\s+by\s+((?:[A-Z][\w.'’-]*)(?:\s+(?:[A-Z][\w.'’-]*|de|van|von|da|la|le))*)\s*$/);
  if (by) { t = by[1]; creator = by[2].trim(); }
  // "Severance S2" / "Severance season 2" — the season comes off the title
  const sm = t.match(/^(.*?)[\s,]+(?:S(\d{1,2})|season\s+(\d{1,2}))\s*$/i);
  if (sm && sm[1].trim()) { t = sm[1]; season = `Season ${Number(sm[2] ?? sm[3])}`; }
  t = t.replace(/^["“]+|["”]+$/g, '').replace(/[,;]+$/, '').trim();
  return { title: t.slice(0, 80), creator, season };
}

/** A sign the text is about a series rather than a film */
export function looksLikeTv(text: string): boolean {
  return /\b(season|episode|episodes|series|s\d{1,2}(?:e\d{1,2})?)\b/i.test(text);
}

export interface LegacyMove {
  fields: MediaFieldValues;
}

/**
 * The media fields for an entry from Books / Music / TV/Movies: user-defined
 * fields by label (Title, Author, Rating…), then what the text gives. The
 * entry's text is kept as it is (hidden under the form, like any name-led
 * topic) and copied into Notes when nothing filled them.
 */
export function legacyMediaFields(
  entry: EntryLike,
  topicName: string,
  defs: UserFieldDef[],
  stripHtml: (html: string) => string,
): LegacyMove | null {
  const type = legacyMediaType(topicName);
  if (!type) return null;
  const meta = entry.metadata ?? {};
  const cf = (meta._customFields as Record<string, unknown> | undefined) ?? {};
  const uf = (cf._userFields as Record<string, unknown> | undefined) ?? {};
  const fields: MediaFieldValues = { ...MEDIA_DEFAULTS, mediaType: type };
  const leftover: string[] = [];
  for (const d of defs) {
    const v = uf[d.id];
    if (v == null || v === '') continue;
    const key = legacyFieldKey(d.label);
    if (key === 'rating') fields.rating = parseLegacyRating(v);
    else if (key === 'shelf') fields.shelf = parseLegacyShelf(v);
    else if (key === 'notes') fields.notes = [fields.notes, String(v)].filter(Boolean).join('\n');
    else if (key && !fields[key]) (fields as unknown as Record<string, unknown>)[key] = String(v).trim();
    else if (d.type !== 'boolean') leftover.push(`${d.label}: ${String(v)}`);
  }
  const text = stripHtml(entry.content).trim();
  // Fields-only entries carry their own summary as the text ("Title: x · Author: y") — not notes
  const summaryText = defs.length > 0 && text.includes(' · ') && defs.some(d => text.includes(String(uf[d.id] ?? '\u0000')));
  if (!fields.mediaTitle) {
    const parts = text && !summaryText ? titleFromTextParts(text) : { title: '', creator: '', season: '' };
    fields.mediaTitle = parts.title || 'Untitled';
    if (!fields.creator && parts.creator) fields.creator = parts.creator;
    if (!fields.season && parts.season) fields.season = parts.season;
  }
  if (type === 'movie' && (looksLikeTv(text) || fields.season)) fields.mediaType = 'tv';
  if (!fields.notes && text && !summaryText && text !== fields.mediaTitle) fields.notes = text;
  if (leftover.length) fields.notes = [fields.notes, ...leftover].filter(Boolean).join('\n');
  // Keep anything else the entry carried (links, imported keys…)
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cf)) if (k !== '_userFields' && !(k in fields)) rest[k] = v;
  return { fields: { ...rest, ...fields } as MediaFieldValues };
}
