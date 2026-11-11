/** Teal — the accent every account starts with, and the fallback wherever an accent is missing. */
export const DEFAULT_ACCENT_COLOR = '#34a5a2';

/**
 * The accent as a plain hex colour, else Teal. The saved accent is a readable
 * setting — the server could send any text — and it ends up in CSS, so nothing
 * but a hex colour is ever taken.
 */
export function safeAccent(value: unknown): string {
  return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : DEFAULT_ACCENT_COLOR;
}
