/** An https:// URL or null — for links shown on signed-in pages, where the key is unlocked. */
export function safeLink(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).protocol === 'https:' ? url : null; } catch { return null; }
}
