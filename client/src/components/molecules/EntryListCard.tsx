import styled, { css } from 'styled-components';
import { entryTitleText } from '../../utils/entryTitle.js';
import { Icon } from '../../../../design-system/components/core/Icon.jsx';
import {
  formatListDate, DateCell, TopicCell, EntryCell, EntryTitle, EntryPreview,
} from './EntryTable.js';

interface EntryListCardProps {
  content: string;
  createdAt: Date;
  topicName?: string;
  topicColor?: string;
  completed?: boolean;
  onClick?: () => void;
  /** Title shown when the content has no text (e.g. built-in name field). */
  fallbackTitle?: string;
  /** Muted single line under the title (e.g. custom-field summary). */
  preview?: string;
  /** First row of a list: shown highlighted until the pointer hovers a row. */
  hint?: boolean;
}

/* Spreadsheet row: [Topic] | Entry | DATE | chevron, with a hairline rule
   between rows. Used by Tasks, Todos, Topics, Health and Shopping lists — the
   journal list (EntryCard) keeps its stacked Topic-over-Date column. */

function extractTitle(html: string, fallback?: string): string {
  return entryTitleText(html) || fallback || 'Untitled';
}

/* Accent outline — 3px left bar, 1px top/right/bottom (inset, so nothing shifts). */
const highlighted = css`
  z-index: 1;
  border-top-color: var(--color-accent);
  border-bottom-color: var(--color-accent);
  box-shadow: inset 3px 0 0 var(--color-accent), inset -1px 0 0 var(--color-accent);
`;

/* While the pointer is over any row, hover owns the highlight; the first-row
   hint returns when it leaves. Flag lives on <html> so rows in separate
   wrappers (SwipeActions) can see it. */
const HOVER_FLAG = 'entryRowHover';

const Row = styled.div<{ $hasTopic: boolean; $hint?: boolean }>`
  display: grid;
  grid-template-columns: ${({ $hasTopic }) =>
    $hasTopic ? 'minmax(0, 88px) minmax(0, 1fr) auto auto' : 'minmax(0, 1fr) auto auto'};
  gap: 12px;
  align-items: center;
  padding: 22px 10px 22px 16px;
  cursor: pointer;
  position: relative;
  /* Transparent top border overlaps the previous row's rule (-1px margin), so
     on hover both the top and bottom rules can turn accent without doubling. */
  margin-top: -1px;
  border-top: 1px solid transparent;
  border-bottom: 1px solid var(--border-subtle);
  transition: box-shadow 120ms, border-color 120ms;
  &:hover { ${highlighted} }
  /* First row starts highlighted — a hint that rows open — until hover takes over */
  ${({ $hint }) => $hint && css`
    html:not([data-entry-row-hover]) & { ${highlighted} }
  `}
`;

const ListDate = styled(DateCell)`
  font-family: var(--font-label);
  letter-spacing: 0.08em;
  text-align: right;
`;

const Chevron = styled.span`
  display: flex;
  align-items: center;
  color: var(--text-tertiary);
  flex-shrink: 0;
`;

export function EntryListCard({ content, createdAt, topicName, completed, onClick, fallbackTitle, preview, hint }: EntryListCardProps) {
  const title = extractTitle(content, fallbackTitle);

  return (
    <Row
      $hasTopic={!!topicName}
      $hint={hint}
      onClick={() => { delete document.documentElement.dataset[HOVER_FLAG]; onClick?.(); }}
      onMouseEnter={() => { document.documentElement.dataset[HOVER_FLAG] = '1'; }}
      onMouseLeave={() => { delete document.documentElement.dataset[HOVER_FLAG]; }}
    >
      {topicName && <TopicCell title={topicName}>{topicName}</TopicCell>}
      <EntryCell>
        <EntryTitle $completed={completed}>{title}</EntryTitle>
        {preview && <EntryPreview>{preview}</EntryPreview>}
      </EntryCell>
      <ListDate title={createdAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}>
        {formatListDate(createdAt)}
      </ListDate>
      <Chevron>
        <Icon name="chevron-right" size={16} strokeWidth={2} />
      </Chevron>
    </Row>
  );
}
