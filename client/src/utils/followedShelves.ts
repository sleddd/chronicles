/*
 * The public shelves someone follows (pure). Kept as the sealed setting
 * `followedShelves`, so the server never learns who follows whom; a shelf is
 * followed by its link only — there is no directory.
 */

export interface FollowedShelf {
  token: string;
  /** The shelf's title when last seen (shown before it loads, and if it goes away) */
  title: string;
  /** ISO time it was followed */
  followedAt: string;
}

/** At most this many (a sealed setting is capped at 64 KB) */
export const FOLLOWED_SHELVES_MAX = 200;

const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

/** The shelf token in a pasted link ("https://…/public-shelf/<token>", with or without a query) or a bare token; null if it isn't one */
export function shelfTokenFrom(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  if (TOKEN.test(text)) return text;
  const m = /\/public-shelf\/([A-Za-z0-9_-]{16,128})(?:[/?#]|$)/.exec(text);
  return m ? m[1] : null;
}

/** Only well-formed rows survive a read (the setting is the owner's, but stay defensive) */
export function followedShelvesOf(value: unknown): FollowedShelf[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: FollowedShelf[] = [];
  for (const v of value) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    if (typeof r.token !== 'string' || !TOKEN.test(r.token) || seen.has(r.token)) continue;
    seen.add(r.token);
    out.push({
      token: r.token,
      title: typeof r.title === 'string' ? r.title.slice(0, 200) : '',
      followedAt: typeof r.followedAt === 'string' ? r.followedAt : '',
    });
  }
  return out.slice(0, FOLLOWED_SHELVES_MAX);
}

export function isFollowing(list: FollowedShelf[], token: string): boolean {
  return list.some(s => s.token === token);
}

/** Follow a shelf (newest first); following one already followed changes nothing */
export function withFollowed(list: FollowedShelf[], token: string, title: string, now = new Date()): FollowedShelf[] {
  if (isFollowing(list, token)) return list;
  return [{ token, title: title.slice(0, 200), followedAt: now.toISOString() }, ...list].slice(0, FOLLOWED_SHELVES_MAX);
}

export function withoutFollowed(list: FollowedShelf[], token: string): FollowedShelf[] {
  return list.filter(s => s.token !== token);
}

/** A followed shelf's title as it now reads (the same list back when nothing changed) */
export function withTitle(list: FollowedShelf[], token: string, title: string): FollowedShelf[] {
  const t = title.slice(0, 200);
  return list.some(s => s.token === token && s.title !== t)
    ? list.map(s => (s.token === token ? { ...s, title: t } : s))
    : list;
}
