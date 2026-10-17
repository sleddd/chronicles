import styled from 'styled-components';
import { entryRowPlain, rowHoverHandlers, clearRowHover } from '../../styles/entryRow.js';
import { entryTitleText } from '../../utils/entryTitle.js';
import { Icon } from '../atoms/core/Icon.jsx';
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

const Row = styled.div<{ $hasTopic: boolean; $hint?: boolean }>`
  display: grid;
  grid-template-columns: ${({ $hasTopic }) =>
    $hasTopic ? 'minmax(0, 88px) minmax(0, 1fr) auto auto' : 'minmax(0, 1fr) auto auto'};
  gap: 12px;
  align-items: center;
  padding: 22px 10px 22px 16px;
  cursor: pointer;
  position: relative;
  border-bottom: 1px solid var(--border-subtle);
  /* The list's first row also gets a top rule, so you can see where it starts */
  border-top: ${({ $hint }) => ($hint ? '1px solid var(--border-subtle)' : 'none')};
  ${entryRowPlain}
`;

const ListDate = styled(DateCell)`
  font-family: var(--font-label);
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
      <Chevron>
        <Icon name="chevron-right" size={16} strokeWidth={2} />
      </Chevron>
    </Row>
  );
}
