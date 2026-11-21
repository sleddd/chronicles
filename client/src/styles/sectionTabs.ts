import styled from 'styled-components';
import { NAV_COMPACT } from './breakpoints.js';

/* One look for every section's tabs (Health, Kitchen, Planning, Finance):
   sentence-case labels on a hairline rule, muted until chosen; the active tab is
   soft-accent text with a 3px accent underline sitting on the rule. */
export const SectionTabBar = styled.nav`
  display: flex;
  align-items: flex-end;
  column-gap: 36px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--border-subtle);

  @media (max-width: 768px) { column-gap: 28px; }
  @media (max-width: 480px) { column-gap: 20px; }
  /* On a wallpaper: a frosted strip — smoked glass like the page actions, so the white tabs
     read on any photo (light theme too) — over a light rule */
  html[data-wallpaper] & {
    padding: 0 20px;
    /* A box with lightly rounded corners all round, like the media shelf's bar (no rule under it) */
    border-radius: 10px;
    border-bottom-color: transparent;
    overflow: hidden;
    background: rgba(18, 20, 26, 0.34);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
  }
  /* Light: no dark fill — just the blur of the photo behind the tabs */
  html[data-wallpaper][data-theme='light'] & { background: transparent; }
  /* Dark: no blur, and the fill fades out toward its edges, leaving only a faint trace
     of the strip behind the tabs (the tabs themselves stay solid) */
  html[data-wallpaper][data-theme='dark'] & {
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    /* Centred behind the tabs (on the left), gone well before the row's empty right end */
    background: radial-gradient(ellipse 42% 170% at 20% 50%, rgba(18, 20, 26, 0.34) 30%, rgba(18, 20, 26, 0.12) 65%, rgba(18, 20, 26, 0) 100%);
  }
  /* Phones / tablets: room under the page's controls (the title row above holds them there),
     and in dark the strip frosted again — the smoked fill with its blur, all the way across */
  ${NAV_COMPACT} {
    margin-top: 14px;
    html[data-wallpaper][data-theme='dark'] & {
      background: rgba(18, 20, 26, 0.34);
      -webkit-backdrop-filter: blur(14px);
      backdrop-filter: blur(14px);
    }
  }
`;

export const SectionTab = styled.button<{ $active?: boolean }>`
  padding: 10px 0 12px;
  margin-bottom: -1px;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 400;
  color: ${({ $active }) => ($active ? 'var(--color-accent-soft)' : 'var(--text-muted)')};
  background: transparent;
  border: none;
  border-bottom: 3px solid ${({ $active }) => ($active ? 'var(--color-accent)' : 'transparent')};
  cursor: pointer;
  white-space: nowrap;
  transition: color 120ms ease, border-color 120ms ease;

  &:hover:not([aria-selected="true"]) {
    color: var(--text-secondary);
    border-bottom-color: var(--border-strong);
  }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
  @media (max-width: 480px) { font-size: 14px; }
  /* On a wallpaper: white text with a soft shadow so it reads on any photo,
     the chosen one in full white over its accent underline */
  html[data-wallpaper] & {
    color: ${({ $active }) => ($active ? '#fff' : 'rgba(255, 255, 255, 0.8)')};
    text-shadow: 0 1px 10px rgba(0, 0, 0, 0.45);
  }
  /* Light: white like dark's, with a tight drop shadow (a shadow, not a glow) so they
     hold on the photo */
  html[data-wallpaper][data-theme='light'] & { text-shadow: 0 1px 1px rgba(0, 0, 0, 0.55), 0 1px 3px rgba(0, 0, 0, 0.35); }
  html[data-wallpaper] &:hover:not([aria-selected="true"]) { color: #fff; border-bottom-color: rgba(255, 255, 255, 0.6); }
`;
