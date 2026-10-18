import { css } from 'styled-components';

/*
 * ONE row style for every list in the app (journal, topic/health/goals/
 * shopping/planner lists, Topics):
 *   - journal (entryRow): rows have no fill of their own; hovering shows only the
 *     3px accent bar (the background doesn't change); the open entry lifts to
 *     the page colour — the editor's colour, with no
 *     divider between list and editor, so the open row runs into the edit area,
 *     and a 3px accent bar on its left edge
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

/* Journal hover: just the accent bar — the background stays put */
const rowHoverBar = css`
  box-shadow: inset 3px 0 0 var(--color-accent);
`;

const rowStyle = (base: string, active: ReturnType<typeof css>, firstRowHint: boolean, hover = active) => css<{ $active?: boolean; $hint?: boolean }>`
  background: ${base};
  transition: background 120ms, box-shadow 120ms;
  &:hover, &:focus-visible { ${hover} outline: none; }
  ${({ $active }) => $active && active}
  ${({ $hint }) => firstRowHint && $hint && css`
    html:not([data-entry-row-hover]) & { ${active} }
  `}
`;

/** Journal list: rows unfilled; the open row sits on the page (editor) colour with a 3px accent bar; hover shows only the bar */
export const entryRow = rowStyle('transparent', rowActive, true, rowHoverBar);
/** Every other list (topic, health, goals, shopping, planner, Topics): page-colour rows, sunken active row, no bar */
export const entryRowPlain = rowStyle('var(--bg-app)', rowActivePlain, false);

export const clearRowHover = () => { delete document.documentElement.dataset[HOVER_FLAG]; };

export const rowHoverHandlers = {
  onMouseEnter: () => { document.documentElement.dataset[HOVER_FLAG] = '1'; },
  onMouseLeave: clearRowHover,
};
