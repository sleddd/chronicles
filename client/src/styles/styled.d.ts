import 'styled-components';

declare module 'styled-components' {
  export interface DefaultTheme {
    fontFamily: {
      serif: string;
      sans: string;
      ui: string;
      brand: string;
      mono: string;
    };
    typography: {
      display: { fontFamily: string; fontSize: string; fontWeight: number };
      h1: { fontFamily: string; fontSize: string; fontWeight: number };
      h2: { fontFamily: string; fontSize: string; fontWeight: number };
      h3: { fontFamily: string; fontSize: string; fontWeight: number };
      body: { fontFamily: string; fontSize: string; fontWeight: number };
      bodySm: { fontFamily: string; fontSize: string; fontWeight: number };
      caption: { fontFamily: string; fontSize: string; fontWeight: number };
      brand: { fontFamily: string; fontSize: string; fontWeight: number; letterSpacing: string };
    };
    colors: {
      accent: string;
      accentHover: string;
      accentLight: string;
      accentStroke: string;
      background: string;
      surfaceDeep: string;
      surface: string;
      surfaceHover: string;
      surfaceOverlay: string;
      surfaceOverlayLight: string;
      surfaceOverlayBlur: string;
      text: string;
      textSecondary: string;
      textMuted: string;
      textFaint: string;
      textInverse: string;
      border: string;
      borderSoft: string;
      borderFocus: string;
      danger: string;
      dangerHover: string;
      success: string;
      warning: string;
      info: string;
    };
    spacing: {
      xs: number;
      sm: number;
      md: number;
      lg: number;
      xl: number;
      xxl: number;
      s1: number;
      s2: number;
      s3: number;
      s4: number;
      s5: number;
      s6: number;
      s7: number;
      s8: number;
      s9: number;
      s10: number;
    };
    fontSize: {
      xs: number;
      sm: number;
      md: number;
      lg: number;
      xl: number;
      xxl: number;
    };
    fontWeight: {
      normal: number;
      medium: number;
      semibold: number;
      bold: number;
    };
    borderRadius: {
      sm: number;
      md: number;
      lg: number;
      xl: number;
      full: number;
    };
    shadow: {
      sm: string;
      md: string;
      lg: string;
      focus: string;
    };
    zIndex: {
      sidebar: number;
      header: number;
      modal: number;
      tooltip: number;
    };
  }
}
