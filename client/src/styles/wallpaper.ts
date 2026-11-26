import { css } from 'styled-components';

/* While a wallpaper is on (html[data-wallpaper], set by organisms/Wallpaper),
   what sits over the photo at the top of a page turns to frosted glass: cards
   a little see-through with the photo blurred behind them, controls a light
   glass pill, and the page's title text white. Nothing changes without one. */

/** Cards: the solid panel colour on the photo too — no see-through, so every shaded
 *  card on every dashboard is the same cool --bg-panel whatever photo is behind it
 *  (see-through ones took on the photo's colour and no longer matched the solid ones) */
export const glassCard = css`
  html[data-wallpaper] & {
    background: var(--bg-panel);
  }
`;

/** Fields on the photo (search boxes, Today / All / Bookmarks): frosted page
 *  colour, solid enough that their text and placeholder read as they do off it */
export const glassControl = css`
  html[data-wallpaper] & {
    background: color-mix(in srgb, var(--bg-app) 72%, transparent);
    border-color: color-mix(in srgb, var(--border-card) 60%, rgba(255, 255, 255, 0.4));
    -webkit-backdrop-filter: blur(16px) saturate(1.1);
    backdrop-filter: blur(16px) saturate(1.1);
  }
  /* Dark: the page colour is black, which made these stand out as black slabs on the
     photo. A softer, see-through frost instead, so they melt into the picture */
  html[data-wallpaper][data-theme='dark'] & {
    background: rgba(58, 62, 72, 0.42);
    /* Placeholders and icons inside a frosted control: brighter, so they stand out on the glass */
    --text-hint: rgba(255, 255, 255, 0.72);
    --text-placeholder: rgba(255, 255, 255, 0.72);
    --text-muted: rgba(255, 255, 255, 0.74);
    & input::placeholder, & textarea::placeholder { color: rgba(255, 255, 255, 0.72); }
    border-color: rgba(255, 255, 255, 0.12);
    -webkit-backdrop-filter: blur(18px) saturate(1.15);
    backdrop-filter: blur(18px) saturate(1.15);
  }
`;

/** Buttons on the photo (Voice, the sliders, New entry, a page's main action):
 *  smoked glass with white text in dark; light frosted glass with dark text in light */
export const glassPill = css`
  html[data-wallpaper] & {
    /* Smoked glass: a dark see-through fill, so the white text holds on a bright photo */
    background: rgba(18, 20, 26, 0.5);
    border: 1px solid transparent; /* the fill runs to the edge: no outline against it */
    color: #fff;
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.35);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
  }
  /* Light: light frosted glass, never the dark smoked fill — the page's cream, see-through
     over a blur, with the theme's own dark text and no shadow on the words */
  html[data-wallpaper][data-theme='light'] & {
    background: rgba(254, 249, 245, 0.74);
    color: var(--text-primary);
    text-shadow: none;
  }
`;

/** Text on the photo: white, with a soft shadow so it reads on any picture */
export const onPhoto = css`
  html[data-wallpaper] & {
    color: #fff;
    text-shadow: 0 1px 14px rgba(0, 0, 0, 0.3);
  }
  /* Light: a very light drop shadow (offset, barely blurred) — a shadow, not a glow */
  html[data-wallpaper][data-theme='light'] & { text-shadow: 0 1px 2px rgba(0, 0, 0, 0.28); }
`;

/** Text a little way down a page's photo (under the title: the media shelf's name and its link):
 *  white with a shadow on the photo in dark; in light, by then the photo is fading toward the
 *  page, so it keeps its standard light colours */
export const onPhotoInDark = css`
  html[data-wallpaper][data-theme='dark'] & {
    color: #fff;
    text-shadow: 0 1px 14px rgba(0, 0, 0, 0.3);
  }
`;

/** Bars at the top of a panel (the journal's date bar, Bulk edit): the page's own
 *  colour, solid — no frosted blur over the photo (light or dark theme alike) */
export const glassBar = css`
  html[data-wallpaper] & { background: var(--bg-app); }
`;

/** What sits under the bars (the entry rows, the editor's body): solid page
 *  colour, so the photo only ever shows behind the top of the page */
export const solidUnderPhoto = css`
  html[data-wallpaper] & { background: var(--bg-app); }
`;

/** Content laid straight on the photo, with no card (the dashboard's Quick
 *  entry): white text, white hairlines and see-through controls, and the dark
 *  palette's floating surfaces — in either theme, since the photo is shaded
 *  dark behind it. Menus that open inside it (the topic picker) come out dark. */
export const photoTokens = css`
  html[data-wallpaper] & {
    --text-primary: #fff;
    --text-secondary: #f1f3f6;
    --text-tertiary: #e3e6eb;
    --text-soft: #dde0e6;
    --text-muted: #c9ccd3;
    --text-meta: #c9ccd3;
    --text-disabled: #b9bdc5;
    --text-placeholder: rgba(255, 255, 255, 0.66);
    --text-hint: rgba(255, 255, 255, 0.62);
    --text-faint: rgba(255, 255, 255, 0.45);
    --border-faint: rgba(255, 255, 255, 0.2);
    --border-subtle: rgba(255, 255, 255, 0.34);
    --border-default: rgba(255, 255, 255, 0.4);
    --border-card: rgba(255, 255, 255, 0.42);
    --border-field: rgba(255, 255, 255, 0.4);
    --border-pill: rgba(255, 255, 255, 0.55);
    --border-strong: rgba(255, 255, 255, 0.72);
    --control-border: rgba(255, 255, 255, 0.62);
    --bg-control: transparent;
    --bg-tracker: transparent;
    --bg-sunken: rgba(0, 0, 0, 0.2);
    --bg-hover: rgba(255, 255, 255, 0.1);
    --bg-row-hover: rgba(255, 255, 255, 0.1);
    --bg-active: rgba(255, 255, 255, 0.2);
    --bg-tab-active: rgba(255, 255, 255, 0.2);
    --progress-track: rgba(255, 255, 255, 0.25);
    --color-accent-line: var(--color-accent);
    --color-accent-link: var(--color-accent);
    --color-accent-soft: var(--color-accent);
    --color-accent-text: var(--color-accent);
    /* Floating menus inside it: the dark theme's surfaces */
    --bg-surface: #1a1c24;
    --bg-elevated: #1e2029;
    --bg-tile: #1b1d25;
    --bg-panel: #181a22;
    --border-pop: #2a2d37;
    --paper-surface: #1a1c24;
    --paper-hover: #1d1f28;
    --ink: #fff;
    --ink-2: #f1f3f6;
    --ink-3: #e3e6eb;
    --ink-4: #b9bdc5;
    --rule: rgba(255, 255, 255, 0.34);
  }
`;
