import styled from 'styled-components';
import { entryRow, rowHoverHandlers, clearRowHover } from '../../styles/entryRow.js';
import { entryTitleText } from '../../utils/entryTitle.js';
import { Icon } from '../atoms/core/Icon.jsx';
import { SwipeActions } from '../molecules/SwipeActions.js';
import {
  ENTRY_ROW_COLUMNS, ENTRY_ROW_INSET_PADDING, formatListDate,
  MetaCell, DateCell, TopicCell, EntryCell, EntryTitle,
} from '../molecules/EntryTable.js';
import { useUIStore } from '../../stores/uiStore.js';
import { DEFAULT_ACCENT_COLOR } from '../../styles/accent.js';

interface EntryCardProps {
  id: number;
  content: string;
  date: string;
  topicName?: string;
  topicColor?: string;
  topicId?: number;
  active?: boolean;
  onClick: () => void;
  onDelete?: () => void;
  onTopicClick?: (topicId: number) => void;
  onToggleBookmark?: (id: number, isFavorite: boolean) => void;
  isCompleted?: boolean;
  isFavorite?: boolean;
  customType?: string;
  previewText?: string;
  /** First row of the list: shown active until the pointer is over a row */
  hint?: boolean;
}

function extractTitle(html: string, fallback?: string): string {
  return entryTitleText(html) || fallback || 'Untitled entry';
}

/* Spreadsheet row (see EntryTable): Topic over Date | Entry | controls.
   Shared row style (styles/entryRow): sunken rows; the open entry, the
   hovered row and the first-row hint use the page colour + accent bar. */
const Row = styled.div<{ $active?: boolean; $hint?: boolean }>`
  position: relative;
  display: grid;
  grid-template-columns: ${ENTRY_ROW_COLUMNS};
  gap: 12px;
  align-items: center;
  box-sizing: border-box;
  cursor: pointer;
  padding: ${ENTRY_ROW_INSET_PADDING};
  border-bottom: 1px solid var(--border-subtle);
  ${entryRow}
`;

/* Tapping the topic filters the list to that topic */
const TopicButton = styled.button<{ $active?: boolean }>`
  all: unset;
  cursor: pointer;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ $active }) => $active ? 'var(--color-accent)' : 'var(--text-tertiary)'};
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const EndCol = styled.div`
  display: flex;
  align-items: center;
  gap: var(--s-2, 8px);
  color: var(--text-tertiary);
`;

const BookmarkIcon = styled.span`
  color: var(--color-accent);
  font-size: 11px;
  line-height: 1;
  flex-shrink: 0;
  cursor: pointer;
  &:hover { opacity: 0.7; }
`;

export function EntryCard({
  id, content, date, topicName,
  topicId, active, onClick, onDelete, onTopicClick, onToggleBookmark,
  isCompleted, isFavorite, previewText, hint,
}: EntryCardProps) {
  const accentColor = useUIStore(s => s.accentColor) || DEFAULT_ACCENT_COLOR;

  const d = new Date(date);
  const title = extractTitle(content, previewText);

  const inner = (
    <Row $active={active} $hint={hint} onClick={() => { clearRowHover(); onClick(); }} {...rowHoverHandlers}>
      <MetaCell>
        {topicName && onTopicClick && topicId != null ? (
          <TopicButton
            type="button"
            $active={active}
            onClick={e => { e.stopPropagation(); onTopicClick(topicId); }}
            title={`Show only ${topicName}`}
          >
            {topicName}
          </TopicButton>
        ) : topicName ? (
          <TopicCell $active={active} title={topicName}>{topicName}</TopicCell>
        ) : null}
        <DateCell title={d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}>
          {formatListDate(d)}
        </DateCell>
      </MetaCell>
      <EntryCell>
        <EntryTitle $completed={isCompleted}>{title}</EntryTitle>
      </EntryCell>
      <EndCol>
        {isFavorite && (
          <BookmarkIcon
            onClick={e => { e.stopPropagation(); onToggleBookmark?.(id, false); }}
            title="Remove bookmark"
          >
            <Icon name="bookmark" size={14} strokeWidth={2} />
          </BookmarkIcon>
        )}
      </EndCol>
    </Row>
  );

  return onDelete ? (
    <SwipeActions onDelete={onDelete} accentColor={accentColor}>
      {inner}
    </SwipeActions>
  ) : inner;
}
