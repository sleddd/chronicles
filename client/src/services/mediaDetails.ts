/*
 * Details for a media entry — author / director / artist, year, genre, album,
 * season — first from the catalogue the cover came from (coverLookup), then,
 * where In-App AI is set up, from the user's own model for whatever is still
 * blank. Only blank fields are ever filled; a typed value is never replaced.
 * The AI step sends the title and what's known to the user's chosen provider.
 */

import { chatReply } from './aiAssistant.js';
import { MEDIA_TYPES, mediaTypeInfo, type MediaFieldValues, type MediaType } from '../utils/media.js';

export type DetailKey = 'creator' | 'year' | 'genre' | 'album' | 'season';
export type MediaDetails = Partial<Record<DetailKey, string>>;

const DETAIL_KEYS: DetailKey[] = ['creator', 'year', 'genre', 'album', 'season'];

/** The detail fields a type's form shows */
export function detailKeysFor(type: MediaType): DetailKey[] {
  return type === 'music' ? ['creator', 'album', 'year', 'genre']
    : type === 'tv' ? ['creator', 'season', 'year', 'genre']
    : ['creator', 'year', 'genre'];
}

/** The detail fields still blank on the form */
export function blankDetailKeys(values: MediaFieldValues): DetailKey[] {
  return detailKeysFor(mediaTypeInfo(values.mediaType).value).filter(k => !String(values[k] ?? '').trim());
}

/**
 * Put details on the form: into blank fields, and over fields an earlier
 * lookup filled (`filled` — so picking another cover swaps its details in,
 * while anything typed by hand stays). Returns the patch and the keys now
 * filled by lookup.
 */
export function applyLookupDetails(values: MediaFieldValues, details: MediaDetails, filled: DetailKey[]): { patch: Partial<MediaFieldValues>; filled: DetailKey[] } {
  const patch: Partial<MediaFieldValues> = {};
  const now = new Set(filled);
  for (const k of detailKeysFor(mediaTypeInfo(values.mediaType).value)) {
    const v = details[k]?.trim();
    if (!v) continue;
    const current = String(values[k] ?? '').trim();
    if (current && !filled.includes(k)) continue;
    if (current !== v) patch[k] = v;
    now.add(k);
  }
  return { patch, filled: [...now] };
}

/** The JSON object in a model's answer, as details (unknown keys dropped, values trimmed) */
export function parseDetailsJson(text: string): MediaDetails {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return {};
  let obj: unknown;
  try { obj = JSON.parse(m[0]); } catch { return {}; }
  if (!obj || typeof obj !== 'object') return {};
  const out: MediaDetails = {};
  for (const k of DETAIL_KEYS) {
    const v = (obj as Record<string, unknown>)[k];
    if (typeof v === 'string' && v.trim() && !/^(unknown|n\/a|none|null)$/i.test(v.trim())) out[k] = v.trim().slice(0, 120);
    else if (typeof v === 'number' && k === 'year') out.year = String(v);
  }
  if (out.year && !/^\d{4}$/.test(out.year)) {
    const y = out.year.match(/\b(19|20)\d{2}\b/);
    if (y) out.year = y[0]; else delete out.year;
  }
  return out;
}

const LABELS: Record<DetailKey, string> = {
  creator: 'the author / director / show creator / artist', year: 'the year it came out (4 digits)', genre: 'its genre, two or three words at most',
  album: 'the album the song is on (blank if the title is an album)', season: 'the season, e.g. "Season 2" (blank if unknown)',
};

/**
 * Ask the user's model for the blank details of a title. Answers come back
 * as a JSON object with only the asked-for keys; anything it isn't sure of
 * is left blank rather than guessed.
 */
export async function aiMediaDetails(values: MediaFieldValues, keys: DetailKey[] = blankDetailKeys(values)): Promise<MediaDetails> {
  if (!keys.length || !values.mediaTitle?.trim()) return {};
  const info = mediaTypeInfo(values.mediaType);
  const known = detailKeysFor(info.value).filter(k => !keys.includes(k) && String(values[k] ?? '').trim()).map(k => `${k}: ${String(values[k]).trim()}`);
  const system = 'You identify well-known books, films, TV shows and music from a title. Answer with one JSON object and nothing else. '
    + 'Use only the requested keys. If you are not confident which work is meant, or do not know a value, leave that key out rather than guess. Never invent a person.';
  const user = `Type: ${info.label} (${MEDIA_TYPES.find(t => t.value === info.value)?.label})\nTitle: ${values.mediaTitle.trim()}`
    + (known.length ? `\nKnown: ${known.join('; ')}` : '')
    + `\nWanted keys: ${keys.map(k => `${k} (${LABELS[k]})`).join(', ')}`;
  const reply = await chatReply(system, [{ role: 'user', content: user }]);
  const out = parseDetailsJson(reply);
  for (const k of Object.keys(out) as DetailKey[]) if (!keys.includes(k)) delete out[k];
  return out;
}
