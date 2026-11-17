/** Taupe — the accent every account starts with, and the fallback wherever an accent is missing. */
export const DEFAULT_ACCENT_COLOR = '#a39080';

/**
 * The accent as a plain hex colour, else the default (Teal). The saved accent is a readable
 * setting — the server could send any text — and it ends up in CSS, so nothing
 * but a hex colour is ever taken.
 */
export function safeAccent(value: unknown): string {
  if (typeof value !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return DEFAULT_ACCENT_COLOR;
  return RETUNED_PRESETS[value.toLowerCase()] ?? value;
}

/* Presets whose colour has been adjusted since: a saved accent is its hex, so an
   account that chose the old shade gets the new one (and its swatch stays ticked) */
const RETUNED_PRESETS: Record<string, string> = {
  '#8a7564': '#a39080', // Taupe, brightened (twice — the first try, #9c8877, too)
  '#9c8877': '#a39080',
};
