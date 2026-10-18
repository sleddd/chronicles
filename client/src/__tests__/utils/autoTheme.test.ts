import { describe, it, expect } from 'vitest';
import { autoThemeFor, resolveTheme, parseThemePreference } from '@/utils/autoTheme';

const at = (h: number, m = 0) => new Date(2026, 9, 18, h, m);

describe('auto theme', () => {
  it('is light from 7:00 AM until 7:00 PM, dark otherwise', () => {
    expect(autoThemeFor(at(6, 59))).toBe('dark');
    expect(autoThemeFor(at(7, 0))).toBe('light');
    expect(autoThemeFor(at(12, 30))).toBe('light');
    expect(autoThemeFor(at(18, 59))).toBe('light');
    expect(autoThemeFor(at(19, 0))).toBe('dark');
    expect(autoThemeFor(at(0, 0))).toBe('dark');
  });

  it('resolves a fixed preference as itself', () => {
    expect(resolveTheme('light', at(23))).toBe('light');
    expect(resolveTheme('dark', at(12))).toBe('dark');
    expect(resolveTheme('auto', at(12))).toBe('light');
  });

  it('reads saved settings, ignoring unknown values', () => {
    expect(parseThemePreference('auto')).toBe('auto');
    expect(parseThemePreference('dark')).toBe('dark');
    expect(parseThemePreference('sepia')).toBeNull();
    expect(parseThemePreference(undefined)).toBeNull();
  });
});
