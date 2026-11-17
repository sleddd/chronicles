import styled from 'styled-components';
import { entryRow, rowHoverHandlers, clearRowHover } from '../../styles/entryRow.js';
import { entryTitleText } from '../../utils/entryTitle.js';
import { Icon } from '../atoms/core/Icon.jsx';
import { SwipeActions } from '../molecules/SwipeActions.js';
import { formatListDate, DateCell, TopicCell, EntryCell, EntryTitle } from '../molecules/EntryTable.js';
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
  /** Off when the list is one day (its heading already names it) */
  showDate?: boolean;
}

function extractTitle(html: string, fallback?: string): string {
  return entryTitleText(html) || fallback || 'Untitled entry';
}

/* Spreadsheet row (see EntryTable): Topic over Date | Entry | controls.
   Shared row style (styles/entryRow): sunken rows; the open entry, the
   hovered row and the first-row hint use the page (editor) colour + accent bar. */
/* One line: the small topic label, then the title (the date on the right only
   when the list spans days). Compact, a hairline between rows */
const Row = styled.div<{ $active?: boolean; $hint?: boolean; $noTopic?: boolean }>`
  position: relative;
  display: grid;
  grid-template-columns: ${({ $noTopic }) => ($noTopic ? 'minmax(0, 1fr) auto' : 'minmax(0, 84px) minmax(0, 1fr) auto')};
  gap: 12px;
  align-items: baseline;
  box-sizing: border-box;
  cursor: pointer;
  padding: 17px 20px;
  /* A faint hairline — fainter than --border-subtle on the darker list pane */
  border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 50%, transparent);
  ${entryRow}
`;

/* List titles stay quiet (soft grey, a little smaller); the open entry is bright */
const RowTitle = styled(EntryTitle)<{ $open?: boolean }>`
  font-size: 14px;
  color: ${({ $completed, $open }) => ($completed ? 'var(--text-tertiary)' : $open ? 'var(--text-primary)' : 'color-mix(in srgb, var(--text-primary) 62%, transparent)')};
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
  /* Bold on the open entry */
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  letter-spacing: 0.12rem;
  text-transform: uppercase;
  /* Accent on the open / hovered row (--row-topic, set by styles/entryRow) */
  color: var(--row-topic, var(--text-meta));
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* The same label when it isn't a button: accent and bold on the open entry */
const RowTopic = styled(TopicCell)`
  color: var(--row-topic, var(--text-meta));
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
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
  isCompleted, isFavorite, previewText, hint, showDate = true,
}: EntryCardProps) {
  const accentColor = useUIStore(s => s.accentColor) || DEFAULT_ACCENT_COLOR;

  const d = new Date(date);
  const title = extractTitle(content, previewText);

  const inner = (
    <Row $active={active} $hint={hint} $noTopic={!topicName} onClick={() => { clearRowHover(); onClick(); }} {...rowHoverHandlers}>
      {topicName && <span style={{ minWidth: 0, display: 'flex' }}>
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
          <RowTopic $active={active} title={topicName}>{topicName}</RowTopic>
        ) : null}
      </span>}
      <EntryCell>
        <RowTitle $completed={isCompleted} $open={active}>{title}</RowTitle>
      </EntryCell>
      <EndCol>
        {showDate && (
          <DateCell title={d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}>
            {formatListDate(d)}
          </DateCell>
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
