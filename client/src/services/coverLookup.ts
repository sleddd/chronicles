/*
 * Cover lookup for the media journal — three fixed catalogues, never a
 * user-typed address:
 *   books            Open Library (search + covers; the cover files redirect to archive.org)
 *   music            Apple's iTunes Search API (artwork on mzstatic.com)
 *   TV shows         TVmaze (posters on static.tvmaze.com), then Wikipedia
 *   movies           Wikipedia (the article's lead image — the poster)
 * The hosts are listed here and in the server's CSP; `isAllowedCoverUrl`
 * refuses anything else before a fetch. The chosen image is fetched once,
 * shrunk to a small JPEG in the browser and kept inside the encrypted entry,
 * so showing a shelf never calls out. Only the title (and creator) typed in
 * the form are sent, and only when Find cover is pressed.
 */

import type { MediaCover, MediaType } from '../utils/media.js';
import type { MediaDetails } from './mediaDetails.js';

export const COVER_HOSTS: readonly string[] = [
  'openlibrary.org', 'covers.openlibrary.org', 'archive.org',
  'itunes.apple.com',
  'api.tvmaze.com', 'static.tvmaze.com',
  'en.wikipedia.org', 'upload.wikimedia.org',
];
/** Hosts whose every subdomain is allowed (archive.org's cover mirrors, Apple's artwork CDN) */
const COVER_HOST_SUFFIXES: readonly string[] = ['.archive.org', '.mzstatic.com'];

export function isAllowedCoverUrl(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return COVER_HOSTS.includes(host) || COVER_HOST_SUFFIXES.some(s => host.endsWith(s));
}

export interface CoverCandidate {
  title: string;
  /** Author / artist / "2010 film by …" */
  detail: string;
  imageUrl: string;
  source: MediaCover['source'];
  /** What the catalogue says about it, to fill blank fields with */
  details: MediaDetails;
}

const GENRE_WORDS = [
  'science fiction', 'fantasy', 'mystery', 'thriller', 'romance', 'horror', 'historical fiction', 'literary fiction', 'crime',
  'biography', 'memoir', 'history', 'poetry', 'self-help', 'business', 'philosophy', 'psychology', 'science', 'travel', 'cooking',
  'humor', 'classics', "children's", 'young adult', 'essays', 'graphic novel', 'nonfiction', 'fiction',
];

/** The first Open Library subject that reads as a genre ("Science fiction"), else '' */
export function genreFromSubjects(subjects: unknown): string {
  if (!Array.isArray(subjects)) return '';
  const subs = (subjects as unknown[]).filter((s): s is string => typeof s === 'string').map(s => s.toLowerCase());
  for (const g of GENRE_WORDS) {
    const hit = subs.find(s => s === g || s.startsWith(g + ' ') || s.endsWith(' ' + g) || s === g + 's');
    if (hit) return g.charAt(0).toUpperCase() + g.slice(1);
  }
  return '';
}

const SCREEN_GENRES = ['science fiction', 'romantic comedy', 'comedy-drama', 'crime drama', 'psychological thriller', 'thriller', 'horror', 'comedy', 'drama', 'documentary', 'animated', 'fantasy', 'western', 'musical', 'romance', 'action', 'adventure', 'mystery', 'war', 'sitcom'];

/** "2010 film by Christopher Nolan" / "2022 American science fiction thriller television series created by Dan Erickson" */
export function detailsFromDescription(desc: string): MediaDetails {
  const d: MediaDetails = {};
  const year = desc.match(/\b(19|20)\d{2}\b/);
  if (year) d.year = year[0];
  const who = desc.match(/(?:film|movie|series)\s+(?:by|directed by|created by)\s+([^,.;()]+)/i) ?? desc.match(/\b(?:directed|created)\s+by\s+([^,.;()]+)/i);
  if (who) d.creator = who[1].replace(/\s+and\s+.*$/i, m => m).trim();
  const low = desc.toLowerCase();
  const g = SCREEN_GENRES.find(g => low.includes(g));
  if (g) d.genre = g.charAt(0).toUpperCase() + g.slice(1);
  return d;
}

const q = (s: string) => encodeURIComponent(s.trim());
const LIMIT = 6;

/* ── Search URLs (pure, tested) ── */

export function openLibrarySearchUrl(title: string, author: string): string {
  const p = new URLSearchParams({ title: title.trim(), limit: String(LIMIT), fields: 'title,author_name,cover_i,first_publish_year,subject' });
  if (author.trim()) p.set('author', author.trim());
  return `https://openlibrary.org/search.json?${p.toString()}`;
}

export function openLibraryCoverUrl(coverId: number): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
}

export function itunesSearchUrl(title: string, artist: string): string {
  const term = [title, artist].map(s => s.trim()).filter(Boolean).join(' ');
  return `https://itunes.apple.com/search?term=${q(term)}&media=music&entity=album,song&limit=${LIMIT}`;
}

/** The 100×100 artwork URL, asked for at a usable size */
export function itunesArtworkUrl(artworkUrl100: string): string {
  return artworkUrl100.replace(/\/\d+x\d+(bb)?(-\d+)?\.(jpg|png|webp)$/i, '/600x600bb.jpg');
}

/** Wikipedia names its articles "Severance (TV series)" / "Inception (film)" —
 *  the title must be in the article's name, and the kind steers the ranking */
export function wikipediaSearchUrl(title: string, type: MediaType, year: string): string {
  const kind = type === 'tv' ? 'TV series' : 'film';
  const clean = title.trim().replace(/"/g, '');
  const term = [`intitle:"${clean}"`, year.trim(), kind].filter(Boolean).join(' ');
  const p = new URLSearchParams({ action: 'query', list: 'search', srsearch: term, srlimit: String(LIMIT * 2), format: 'json', origin: '*' });
  return `https://en.wikipedia.org/w/api.php?${p.toString()}`;
}

const SCREEN_WORDS = /\b(film|movie|television|tv series|miniseries|series|sitcom|anime|documentary)\b/i;
const PERSON_WORDS = /\b(actor|actress|model|singer|musician|born|politician|footballer|player|writer|author)\b/i;

const PART_WORDS = /\b(episode|season|accolades|soundtrack|list of)\b/i;

/** The film or series itself first, then its episodes / seasons / soundtrack,
 *  then anything else, people last (a show's name is often someone's surname) */
export function rankWikipedia(cands: CoverCandidate[], type: MediaType): CoverCandidate[] {
  const kindWord = type === 'tv' ? /television|tv series|miniseries|sitcom|anime|web series/i : /\bfilm\b|movie/i;
  const score = (c: CoverCandidate) => {
    const d = c.detail;
    const part = PART_WORDS.test(d) || PART_WORDS.test(c.title);
    if (kindWord.test(d) && !part) return 0;
    if (SCREEN_WORDS.test(d) || part) return 1;
    if (PERSON_WORDS.test(d)) return 3;
    return 2;
  };
  return cands.map((c, i) => ({ c, i, s: score(c) })).sort((a, b) => a.s - b.s || a.i - b.i).map(x => x.c);
}

/** Wikipedia's own names for a film or show, tried straight: "Severance (TV series)", "Inception (2010 film)", the bare title */
export function wikipediaGuesses(title: string, type: MediaType, year: string): string[] {
  const t = title.trim();
  const y = year.trim();
  const guesses = type === 'tv'
    ? [`${t} (TV series)`, y && `${t} (${y} TV series)`, `${t} (American TV series)`, `${t} (British TV series)`, `${t} (miniseries)`, t]
    : [`${t} (film)`, y && `${t} (${y} film)`, t];
  return guesses.filter((g): g is string => !!g);
}

export function tvmazeSearchUrl(title: string): string {
  return `https://api.tvmaze.com/search/shows?q=${q(title)}`;
}

export function wikipediaSummaryUrl(pageTitle: string): string {
  return `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`;
}

/* ── Answer parsing (pure, tested) ── */

export function parseOpenLibrary(json: unknown): CoverCandidate[] {
  const docs = (json as { docs?: unknown[] })?.docs;
  if (!Array.isArray(docs)) return [];
  const out: CoverCandidate[] = [];
  for (const d of docs as Record<string, unknown>[]) {
    if (typeof d.cover_i !== 'number' || typeof d.title !== 'string') continue;
    const authors = Array.isArray(d.author_name) ? (d.author_name as string[]).slice(0, 2).join(', ') : '';
    const year = typeof d.first_publish_year === 'number' ? String(d.first_publish_year) : '';
    const details: MediaDetails = {};
    if (authors) details.creator = authors;
    if (year) details.year = year;
    const genre = genreFromSubjects(d.subject);
    if (genre) details.genre = genre;
    out.push({ title: d.title, detail: [authors, year].filter(Boolean).join(' · '), imageUrl: openLibraryCoverUrl(d.cover_i), source: 'openlibrary', details });
  }
  return out;
}

export function parseItunes(json: unknown): CoverCandidate[] {
  const results = (json as { results?: unknown[] })?.results;
  if (!Array.isArray(results)) return [];
  const out: CoverCandidate[] = [];
  const seen = new Set<string>();
  for (const r of results as Record<string, unknown>[]) {
    const art = typeof r.artworkUrl100 === 'string' ? r.artworkUrl100 : '';
    if (!art) continue;
    const name = typeof r.collectionName === 'string' ? r.collectionName : typeof r.trackName === 'string' ? r.trackName : '';
    if (!name) continue;
    const url = itunesArtworkUrl(art);
    if (seen.has(url)) continue;
    seen.add(url);
    const artist = typeof r.artistName === 'string' ? r.artistName : '';
    const year = typeof r.releaseDate === 'string' ? r.releaseDate.slice(0, 4) : '';
    const kind = r.wrapperType === 'track' ? 'Song' : 'Album';
    const details: MediaDetails = {};
    if (artist) details.creator = artist;
    if (year) details.year = year;
    if (typeof r.primaryGenreName === 'string') details.genre = r.primaryGenreName;
    if (kind === 'Song' && typeof r.collectionName === 'string') details.album = r.collectionName;
    out.push({ title: name, detail: [artist, year, kind].filter(Boolean).join(' · '), imageUrl: url, source: 'itunes', details });
  }
  return out;
}

export function parseTvmaze(json: unknown): CoverCandidate[] {
  if (!Array.isArray(json)) return [];
  const out: CoverCandidate[] = [];
  for (const r of json as { show?: Record<string, unknown> }[]) {
    const s = r?.show;
    if (!s || typeof s.name !== 'string') continue;
    const img = s.image as { original?: string; medium?: string } | null | undefined;
    const url = img?.original || img?.medium;
    if (!url) continue;
    const year = typeof s.premiered === 'string' ? s.premiered.slice(0, 4) : '';
    const channel = (s.network ?? s.webChannel) as { name?: string } | null | undefined;
    const genres = Array.isArray(s.genres) ? (s.genres as string[]).slice(0, 2).join(', ') : '';
    const details: MediaDetails = {};
    if (year) details.year = year;
    if (genres) details.genre = genres;
    out.push({ title: s.name, detail: [year, channel?.name, genres].filter(Boolean).join(' · '), imageUrl: url, source: 'tvmaze', details });
  }
  return out;
}

export function parseWikipediaSearch(json: unknown): string[] {
  const hits = (json as { query?: { search?: unknown[] } })?.query?.search;
  if (!Array.isArray(hits)) return [];
  return (hits as Record<string, unknown>[])
    .map(h => (typeof h.title === 'string' ? h.title : ''))
    .filter(t => t && !/\(disambiguation\)$/i.test(t));
}

export function parseWikipediaSummary(json: unknown): CoverCandidate | null {
  const s = json as { title?: string; description?: string; thumbnail?: { source?: string; width?: number }; originalimage?: { source?: string; width?: number } };
  if (!s || typeof s.title !== 'string') return null;
  if ((s as { type?: string }).type === 'disambiguation') return null;
  // The original when it's a poster-sized file, else the thumbnail
  const orig = s.originalimage?.source;
  const src = orig && (s.originalimage?.width ?? 9999) <= 1200 ? orig : s.thumbnail?.source;
  if (!src) return null;
  return { title: s.title, detail: s.description ?? '', imageUrl: src.split('?')[0], source: 'wikipedia', details: detailsFromDescription(s.description ?? '') };
}

/* ── Network ── */

async function getJson(url: string): Promise<unknown> {
  if (!isAllowedCoverUrl(url)) throw new Error('Cover source not allowed');
  const res = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'omit' });
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
  return res.json();
}

/** Candidates for a title, newest-first as the catalogue ranks them */
export async function searchCovers(type: MediaType, title: string, creator: string, year = ''): Promise<CoverCandidate[]> {
  if (!title.trim()) return [];
  if (type === 'book') return parseOpenLibrary(await getJson(openLibrarySearchUrl(title, creator)));
  if (type === 'music') return parseItunes(await getJson(itunesSearchUrl(title, creator)));
  if (type === 'tv') {
    // TVmaze has a poster for nearly every show; Wikipedia's summary often leaves a show's (non-free) title card out
    const shows = parseTvmaze(await getJson(tvmazeSearchUrl(title)).catch(() => [])).filter(c => isAllowedCoverUrl(c.imageUrl));
    if (shows.length) return shows.slice(0, LIMIT);
  }
  // The article's own name first (a missing one is a 404, skipped), then what search turns up
  const summary = (page: string) => getJson(wikipediaSummaryUrl(page)).then(parseWikipediaSummary).catch(() => null);
  const [direct, pages] = await Promise.all([
    Promise.all(wikipediaGuesses(title, type, year).map(summary)),
    getJson(wikipediaSearchUrl(title, type, year)).then(parseWikipediaSearch).catch(() => [] as string[]),
  ]);
  const searched = await Promise.all(pages.map(summary));
  const seen = new Set<string>();
  const found = [...direct, ...searched]
    .filter((c): c is CoverCandidate => !!c && isAllowedCoverUrl(c.imageUrl))
    .filter(c => (seen.has(c.title) ? false : (seen.add(c.title), true)));
  return rankWikipedia(found, type).slice(0, LIMIT);
}

const COVER_MAX_EDGE = 480;
const COVER_QUALITY = 0.82;

/**
 * Fetch a candidate's image and shrink it to a small JPEG data URL for the
 * entry. Refuses hosts outside the allow list.
 */
export async function fetchCover(candidate: Pick<CoverCandidate, 'imageUrl' | 'source'>): Promise<MediaCover> {
  if (!isAllowedCoverUrl(candidate.imageUrl)) throw new Error('Cover source not allowed');
  const res = await fetch(candidate.imageUrl, { credentials: 'omit' });
  if (!res.ok) throw new Error(`Couldn’t fetch the cover (${res.status})`);
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) throw new Error('That wasn’t an image');
  const bitmap = await createImageBitmap(blob);
  try {
    const long = Math.max(bitmap.width, bitmap.height);
    const scale = long > COVER_MAX_EDGE ? COVER_MAX_EDGE / long : 1;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', COVER_QUALITY);
    return { dataUrl, source: candidate.source, width: w, height: h };
  } finally {
    bitmap.close();
  }
}
