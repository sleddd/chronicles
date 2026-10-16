import { css } from 'styled-components';

/*
 * ONE row style for every list in the app (journal, topic/health/goals/
 * shopping/planner lists, Topics):
 *   - journal (entryRow): rows on the sunken fill; the active row (hovered,
 *     or the open entry) lifts to the page colour with a 3px accent bar
 *   - every other list (entryRowPlain): the reverse — rows on the page
 *     colour, the active row sinks to the sunken fill, no bar
 *   - journal only: the first row starts active, as a hint, until the
 *     pointer is over any row (hover then takes over). Other lists show no
 *     first-row highlight (their first row just gets a top rule)
 * Containers spread `rowHoverHandlers` on each row so the hint knows when
 * a row is hovered (flag on <html>, since rows live in separate wrappers).
 */

const HOVER_FLAG = 'entryRowHover';

export const rowActive = css`
  background: var(--bg-app);
  box-shadow: inset 3px 0 0 var(--color-accent);
`;

/* Non-journal lists are the reverse: rows on the page colour, the active row
   sinks to the sunken fill — no accent bar */
const rowActivePlain = css`
  background: var(--bg-sunken);
`;

const rowStyle = (base: string, active: ReturnType<typeof css>, firstRowHint: boolean) => css<{ $active?: boolean; $hint?: boolean }>`
  background: ${base};
  transition: background 120ms, box-shadow 120ms;
  &:hover, &:focus-visible { ${active} outline: none; }
  ${({ $active }) => $active && active}
  ${({ $hint }) => firstRowHint && $hint && css`
    html:not([data-entry-row-hover]) & { ${active} }
  `}
`;

/** Journal list: active row has the 3px accent bar */
export const entryRow = rowStyle('var(--bg-sunken)', rowActive, true);
/** Every other list (topic, health, goals, shopping, planner, Topics): page-colour rows, sunken active row, no bar */
export const entryRowPlain = rowStyle('var(--bg-app)', rowActivePlain, false);

export const clearRowHover = () => { delete document.documentElement.dataset[HOVER_FLAG]; };

export const rowHoverHandlers = {
  onMouseEnter: () => { document.documentElement.dataset[HOVER_FLAG] = '1'; },
  onMouseLeave: clearRowHover,
};
