import styled from 'styled-components';
import { entryTitleText } from '../../utils/entryTitle.js';
import { Icon } from '../../../../design-system/components/core/Icon.jsx';
import {
  ENTRY_ROW_COLUMNS, ENTRY_ROW_PADDING, formatRowDate,
  MetaCell, DateCell, TopicCell, EntryCell, EntryTitle, EntryPreview,
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
}

/* Spreadsheet row (see EntryTable): Topic over Date | Entry | chevron, with a
   hairline rule between rows. Used by Tasks, Todos, Topics and Health lists. */

function extractTitle(html: string, fallback?: string): string {
  return entryTitleText(html) || fallback || 'Untitled';
}

const Row = styled.div`
  display: grid;
  grid-template-columns: ${ENTRY_ROW_COLUMNS};
  gap: 12px;
  align-items: center;
  padding: ${ENTRY_ROW_PADDING};
  cursor: pointer;
  border-bottom: 1px solid var(--border-subtle);
  transition: background 120ms;
  &:hover { background: var(--bg-hover); }
`;

const Chevron = styled.span`
  display: flex;
  align-items: center;
  color: var(--text-tertiary);
  flex-shrink: 0;
`;

export function EntryListCard({ content, createdAt, topicName, completed, onClick, fallbackTitle, preview }: EntryListCardProps) {
  const title = extractTitle(content, fallbackTitle);

  return (
    <Row onClick={onClick}>
      <MetaCell>
        {topicName && <TopicCell>{topicName}</TopicCell>}
        <DateCell title={createdAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}>
          {formatRowDate(createdAt)}
        </DateCell>
      </MetaCell>
      <EntryCell>
        <EntryTitle $completed={completed}>{title}</EntryTitle>
        {preview && <EntryPreview>{preview}</EntryPreview>}
      </EntryCell>
      <Chevron>
        <Icon name="chevron-right" size={16} strokeWidth={2} />
      </Chevron>
    </Row>
  );
}
