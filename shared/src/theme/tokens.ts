/**
 * Design tokens — shared across web and React Native
 * Single source of truth for all visual constants
 */

const fontFamily = {
  // DS pairing: Work Sans (display/headings) + Open Sans (UI/body/labels).
  serif: "'Work Sans', ui-sans-serif, system-ui, -apple-system, sans-serif",
  sans: "'Open Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  ui: "'Open Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  brand: "'Work Sans', ui-sans-serif, system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Menlo, 'Courier New', monospace",
};

const typography = {
  // Display headings set thin (Light) for an airy, editorial feel.
  display: { fontFamily: fontFamily.serif, fontSize: '2.25rem', fontWeight: 200 },
  h1: { fontFamily: fontFamily.serif, fontSize: '2rem', fontWeight: 300 },
  h2: { fontFamily: fontFamily.serif, fontSize: '1.5rem', fontWeight: 300 },
  h3: { fontFamily: fontFamily.serif, fontSize: '1.25rem', fontWeight: 400 },
  body: { fontFamily: fontFamily.sans, fontSize: '1rem', fontWeight: 400 },
  bodySm: { fontFamily: fontFamily.sans, fontSize: '0.9rem', fontWeight: 400 },
  caption: { fontFamily: fontFamily.sans, fontSize: '0.8rem', fontWeight: 600 },
  brand: { fontFamily: fontFamily.brand, fontSize: '1rem', fontWeight: 300, letterSpacing: '0.14em' },
};

const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s7: 32,
  s8: 48,
  s9: 64,
  s10: 96,
};

const fontSize = {
  xs: 13,
  sm: 15,
  md: 17,
  lg: 20,
  xl: 26,
  xxl: 34,
};

const fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

const borderRadius = {
  // DS "sharp/squared" scale — near-zero corners; only round things use full.
  sm: 0,
  md: 1,
  lg: 2,
  xl: 2,
  full: 9999,
};

const zIndex = {
  sidebar: 100,
  header: 200,
  modal: 300,
  tooltip: 400,
};

/** Shared (non-color) tokens */
const shared = {
  fontFamily,
  typography,
  spacing,
  fontSize,
  fontWeight,
  borderRadius,
  zIndex,
};

/** Light theme — pure white canvas, borderless tonal panels */
export const lightTheme = {
  ...shared,
  colors: {
    background: '#ffffff',
    surfaceDeep: '#f5f6f8',
    surface: '#ffffff',
    surfaceHover: '#f8f9fa',
    surfaceOverlay: 'rgba(255, 255, 255, 0.92)',
    surfaceOverlayLight: 'rgba(255, 255, 255, 0.8)',
    surfaceOverlayBlur: 'rgba(255, 255, 255, 0.7)',

    text: '#18181c',
    textSecondary: '#2b2b31',
    textMuted: '#3a3a42',
    textFaint: '#a0a0aa',
    textInverse: '#ffffff',

    border: '#e4e6ec',
    borderSoft: '#e4e6ec',
    borderFocus: '#34a5a2',
    accentStroke: '#26807d',

    accent: '#34a5a2',
    accentHover: '#2b8a87',
    accentLight: 'rgba(52, 165, 162, 0.10)',

    danger: '#d8483f',
    dangerHover: '#b83a32',
    success: '#2f9e6b',
    warning: '#d8941f',
    info: '#2f7fd8',
  },
  shadow: {
    // Panels are flat; shadows reserved for floating overlays.
    sm: 'none',
    md: '0 1px 2px rgba(20, 20, 30, 0.04)',
    lg: '0 8px 28px rgba(20, 20, 30, 0.14)',
    focus: '0 0 0 3px rgba(52, 165, 162, 0.28)',
  },
} as const;

/** Dark theme — soft slate canvas (#1f2229) */
export const darkTheme = {
  ...shared,
  colors: {
    background: '#1f2229',
    surfaceDeep: '#1a1c22',
    surface: '#272a33',
    surfaceHover: '#2b2f38',
    surfaceOverlay: 'rgba(32, 35, 42, 0.92)',
    surfaceOverlayLight: 'rgba(32, 35, 42, 0.8)',
    surfaceOverlayBlur: 'rgba(32, 35, 42, 0.7)',

    text: '#f7f8fa',
    textSecondary: '#e6e9ee',
    textMuted: '#cdd2da',
    textFaint: '#a3a9b5',
    textInverse: '#14161b',

    border: '#2c2f3a',
    borderSoft: '#2c2f3a',
    borderFocus: '#8a82e6',
    accentStroke: '#8a82e6',

    accent: '#8a82e6',
    accentHover: '#b3aef0',
    accentLight: 'rgba(138, 130, 230, 0.22)',

    danger: '#d8483f',
    dangerHover: '#b83a32',
    success: '#2f9e6b',
    warning: '#d8941f',
    info: '#2f7fd8',
  },
  shadow: {
    sm: 'none',
    md: '0 1px 2px rgba(0, 0, 0, 0.4)',
    lg: '0 8px 28px rgba(0, 0, 0, 0.55)',
    focus: '0 0 0 3px rgba(138, 130, 230, 0.32)',
  },
} as const;

/** Default theme export for backwards compatibility */
export const theme = lightTheme;

export type Theme = typeof lightTheme;
