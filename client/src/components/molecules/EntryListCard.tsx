import styled from 'styled-components';
import { entryRowPlain, rowHoverHandlers, clearRowHover } from '../../styles/entryRow.js';
import { entryTitleText } from '../../utils/entryTitle.js';
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
  /** No side padding: titles line up with the list's edge (topic page) */
  flush?: boolean;
}

/* Spreadsheet row: [Topic] | Entry | DATE | chevron, with a hairline rule
   between rows. Used by Tasks, Todos, Topics, Health and Shopping lists — the
   journal list (EntryCard) keeps its stacked Topic-over-Date column. */

function extractTitle(html: string, fallback?: string): string {
  return entryTitleText(html) || fallback || 'Untitled';
}

const Row = styled.div<{ $hasTopic: boolean; $hint?: boolean; $flush?: boolean }>`
  display: grid;
  grid-template-columns: ${({ $hasTopic }) =>
    $hasTopic ? 'minmax(0, 88px) minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto'};
  gap: 12px;
  align-items: center;
  /* Flush: titles line up with the list's edge and its month headings */
  padding: 15px 0;
  cursor: pointer;
  position: relative;
  border-bottom: 1px solid var(--border-subtle);

  ${entryRowPlain}
  ${EntryTitle} { color: var(--text-secondary); }
  ${EntryPreview} { margin-top: 3px; font-size: 13px; color: var(--text-muted); }
`;

const ListDate = styled(DateCell)`
  font-size: 14px;
  font-weight: 400;
  color: var(--text-muted);
  text-align: right;
`;

export function EntryListCard({ content, createdAt, topicName, completed, onClick, fallbackTitle, preview, hint, flush }: EntryListCardProps) {
  const title = extractTitle(content, fallbackTitle);

  return (
    <Row
      $hasTopic={!!topicName}
      $hint={hint}
      $flush={flush}
      onClick={() => { clearRowHover(); onClick?.(); }}
      {...rowHoverHandlers}
    >
      {topicName && <TopicCell title={topicName}>{topicName}</TopicCell>}
      <EntryCell>
        <EntryTitle $completed={completed}>{title}</EntryTitle>
        {preview && <EntryPreview>{preview}</EntryPreview>}
      </EntryCell>
      <ListDate title={createdAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}>
        {formatListDate(createdAt)}
      </ListDate>
    </Row>
  );
}
