import { css } from 'styled-components';

/* While a wallpaper is on (html[data-wallpaper], set by organisms/Wallpaper),
   what sits over the photo at the top of a page turns to frosted glass: cards
   a little see-through with the photo blurred behind them, controls a light
   glass pill, and the page's title text white. Nothing changes without one. */

/** Cards: the panel colour, a little see-through, the photo blurred behind.
 *  --glass-solid / --glass-blur set how much (the Quick entry lowers both so
 *  the photo shows through it) */
export const glassCard = css`
  html[data-wallpaper] & {
    background: color-mix(in srgb, var(--bg-panel) var(--glass-solid, 76%), transparent);
    -webkit-backdrop-filter: blur(var(--glass-blur, 22px)) saturate(1.15);
    backdrop-filter: blur(var(--glass-blur, 22px)) saturate(1.15);
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
`;

/** Buttons on the photo (Voice, the sliders, New entry, a page's main action):
 *  a white glass pill with white text, readable on light and dark photos */
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
`;

/** Text on the photo: white, with a soft shadow so it reads on any picture */
export const onPhoto = css`
  html[data-wallpaper] & {
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
    --bg-surface: #272a33;
    --bg-elevated: #2e323c;
    --bg-tile: #2c2e37;
    --bg-panel: #24262d;
    --border-pop: #373a44;
    --paper-surface: #272a33;
    --paper-hover: #2b2f38;
    --ink: #fff;
    --ink-2: #f1f3f6;
    --ink-3: #e3e6eb;
    --ink-4: #b9bdc5;
    --rule: rgba(255, 255, 255, 0.34);
  }
`;
