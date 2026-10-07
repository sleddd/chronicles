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
  return stripHtml(html).trim().slice(0, 70);
}

/** First heading, else the first 70 characters of text; '' when there's no text. */
export function entryTitleText(html: string): string {
  const hit = cache.get(html);
  if (hit !== undefined) return hit;
  const title = compute(html);
  if (cache.size >= MAX) cache.delete(cache.keys().next().value as string);
  cache.set(html, title);
  return title;
}
