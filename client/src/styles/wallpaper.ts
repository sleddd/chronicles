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
    background: rgba(255, 255, 255, 0.16);
    border: 1px solid rgba(255, 255, 255, 0.55);
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

/** Bars at the top of a panel (the journal's tool rows): frosted, the photo
 *  blurred behind, a little more solid than a card so their text reads */
export const glassBar = css`
  html[data-wallpaper] & {
    background: color-mix(in srgb, var(--bg-app) 58%, transparent);
    -webkit-backdrop-filter: blur(18px) saturate(1.1);
    backdrop-filter: blur(18px) saturate(1.1);
  }
`;

/** What sits under the bars (the entry rows, the editor's body): solid page
 *  colour, so the photo only ever shows behind the top of the page */
export const solidUnderPhoto = css`
  html[data-wallpaper] & { background: var(--bg-app); }
`;
