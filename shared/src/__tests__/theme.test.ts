import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
/**
 * Theme module unit tests
 * Tests for tokens, accent colors, and backgrounds
 */
import { describe, it, expect } from 'vitest';
import { lightTheme, darkTheme, theme } from '../theme/tokens.js';
import { HEADER_COLORS, deriveHoverColor, deriveLightColor, type ColorOption } from '../theme/accentColors.js';
import { BACKGROUND_IMAGES, type BackgroundOption } from '../theme/backgrounds.js';

// ============================================================================
// Theme tokens
// ============================================================================
describe('theme tokens', () => {
  describe('lightTheme structure', () => {
    it('has colors object with expected keys', () => {
      const expectedKeys = [
        'background', 'surface', 'surfaceHover', 'surfaceOverlay', 'surfaceOverlayBlur',
        'text', 'textSecondary', 'textMuted', 'textInverse',
        'border', 'borderFocus',
        'accent', 'accentHover', 'accentLight',
        'danger', 'dangerHover', 'success', 'warning', 'info',
      ];
      for (const key of expectedKeys) {
        expect(lightTheme.colors).toHaveProperty(key);
      }
    });

    it('has shadow object with sm, md, lg, focus', () => {
      expect(lightTheme.shadow).toHaveProperty('sm');
      expect(lightTheme.shadow).toHaveProperty('md');
      expect(lightTheme.shadow).toHaveProperty('lg');
      expect(lightTheme.shadow).toHaveProperty('focus');
    });

    it('has spacing object with expected scale', () => {
      expect(lightTheme.spacing).toMatchObject({ xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 });
      // DS numbered scale (--s-1 … --s-10)
      expect(lightTheme.spacing).toMatchObject({ s1: 4, s4: 16, s8: 48, s10: 96 });
    });

    it('has fontSize object with expected scale', () => {
      expect(lightTheme.fontSize).toEqual({ xs: 13, sm: 15, md: 17, lg: 20, xl: 26, xxl: 34 });
    });

    it('has fontWeight object', () => {
      expect(lightTheme.fontWeight).toEqual({ normal: 400, medium: 500, semibold: 600, bold: 700 });
    });

    it('has the squared DS borderRadius scale', () => {
      expect(lightTheme.borderRadius).toEqual({ sm: 0, md: 1, lg: 2, xl: 2, full: 9999 });
    });

    it('has zIndex object', () => {
      expect(lightTheme.zIndex).toEqual({ sidebar: 100, header: 200, modal: 300, tooltip: 400 });
    });

    it('has typography object with standard type styles', () => {
      expect(lightTheme.typography).toHaveProperty('display');
      expect(lightTheme.typography).toHaveProperty('h1');
      expect(lightTheme.typography).toHaveProperty('h2');
      expect(lightTheme.typography).toHaveProperty('h3');
      expect(lightTheme.typography).toHaveProperty('body');
      expect(lightTheme.typography).toHaveProperty('bodySm');
      expect(lightTheme.typography).toHaveProperty('caption');
      expect(lightTheme.typography).toHaveProperty('brand');
    });

    it('has fontFamily object with serif, sans, ui, brand', () => {
      expect(lightTheme.fontFamily).toHaveProperty('serif');
      expect(lightTheme.fontFamily).toHaveProperty('sans');
      expect(lightTheme.fontFamily).toHaveProperty('ui');
      expect(lightTheme.fontFamily).toHaveProperty('brand');
    });

    it('typography styles include fontFamily, fontSize, fontWeight', () => {
      expect(lightTheme.typography.body).toEqual(
        expect.objectContaining({ fontFamily: expect.any(String), fontSize: expect.any(String), fontWeight: expect.any(Number) })
      );
    });
  });

  describe('darkTheme structure', () => {
    it('has the same color keys as lightTheme', () => {
      const lightKeys = Object.keys(lightTheme.colors).sort();
      const darkKeys = Object.keys(darkTheme.colors).sort();
      expect(darkKeys).toEqual(lightKeys);
    });

    it('has the same shadow keys as lightTheme', () => {
      const lightKeys = Object.keys(lightTheme.shadow).sort();
      const darkKeys = Object.keys(darkTheme.shadow).sort();
      expect(darkKeys).toEqual(lightKeys);
    });

    it('shares non-color tokens with lightTheme', () => {
      expect(darkTheme.spacing).toEqual(lightTheme.spacing);
      expect(darkTheme.fontSize).toEqual(lightTheme.fontSize);
      expect(darkTheme.fontWeight).toEqual(lightTheme.fontWeight);
      expect(darkTheme.borderRadius).toEqual(lightTheme.borderRadius);
      expect(darkTheme.zIndex).toEqual(lightTheme.zIndex);
      expect(darkTheme.fontFamily).toEqual(lightTheme.fontFamily);
      expect(darkTheme.typography).toEqual(lightTheme.typography);
    });

    it('has different color values from lightTheme', () => {
      expect(darkTheme.colors.background).not.toBe(lightTheme.colors.background);
      expect(darkTheme.colors.text).not.toBe(lightTheme.colors.text);
      expect(darkTheme.colors.surface).not.toBe(lightTheme.colors.surface);
    });
  });

  describe('default theme export', () => {
    it('theme is the same reference as lightTheme', () => {
      expect(theme).toBe(lightTheme);
    });
  });
});

// ============================================================================
// Accent colors
// ============================================================================
describe('HEADER_COLORS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(HEADER_COLORS)).toBe(true);
    expect(HEADER_COLORS.length).toBeGreaterThan(0);
  });

  it('each entry has value and label properties', () => {
    for (const color of HEADER_COLORS) {
      expect(color).toHaveProperty('value');
      expect(color).toHaveProperty('label');
      expect(typeof color.value).toBe('string');
      expect(typeof color.label).toBe('string');
    }
  });

  it('each non-transparent entry has a valid hex value', () => {
    for (const color of HEADER_COLORS) {
      if (color.value !== 'transparent') {
        expect(color.value).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it('has unique labels', () => {
    const labels = HEADER_COLORS.map(c => c.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('has unique values', () => {
    const values = HEADER_COLORS.map(c => c.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('deriveHoverColor', () => {
  it('darkens a color by approximately 15%', () => {
    // #ffffff (255,255,255) -> 85% = Math.round(216.75) = 217 -> #d9d9d9
    const result = deriveHoverColor('#ffffff');
    expect(result).toBe('#d9d9d9');
  });

  it('handles black (stays black)', () => {
    expect(deriveHoverColor('#000000')).toBe('#000000');
  });

  it('handles transparent by returning a fallback dark color', () => {
    expect(deriveHoverColor('transparent')).toBe('#2D2C2A');
  });

  it('darkens a mid-range color correctly', () => {
    // #808080 (128,128,128) -> 85% = (108.8 -> 109, 109, 109) -> #6d6d6d
    const result = deriveHoverColor('#808080');
    expect(result).toBe('#6d6d6d');
  });

  it('darkens a pure red correctly', () => {
    // #ff0000 (255,0,0) -> Math.round(255*0.85)=217 -> #d90000
    expect(deriveHoverColor('#ff0000')).toBe('#d90000');
  });

  it('darkens a pure green correctly', () => {
    expect(deriveHoverColor('#00ff00')).toBe('#00d900');
  });

  it('darkens a pure blue correctly', () => {
    expect(deriveHoverColor('#0000ff')).toBe('#0000d9');
  });

  it('returns a valid 7-character hex string', () => {
    for (const color of HEADER_COLORS) {
      if (color.value !== 'transparent') {
        const result = deriveHoverColor(color.value);
        expect(result).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('always produces a darker or equal color', () => {
    const hexToNum = (hex: string) => parseInt(hex.slice(1), 16);
    for (const color of HEADER_COLORS) {
      if (color.value !== 'transparent') {
        const original = hexToNum(color.value.toLowerCase());
        const hover = hexToNum(deriveHoverColor(color.value));
        // Each channel should be <= original
        expect(hover).toBeLessThanOrEqual(original);
      }
    }
  });
});

describe('deriveLightColor', () => {
  it('produces an rgba string with 0.1 opacity', () => {
    const result = deriveLightColor('#ff0000');
    expect(result).toBe('rgba(255, 0, 0, 0.1)');
  });

  it('handles white', () => {
    expect(deriveLightColor('#ffffff')).toBe('rgba(255, 255, 255, 0.1)');
  });

  it('handles black', () => {
    expect(deriveLightColor('#000000')).toBe('rgba(0, 0, 0, 0.1)');
  });

  it('handles transparent with a gray fallback', () => {
    expect(deriveLightColor('transparent')).toBe('rgba(107, 114, 128, 0.1)');
  });

  it('correctly parses hex components', () => {
    expect(deriveLightColor('#1B2A4A')).toBe('rgba(27, 42, 74, 0.1)');
  });

  it('returns a valid rgba string for all header colors', () => {
    for (const color of HEADER_COLORS) {
      const result = deriveLightColor(color.value);
      expect(result).toMatch(/^rgba\(\d+, \d+, \d+, 0\.1\)$/);
    }
  });
});

// ============================================================================
// Backgrounds
// ============================================================================
describe('BACKGROUND_IMAGES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(BACKGROUND_IMAGES)).toBe(true);
    expect(BACKGROUND_IMAGES.length).toBeGreaterThan(0);
  });

  it('each entry has value, thumb, and label properties', () => {
    for (const bg of BACKGROUND_IMAGES) {
      expect(bg).toHaveProperty('value');
      expect(bg).toHaveProperty('thumb');
      expect(bg).toHaveProperty('label');
      expect(typeof bg.value).toBe('string');
      expect(typeof bg.thumb).toBe('string');
      expect(typeof bg.label).toBe('string');
    }
  });

  it('includes a "None" option with empty value', () => {
    const none = BACKGROUND_IMAGES.find(bg => bg.label === 'None');
    expect(none).toBeDefined();
    expect(none!.value).toBe('');
    expect(none!.thumb).toBe('');
  });

  it('non-empty entries have paths starting with /backgrounds/', () => {
    for (const bg of BACKGROUND_IMAGES) {
      if (bg.value) {
        expect(bg.value).toMatch(/^\/backgrounds\//);
      }
    }
  });

  it('non-empty entries have thumbs under /backgrounds/', () => {
    for (const bg of BACKGROUND_IMAGES) {
      if (bg.thumb) {
        expect(bg.thumb).toMatch(/^\/backgrounds\//);
      }
    }
  });

  it('every selectable image and thumb exists in client/public', () => {
    const publicDir = fileURLToPath(new URL('../../../client/public', import.meta.url));
    // Hidden entries are retired backgrounds kept only so old saved settings resolve
    for (const bg of BACKGROUND_IMAGES.filter(b => !b.hidden)) {
      for (const p of [bg.value, bg.thumb]) {
        if (p) expect(existsSync(publicDir + p), p).toBe(true);
      }
    }
  });

  it('has unique labels', () => {
    const labels = BACKGROUND_IMAGES.map(bg => bg.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('has unique values', () => {
    const values = BACKGROUND_IMAGES.map(bg => bg.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('image values are jpg or png', () => {
    for (const bg of BACKGROUND_IMAGES) {
      if (bg.value) {
        expect(bg.value).toMatch(/\.(jpg|png)$/);
      }
    }
  });
});
