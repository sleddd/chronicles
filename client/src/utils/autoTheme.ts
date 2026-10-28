/* Auto theme: light by day, dark at night, by the local clock. */

export type ThemePreference = 'light' | 'dark' | 'auto';

/** Light from 7:00 AM, dark from 7:00 PM (local time) */
export const AUTO_LIGHT_FROM_HOUR = 7;
export const AUTO_DARK_FROM_HOUR = 19;

/** The theme Auto shows at this moment */
export function autoThemeFor(date: Date = new Date()): 'light' | 'dark' {
  const h = date.getHours();
  return h >= AUTO_LIGHT_FROM_HOUR && h < AUTO_DARK_FROM_HOUR ? 'light' : 'dark';
}

/** The theme in effect for a preference */
export function resolveTheme(pref: ThemePreference, date: Date = new Date()): 'light' | 'dark' {
  return pref === 'auto' ? autoThemeFor(date) : pref;
}

/** A saved `themeMode` setting → a preference (unknown values → null) */
export function parseThemePreference(v: unknown): ThemePreference | null {
  return v === 'light' || v === 'dark' || v === 'auto' ? v : null;
}

/* The theme last chosen in this browser, so a fresh load (and the sign-in
   page, before any settings are read) starts in it instead of flashing
   another. Light when nothing's remembered. Per browser, not secret. */
const THEME_KEY = 'chronicles.theme-v1';

export function rememberedTheme(): ThemePreference | null {
  try { return parseThemePreference(localStorage.getItem(THEME_KEY)); } catch { return null; }
}

export function rememberTheme(pref: ThemePreference): void {
  try { localStorage.setItem(THEME_KEY, pref); } catch { /* storage unavailable */ }
}

/** The theme to start in: the remembered one, else light */
export const startingTheme = (): ThemePreference => rememberedTheme() ?? 'light';

/** Page colour per theme (--bg-app), for the first paint and the browser bar */
export const PAGE_COLOR = { light: '#f4f5f7', dark: '#1f2229' } as const;

