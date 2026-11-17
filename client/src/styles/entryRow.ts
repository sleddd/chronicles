import { css } from 'styled-components';

/*
 * ONE row style for every list in the app (journal, topic/health/goals/
 * shopping/planner lists, Topics):
 *   - journal (entryRow): rows have no fill of their own and no accent bar; hovering
 *     turns the row's topic label accent (the background doesn't change); the open
 *     entry lifts to the page colour — the editor's colour, with no divider between
 *     list and editor, so the open row runs into the edit area — with its topic
 *     label in the accent
 *   - every other list (entryRowPlain): rows on the page colour; hover and
 *     the active row show a rounded accent (--color-accent-line) outline (no fill, no bar)
 *   - journal only: the first row starts active, as a hint, until the
 *     pointer is over any row (hover then takes over). Other lists show no
 *     first-row highlight (their first row just gets a top rule)
 * Containers spread `rowHoverHandlers` on each row so the hint knows when
 * a row is hovered (flag on <html>, since rows live in separate wrappers).
 */

const HOVER_FLAG = 'entryRowHover';

/* No accent bar on the row (the nav rail keeps the accent bar): the active row's
   topic label turns accent instead, through --row-topic, which the label reads */
export const rowActive = css`
  background: var(--bg-editor, var(--bg-app));
  --row-topic: var(--color-accent-text);
`;

/* Non-journal lists: no fill change — hover / the active row draw a rounded
   outline a little wider than the row (its text is flush with the list edge) */
const rowActivePlain = css`
  &::before { opacity: 1; }
`;

const plainOutline = css`
  position: relative;
  &::before {
    content: '';
    position: absolute;
    inset: 0 -14px;
    border: 1px solid var(--color-accent-line);
    border-radius: 10px;
    opacity: 0;
    transition: opacity 120ms;
    pointer-events: none;
  }
`;

/* Journal hover: just the topic label in the accent — the background stays put */
const rowHoverBar = css`
  --row-topic: var(--color-accent-text);
`;

const rowStyle = (base: string, active: ReturnType<typeof css>, firstRowHint: boolean, hover = active, extra = css``) => css<{ $active?: boolean; $hint?: boolean }>`
  ${extra}
  background: ${base};
  transition: background 120ms, box-shadow 120ms;
  &:hover, &:focus-visible { ${hover} outline: none; }
  ${({ $active }) => $active && active}
  ${({ $hint }) => firstRowHint && $hint && css`
    html:not([data-entry-row-hover]) & { ${active} }
  `}
`;

/** Journal list: rows unfilled; the open row sits on the page (editor) colour with its topic label in the accent; hover turns the topic accent too */
export const entryRow = rowStyle('transparent', rowActive, true, rowHoverBar);
/** Every other list (topic, health, goals, shopping, planner, Topics): page-colour rows, a rounded outline on hover / active, no fill or bar.
 *  On a wallpaper the rows go clear (--row-plain-bg, GlobalStyle), so the photo isn't striped by them */
export const entryRowPlain = rowStyle('var(--row-plain-bg, var(--bg-app))', rowActivePlain, false, rowActivePlain, plainOutline);

export const clearRowHover = () => { delete document.documentElement.dataset[HOVER_FLAG]; };

export const rowHoverHandlers = {
  onMouseEnter: () => { document.documentElement.dataset[HOVER_FLAG] = '1'; },
  onMouseLeave: clearRowHover,
};
