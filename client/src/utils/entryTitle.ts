import { stripHtml } from './stripHtml.js';

/*
 * Entry list titles, cached by HTML. Sanitizing every card's HTML on every
 * render made long lists expensive (each list render re-parsed every entry);
 * the cache makes re-renders of unchanged entries free.
 */
const cache = new Map<string, string>();
const MAX = 5000;

function compute(html: string): string {
  const headingMatch = html.match(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/i);
  if (headingMatch) {
    const text = stripHtml(headingMatch[1]).trim();
    if (text) return text;
  }
  // The first paragraph (or line) only: block ends become line breaks first, so a
  // long entry's paragraphs no longer run together ("…the riverWalked the long…")
  const lined = html.replace(/<\/(p|div|h[1-6]|li|blockquote|pre)>|<br\s*\/?>/gi, '$&\n');
  const first = stripHtml(lined).split('\n').map(l => l.trim()).find(Boolean) ?? '';
  return first.slice(0, 70);
}

/** First heading, else the first paragraph's first 70 characters; '' when there's no text. */
export function entryTitleText(html: string): string {
  const hit = cache.get(html);
  if (hit !== undefined) return hit;
  const title = compute(html);
  if (cache.size >= MAX) cache.delete(cache.keys().next().value as string);
  cache.set(html, title);
  return title;
}

/** Forget every cached title (they're decrypted text): called when the journal locks. */
export function clearEntryTitleCache(): void {
  cache.clear();
}
