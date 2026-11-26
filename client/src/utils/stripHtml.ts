import DOMPurify from 'dompurify';
import type { UserFieldDef } from '../types/userFields.js';

/*
 * Plain text already worked out, by the HTML it came from. Reading the text
 * off an entry is a full parse, and the same entries are asked for again and
 * again: every list that titles its rows, and the entry form three times a
 * keystroke. Bounded by how much text it holds (the oldest go first), so an
 * entry being typed — a new string each keystroke — can't grow it without end.
 * It holds decrypted text, so it is emptied when the session ends
 * (clearStripHtmlCache, from EncryptionContext).
 */
const textCache = new Map<string, string>();
let cachedChars = 0;
const MAX_CACHED_CHARS = 4_000_000;
const MAX_ENTRY_CHARS = 60_000;

export function clearStripHtmlCache(): void {
  textCache.clear();
  cachedChars = 0;
}

/** Strip HTML tags from a string, returning plain text. */
export function stripHtml(html: string): string {
  const known = textCache.get(html);
  if (known !== undefined) return known;
  // Read the text straight off DOMPurify's (inert) fragment — no innerHTML
  // sink, so nothing here goes through Trusted Types a second time
  const frag = DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [], RETURN_DOM_FRAGMENT: true });
  const text = frag.textContent || '';
  if (typeof html === 'string' && html.length <= MAX_ENTRY_CHARS) {
    textCache.set(html, text);
    cachedChars += html.length + text.length;
    // A Map keeps the order things went in: the first keys are the oldest
    for (const key of textCache.keys()) {
      if (cachedChars <= MAX_CACHED_CHARS) break;
      cachedChars -= key.length + (textCache.get(key)?.length ?? 0);
      textCache.delete(key);
    }
  }
  return text;
}

/** Built-in "primary label" field keys, in priority order — the name/description
 *  a structured entry carries when its text content is empty. */
const BUILTIN_NAME_KEYS = [
  'eventName', 'meetingName', 'goalObjective', 'milestoneObjective',
  'taskDescription', 'mealDescription', 'recipeName', 'medicationName', 'allergen', 'routineName', 'planName', 'activityName', 'mediaTitle', 'habitName',
  'symptomName', 'changeWhat',
] as const;

/** The entry's built-in name/description field value, or '' when none is set. */
export function builtinEntryName(customFields: Record<string, unknown> | undefined | null): string {
  if (!customFields) return '';
  for (const key of BUILTIN_NAME_KEYS) {
    const v = customFields[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** Build a one-line summary from user-defined field values, for preview display only. */
export function summarizeUserFields(defs: UserFieldDef[], values: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const def of defs) {
    const val = values[def.id];
    if (val === undefined || val === null || val === '') continue;
    if (def.type !== 'boolean') {
      parts.push(String(val));
    }
  }
  return parts.join(' · ');
}
