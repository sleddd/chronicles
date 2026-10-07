import styled from 'styled-components';
import { entryTitleText } from '../../utils/entryTitle.js';
import { Icon } from '../../../../design-system/components/core/Icon.jsx';
import { SwipeActions } from '../molecules/SwipeActions.js';
import { Checkbox } from '../atoms/Checkbox.js';
import { useUIStore } from '../../stores/uiStore.js';
import { stripHtml } from '../../utils/stripHtml.js';

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


/* Mobile-style entry row: big day number + weekday left, dot + uppercase topic
   label, title, preview, right chevron. Hairline divider; selected row gets a
   faint fill + topic-colored left bar. */
const Row = styled.div<{ $active?: boolean; $accent?: string }>`
  position: relative;
  display: grid;
  grid-template-columns: 52px 1fr auto;
  gap: 18px;
  align-items: center;
  box-sizing: border-box;
  cursor: pointer;
  padding: 18px 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: ${({ $active }) => $active ? 'var(--bg-active)' : 'transparent'};
  transition: background 120ms;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: ${({ $active }) => $active ? 'var(--color-accent)' : 'transparent'};
  }

  &:hover {
    background: var(--bg-hover);
  }
`;

const DateCol = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1;
`;

const DayNum = styled.span`
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 200;
  color: var(--text-primary);
  line-height: 1;
  letter-spacing: -0.01em;
`;

const MonthLabel = styled.span`
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin-top: 6px;
`;

const ContentArea = styled.div`
  min-width: 0;
`;

const TopicRow = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 5px;
`;

const TopicLabel = styled.span<{ $active?: boolean }>`
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ $active }) => $active ? 'var(--color-accent)' : 'var(--text-tertiary)'};
`;

/* Tapping the topic label filters the list to that topic */
const TopicButton = styled.button<{ $active?: boolean }>`
  all: unset;
  cursor: pointer;
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ $active }) => $active ? 'var(--color-accent)' : 'var(--text-tertiary)'};
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const CheckWrap = styled.span`
  display: inline-flex;
  align-items: center;
`;

const TitleText = styled.div<{ $completed?: boolean }>`
  font-family: var(--font-sans);
  font-weight: 400;
  font-size: 17px;
  color: ${({ $completed }) => $completed ? 'var(--text-tertiary)' : 'var(--text-primary)'};
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-decoration: ${({ $completed }) => $completed ? 'line-through' : 'none'};
  margin: 0;
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
  id, content, date, topicName, topicColor,
  topicId, active, onClick, onDelete, onTopicClick, onToggleComplete, onToggleBookmark,
  hasCheckbox, isCompleted, isFavorite, previewText,
}: EntryCardProps) {
  const accentColor = useUIStore(s => s.accentColor) || '#4A5568';

  const d = new Date(date);
  const dayNum = d.getDate();
  const month = d.toLocaleDateString('en-US', { month: 'short' });

  const title = extractTitle(content, previewText);

  const inner = (
    <Row $active={active} $accent={topicColor} onClick={onClick}>
      <DateCol>
        <DayNum>{dayNum}</DayNum>
        <MonthLabel>{month}</MonthLabel>
      </DateCol>
      <ContentArea>
        {topicName && (
          <TopicRow>
            {onTopicClick && topicId != null ? (
              <TopicButton
                type="button"
                $active={active}
                onClick={e => { e.stopPropagation(); onTopicClick(topicId); }}
                title={`Show only ${topicName}`}
              >
                {topicName}
              </TopicButton>
            ) : (
              <TopicLabel $active={active}>{topicName}</TopicLabel>
            )}
          </TopicRow>
        )}
        <TitleText $completed={isCompleted}>{title}</TitleText>
      </ContentArea>
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
