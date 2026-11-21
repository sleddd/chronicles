import { createGlobalStyle } from 'styled-components';
import { litSheet, litSheetLight } from './darkBackdrop.js';
import { NAV_COMPACT } from './breakpoints.js';

/* Work Sans + Open Sans, bundled with the app (not Google Fonts) so Safari/iOS load them */
import './fonts.css';
/* Base styles for the core primitives (components/atoms/core, ch-* classes) */
import './core.css';

export const GlobalStyle = createGlobalStyle`
  /* Phones and tablets: the mobile top bar names the page, so the page's own big title goes */
  ${NAV_COMPACT} {
    /* Hidden from sight but kept for screen readers (display: none dropped the page's heading for them) */
    .view-title {
      position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important;
      margin: -1px !important; overflow: hidden !important; clip: rect(0, 0, 0, 0) !important;
      white-space: nowrap !important; border: 0 !important;
    }
    /* A header row with nothing else showing (its button moved to the top bar) goes too — out of sight
       and out of the layout, its title still read out */
    :has(> .view-title):not(:has(> :not(.view-title):not(:empty))) {
      position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important;
      margin: -1px !important; overflow: hidden !important; clip: rect(0, 0, 0, 0) !important; border: 0 !important;
    }
    /* …and one that still holds something loses the room the title needed */
    :has(> .view-title) { padding-top: 16px !important; padding-bottom: 8px !important; }
  }

  /* A wallpaper behind the page top (Settings → Theme → Background): the page's
     big title reads white on the photo */
  /* …and list rows (entryRowPlain) go clear so they don't stripe the photo */
  html[data-wallpaper] { --row-plain-bg: transparent; }
  /* Both themes: list rows (Topics, topic pages and the other plain lists) have no fill of their own, so the lit page shows through */
  html[data-theme='dark'], html[data-theme='light'] { --row-plain-bg: transparent; }

  /* A page's main action beside its title (TopBarAction, desktop): a smoked glass
     pill on the photo, whatever button it is */
  html[data-wallpaper] .page-action button {
    background: rgba(18, 20, 26, 0.5) !important;
    border: 1px solid transparent !important;
    color: #fff !important;
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.35);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
  }
  html[data-wallpaper][data-theme='light'] .page-action button { text-shadow: 0 1px 2px rgba(0, 0, 0, 0.28); }
  html[data-wallpaper] .page-action button:hover { background: rgba(18, 20, 26, 0.66) !important; }

  html[data-wallpaper] .view-title {
    color: #fff !important;
    text-shadow: 0 1px 14px rgba(0, 0, 0, 0.3);
  }
  /* Light: a very light drop shadow — a shadow, not a glow */
  html[data-wallpaper][data-theme='light'] .view-title { text-shadow: 0 1px 2px rgba(0, 0, 0, 0.28); }

  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html {
    font-size: 16px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    height: 100%;
    overflow: hidden;
    overscroll-behavior: none;
  }

  body {
    font-family: var(--sans, ${({ theme }) => theme.fontFamily.sans});
    color: var(--ink, ${({ theme }) => theme.colors.text});
    background-color: var(--paper, ${({ theme }) => theme.colors.background});
    line-height: 1.5;
    height: 100%;
    overflow: hidden;
    overscroll-behavior: none;
    position: fixed;
    width: 100%;
  }

  /* Dark theme: the page itself — a matte black sheet under one soft light. The light
     comes from off the bottom-right corner and falls away smoothly to near-black at the
     top left (sampled from the reference: #35373f → #15171c), with a fine paper grain
     over it. Fixed to the window, so it stays put while pages scroll. The app's layouts
     are see-through over it (styles/darkBackdrop.ts, where the sheet itself is defined) */
  html[data-theme='dark'] body {
    ${litSheet}
  }
  /* Light theme: the same lit sheet on white */
  html[data-theme='light'] body {
    ${litSheetLight}
  }

  #root {
    height: 100%;
    overflow: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  button {
    cursor: pointer;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
  }

  input, textarea, select {
    font: inherit;
    color: inherit;
  }

  /* Inputs are never outlined — they separate from the canvas by fill tone,
     not a border. Each input keeps its own background; focus shows no outline. */
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([data-underline]),
  textarea,
  select {
    border: none !important;
    box-shadow: none !important;
    /* Flat, transparent fields app-wide — no filled box. background-color (not
       shorthand) so select chevron background-images survive. */
    background-color: transparent;
  }

  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([data-underline]):focus,
  textarea:focus,
  select:focus,
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([data-underline]):focus-visible,
  textarea:focus-visible,
  select:focus-visible {
    outline: none;
    border: none !important;
    box-shadow: none !important;
  }

  /* Date/time picker icons: gray, inline next to the value not pushed to the far right. */
  input[type="date"]::-webkit-calendar-picker-indicator,
  input[type="time"]::-webkit-calendar-picker-indicator,
  input[type="datetime-local"]::-webkit-calendar-picker-indicator {
    opacity: 0.4;
    filter: invert(60%);
    cursor: pointer;
    margin-left: 6px;
    margin-right: 0;
    margin-top: 3px;
    padding: 0;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  input[type="date"],
  input[type="time"],
  input[type="datetime-local"] {
    width: auto;
    display: inline-flex;
    align-items: center;
  }

  /* Checkbox / radio labels match field labels at 13px. */
  .ch-check__label,
  .ch-radio__label {
    font-size: 13px;
  }

  /* Keyboard focus: a neutral grey ring (--focus-ring — never the accent), only when moving by
     keyboard, never on a click. Every control without its own ring gets this one */
  a:focus-visible,
  button:focus-visible,
  [tabindex]:focus-visible,
  [role="button"]:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--focus-ring, #80868f);
    outline-offset: 2px;
  }
  /* The main area takes focus from the skip link: no ring round the whole page */
  main[tabindex="-1"]:focus, [id="main-content"]:focus { outline: none; }
  /* A select keeps a ring too (text fields show their caret and border instead) */
  select:focus-visible { outline: 2px solid var(--focus-ring, #80868f) !important; outline-offset: 2px; }
  /* Pickers that lay a real <select> invisibly over drawn text: the ring goes on the drawn pill */
  label:has(> select:focus-visible), div:has(> select:focus-visible) {
    outline: 2px solid var(--focus-ring, #80868f);
    outline-offset: 2px;
  }

  /* Reduced motion for users who prefer it */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }

  /* Print styles — hide app chrome, show content */
  /* Recipe print sheet (RecipeEntry → Print): hidden on screen; on paper it
     replaces the whole app, in light ink */
  #print-sheet { display: none; }

  @media print {
    html.print-sheet-open #root { display: none !important; }
    html.print-sheet-open #print-sheet {
      display: block !important;
      padding: 0 8mm;
      color-scheme: light;
      --text-primary: #111318; --text-secondary: #1f2228; --text-tertiary: #4a4e57;
      --text-muted: #5b5f69; --text-soft: #3a3e47; --text-disabled: #6b6f78;
      --bg-app: #ffffff; --bg-surface: #ffffff; --bg-sunken: #f3f4f6;
      --border-subtle: #d9dbe1; --border-default: #c9ccd4; --border-card: #d9dbe1;
      --color-accent: #333842; --color-accent-soft: #333842; --color-accent-link: #333842;
    }

    body {
      background: white !important;
      color: black !important;
    }

    [data-print-hide] {
      display: none !important;
    }

    main {
      overflow: visible !important;
      height: auto !important;
    }

    /* Remove fixed heights so content flows. body is position: fixed on
       screen (iOS scroll lock) — a fixed element prints as a single page,
       so it must go back to static or everything past page one is cut off. */
    html, body, #root, #root > * {
      height: auto !important;
      overflow: visible !important;
    }

    html, body {
      position: static !important;
    }

    /* Paper is white: dark-theme tokens would print pale grey on white */
    html[data-theme="dark"] {
      --text-primary: #18181c !important;
      --text-secondary: #26262c !important;
      --text-tertiary: #3a3a42 !important;
      --ink: #18181c !important;
      --ink-2: #2b2b31 !important;
      --ink-3: #3a3a42 !important;
      --border-subtle: #e4e6ec !important;
      --border-default: #d8dae2 !important;
      --rule: #e4e6ec !important;
      --bg-app: #ffffff !important;
      --bg-surface: #ffffff !important;
      --paper: #ffffff !important;
    }
  }

  /* Screen-reader only utility */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
`;
