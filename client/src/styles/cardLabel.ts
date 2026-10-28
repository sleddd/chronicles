import { css } from 'styled-components';

/* The dashboards' card titles ("QUICK ENTRY", "TODAY'S PRIORITIES", "MEDICATIONS"…):
   small tracked capitals in a quiet grey. One style, shared by the home and
   Health dashboards' cards (WidgetCard, DashPanel, TodayLists, the Quick entry,
   Daily quote and World clocks labels). */
export const cardLabel = css`
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
`;
