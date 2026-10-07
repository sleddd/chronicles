import styled from 'styled-components';
import { entryTitleText } from '../../utils/entryTitle.js';
import { Icon } from '../../../../design-system/components/core/Icon.jsx';
import { SwipeActions } from '../molecules/SwipeActions.js';
import {
  ENTRY_ROW_COLUMNS, ENTRY_ROW_INSET_PADDING, formatRowDate,
  MetaCell, DateCell, TopicCell, EntryCell, EntryTitle,
} from '../molecules/EntryTable.js';
import { Checkbox } from '../atoms/Checkbox.js';
import { useUIStore } from '../../stores/uiStore.js';

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
  onToggleComplete?: (id: number, completed: boolean) => void;
  onToggleBookmark?: (id: number, isFavorite: boolean) => void;
  hasCheckbox?: boolean;
  isCompleted?: boolean;
  isFavorite?: boolean;
  customType?: string;
  previewText?: string;
}

function extractTitle(html: string, fallback?: string): string {
  return entryTitleText(html) || fallback || 'Untitled entry';
}

/* Spreadsheet row (see EntryTable): Topic over Date | Entry | controls.
   Hairline rule between rows; the selected row gets a faint fill and a
   2px accent left bar. */
const Row = styled.div<{ $active?: boolean }>`
  position: relative;
  display: grid;
  grid-template-columns: ${ENTRY_ROW_COLUMNS};
  gap: 12px;
  align-items: center;
  box-sizing: border-box;
  cursor: pointer;
  padding: ${ENTRY_ROW_INSET_PADDING};
  border-bottom: 1px solid var(--border-subtle);
  background: ${({ $active }) => $active ? 'var(--bg-active)' : 'transparent'};
  transition: background 120ms;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 2px;
    background: ${({ $active }) => $active ? 'var(--color-accent)' : 'transparent'};
  }

  &:hover {
    background: var(--bg-hover);
  }
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

const CheckWrap = styled.span`
  display: inline-flex;
  align-items: center;
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
  topicId, active, onClick, onDelete, onTopicClick, onToggleComplete, onToggleBookmark,
  hasCheckbox, isCompleted, isFavorite, previewText,
}: EntryCardProps) {
  const accentColor = useUIStore(s => s.accentColor) || '#4A5568';

  const d = new Date(date);
  const title = extractTitle(content, previewText);

  const inner = (
    <Row $active={active} onClick={onClick}>
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
          <TopicCell $active={active}>{topicName}</TopicCell>
        ) : null}
        <DateCell title={d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}>
          {formatRowDate(d)}
        </DateCell>
      </MetaCell>
      <EntryCell>
        <EntryTitle $completed={isCompleted}>{title}</EntryTitle>
      </EntryCell>
      <EndCol>
        {hasCheckbox && onToggleComplete && (
          <CheckWrap
            onClick={e => e.stopPropagation()}
            title={isCompleted ? 'Mark not done' : 'Mark done'}
          >
            <Checkbox checked={!!isCompleted} onChange={checked => onToggleComplete(id, checked)} />
          </CheckWrap>
        )}
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
