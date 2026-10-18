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
