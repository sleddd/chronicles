/*
 * An entry's own tags (custom tags on text entries — the journal, a plain
 * topic, a topic with fields of the person's own; never tasks, goals and the
 * other built-in kinds). Kept in the entry's encrypted fields as `tags`, a
 * list of names. Media entries have tags of their own under the same key
 * (utils/media.ts). Pure.
 */

export const TAG_MAX = 40;
export const TAGS_PER_ENTRY = 20;

/** A tag as typed, made tidy: one line, single spaces, no control characters, at most 40 characters */
export function cleanTag(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TAG_MAX);
}

export const sameTag = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The tags in an entry's fields: names only, each once, in the order given */
export function tagsOf(fields: Record<string, unknown> | undefined): string[] {
  const raw = fields?.tags;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== 'string') continue;
    const tag = cleanTag(t);
    if (tag && !out.some(x => sameTag(x, tag))) out.push(tag);
    if (out.length >= TAGS_PER_ENTRY) break;
  }
  return out;
}

/** `tags` with `tag` added at the end (nothing when it's blank, already there, or the list is full) */
export function withTag(tags: string[], tag: string): string[] {
  const t = cleanTag(tag);
  if (!t || tags.some(x => sameTag(x, t)) || tags.length >= TAGS_PER_ENTRY) return tags;
  return [...tags, t];
}

export const withoutTag = (tags: string[], tag: string): string[] => tags.filter(t => !sameTag(t, tag));

/** Every tag used across these entries' fields, most used first, then A–Z */
export function tagsInUse(fieldsList: (Record<string, unknown> | undefined)[]): string[] {
  const count = new Map<string, { name: string; n: number }>();
  for (const f of fieldsList) {
    for (const t of tagsOf(f)) {
      const key = t.toLowerCase();
      const had = count.get(key);
      if (had) had.n += 1; else count.set(key, { name: t, n: 1 });
    }
  }
  return [...count.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map(x => x.name);
}
