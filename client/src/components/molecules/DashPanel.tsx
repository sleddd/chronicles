import styled, { css } from 'styled-components';
import { glassCard } from '../../styles/wallpaper.js';
import type { ReactNode } from 'react';

/* The home dashboard cards' title (WidgetCard $open in DashboardView) */
const dashTitle = css`
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 300;
  letter-spacing: 0;
  text-transform: none;
  line-height: 40px;
  /* A step back from full strength, so the cards' content leads */
  color: color-mix(in srgb, var(--text-primary) 82%, transparent);
`;

/* Health dashboard panel — the home dashboard's widget card: a --bg-panel card
   (14px corners, no outline), the title as on the home dashboard's cards (22px
   thin Work Sans) over a light rule with a muted note or control on the right,
   16px above the content. Props only. */

export const DashPanel = styled.section`
  min-width: 0;
  /* The home dashboard cards' padding: a little less above the title */
  padding: 20px 32px 28px;
  background: var(--bg-panel);
  /* The home dashboard widgets' corners and soft, even shadow */
  border-radius: 16px;
  box-shadow: var(--shadow-card);
  @media (max-width: 480px) { padding: 14px 20px 22px; }
  ${glassCard}
  /* Titles as on the home dashboard's cards: 22px thin sentence-case Work Sans on a
     40px line, 22px above the hairline and 24px below it — the panel's own head
     (DashPanelHead) and the heads the shared lists bring (Medications, Exercise
     schedule, Habits) */
  && > :first-child:has(> h2) { min-height: 40px; padding-bottom: 22px; margin-bottom: 24px; }
  && > :first-child > h2 { ${dashTitle} }
`;

/* Foldable (organisms/FoldingDashPanel): the head keeps clear of the chevron, and a
   folded panel is just its title row — no fill or shadow, edge to edge, its title faded,
   as on the home dashboard */
export const FoldableBox = styled(DashPanel)<{ $folded: boolean }>`
  position: relative;
  && > :first-child:has(> h2) { padding-right: 44px; }
  /* The title row's links (Symptoms, Med list, Schedule, Habits…) quiet grey like the
     home dashboard's — the accent only on hover */
  && > :first-child:has(> h2) > a,
  && > :first-child:has(> h2) > div > a,
  && > :first-child:has(> h2) > button {
    font-size: 14px;
    font-weight: 400;
    color: var(--text-muted);
    text-decoration: none;
    transition: color 120ms;
  }
  && > :first-child:has(> h2) > a:hover,
  && > :first-child:has(> h2) > div > a:hover,
  && > :first-child:has(> h2) > button:hover { color: var(--color-accent-link); }
  ${({ $folded }) => ($folded ? css`
    /* !important: the wallpaper's card rule (html[data-wallpaper] …) out-ranks these, and
       a folded panel must never keep its fill */
    && {
      padding: 16px 0;
      background: none !important;
      box-shadow: none !important;
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }
    && > :not(:first-child):not([data-fold-btn]) { display: none; }
    && > :first-child:has(> h2) { padding-bottom: 0; margin-bottom: 0; border-bottom: none; }
    && > :first-child > h2 { color: var(--text-muted); opacity: 0.75; }
    /* Controls that only make sense open (the Quick log's Meal | Exercise) go */
    && [data-fold-hide] { display: none; }
  ` : '')}
`;

/* The chevron at the top right that folds the panel to its title row */
export const FoldBtn = styled.button<{ $folded: boolean }>`
  position: absolute;
  top: 25px;
  right: 22px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  svg { transition: transform 150ms ease; transform: rotate(${({ $folded }) => ($folded ? 0 : 180)}deg); }
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  @media (max-width: 480px) { top: 19px; right: 14px; }
  ${({ $folded }) => ($folded ? 'top: 21px !important; right: -6px !important;' : '')}
`;

const Head = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 24px;
  min-height: 40px;
  padding-bottom: 22px;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--border-subtle);
`;

const Title = styled.h2`
  margin: 0;
  ${dashTitle}
`;

const Aside = styled.div`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

export function DashPanelHead({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <Head>
      <Title>{title}</Title>
      {aside != null && <Aside>{aside}</Aside>}
    </Head>
  );
}
