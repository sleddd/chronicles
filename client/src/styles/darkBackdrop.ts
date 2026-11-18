import { css } from 'styled-components';

/* Both themes: the page is a lit sheet (dark: the blue-black backdrop with soft diagonal light that
   body paints (GlobalStyle), full bleed, with no panel over it. The app layouts
   and their page areas take this so the backdrop shows through. Bars, cards and
   the journal's panes keep their own solid fills. */
export const onBackdrop = css`
  html[data-theme='dark'] &, html[data-theme='light'] & { background: transparent; }
`;

/* The dark theme's page: one solid colour, a touch lighter than the nav rail (#12141a) —
   no lighting or grain (the lit sheet before it, a soft light from the bottom-right corner
   over a paper grain, is in git history). Painted by body and by the fixed canvas layer
   behind every app layout (organisms/Background). */
export const litSheet = css`
  background-color: #15171d;
  background-image: none;
`;

/* The light theme's page: the same idea on white — one soft light from off the
   bottom-right corner (white there), easing down to the page colour (#f4f5f7) at the
   far corner, with a very faint paper grain. It only ever brightens: nothing is darker
   than the page colour. */
export const litSheetLight = css`
  background-color: #f2f4f6;
  background-image:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.05 0 0 0 -0.02'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E"),
    radial-gradient(ellipse 150% 190% at 106% 92%,
      #fdfdfe 0%, #fafbfc 22%, #f7f8fa 46%, #f4f5f7 72%, #f2f4f6 94%);
  background-size: 220px 220px, 100% 100%;
  background-repeat: repeat, no-repeat;
  background-attachment: fixed;
`;
