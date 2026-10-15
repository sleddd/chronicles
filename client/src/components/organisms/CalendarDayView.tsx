import styled from 'styled-components';
import { PillButton } from '../atoms/PillButton.js';
import { useNavigate } from 'react-router-dom';
import { CalendarHeader } from './CalendarHeader.js';
import { stripHtml, builtinEntryName } from '../../utils/stripHtml.js';
import { useUIStore } from '../../stores/uiStore.js';
import type { DecryptedPost } from '@shared/crypto/types';
import type { Topic } from '../../types/topics.js';
import type { CalendarViewMode } from '../../views/CalendarView.js';

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function extractTitle(html: string, fallback?: string): string {
  const headingMatch = html.match(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/i);
  if (headingMatch) {
    // Sanitized text extraction — never parse raw entry HTML into the live DOM
    const text = stripHtml(headingMatch[1]).trim();
    if (text) return text;
  }
  return stripHtml(html).trim().slice(0, 80) || fallback || 'Untitled';
}

/* ── Styled ── */

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-app);
`;

const DateSubtitle = styled.div`
  padding: 4px 24px 16px;
  font-family: var(--font-label, var(--font-sans));
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  flex-shrink: 0;
  @media (max-width: 768px) { display: none; }
`;

/* Row holding the Add entry pill, ruled off from the day's list */
const AddEntryRow = styled.div`
  padding: 14px 24px;
  border-bottom: 1px solid var(--border-subtle);
`;

const Divider = styled.div`
  height: 1px;
  background: var(--border-subtle);
  flex-shrink: 0;
`;

const List = styled.div`
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  @media (max-width: 768px) {
    padding: 0 12px;
  }
`;

const EmptyMsg = styled.div`
  padding: 60px 32px;
  font-size: 14px;
  color: var(--text-tertiary);
  text-align: center;
`;

/* journal-style entry row */
const EntryRow = styled.div`
  display: grid;
  grid-template-columns: 64px 1fr auto;
  gap: 20px;
  align-items: center;
  padding: 18px 24px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-subtle);
  transition: background 120ms ease;
  &:hover { background: var(--bg-hover); }
`;

const DateCol = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1;
`;

const TimeLabel = styled.span`
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin-top: 5px;
`;

const ContentArea = styled.div`
  min-width: 0;
`;

const TopicLabel = styled.div`
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin-bottom: 4px;
`;

const EntryTitle = styled.div`
  font-family: var(--font-sans);
  font-size: 17px;
  font-weight: 400;
  color: var(--text-primary);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ChevronArea = styled.div`
  display: none;
`;


/* ── helpers ── */
function getTimeLabel(entry: DecryptedPost, eventTopicIds: Set<number>): string {
  const meta = entry.metadata as Record<string, unknown>;
  const taxId = meta?._taxonomyId as number | undefined;
  if (taxId !== undefined && eventTopicIds.has(taxId)) {
    const cf = meta._customFields as Record<string, unknown> | undefined;
    const t = cf?.startTime as string | undefined;
    if (t) {
      const [h, m] = t.split(':').map(Number);
      if (!isNaN(h)) {
        const suffix = h >= 12 ? 'PM' : 'AM';
        return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${suffix}`;
      }
    }
  }
  const created = entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt);
  const h = created.getHours();
  const m = created.getMinutes();
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/* ── Component ── */

interface CalendarDayViewProps {
  dateStr: string;
  entries: DecryptedPost[];
  allTopics: Topic[];
  accentColor: string;
  eventTopicIds: Set<number>;
  taskTopicIds: Set<number>;
  viewMode: CalendarViewMode;
  currentDate: Date;
  getTopicForEntry: (entry: DecryptedPost) => Topic | undefined;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewMode: (mode: CalendarViewMode) => void;
}

export function CalendarDayView({
  dateStr, entries, accentColor, eventTopicIds, viewMode,
  currentDate, getTopicForEntry, onPrev, onNext, onToday, onViewMode,
}: CalendarDayViewProps) {
  const navigate = useNavigate();
  const setSelectedEntryId = useUIStore(s => s.setSelectedEntryId);
  const date = new Date(dateStr + 'T00:00:00');
  const dayNum = date.getDate();
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const title = (
    <>{monthYear.split(' ')[0]} <span>{date.getFullYear()}</span></>
  );

  const dateSubtitle = `${weekday}, ${monthYear.split(' ')[0]} ${dayNum}`;

  return (
    <Wrapper>
      <CalendarHeader
        title={title}
        subtitle={dateSubtitle}
        viewMode={viewMode}
        accentColor={accentColor}
        onPrev={onPrev}
        onNext={onNext}
        onToday={onToday}
        onViewMode={onViewMode}
      />
      <DateSubtitle>{dateSubtitle}</DateSubtitle>
      <Divider />

      <List>
        <AddEntryRow>
          <PillButton type="button" onClick={() => navigate('/journal', { state: { newEntryDate: dateStr, from: '/calendar' } })}>
            Add entry
          </PillButton>
        </AddEntryRow>
        {entries.length === 0 ? (
          <EmptyMsg>No entries for this day.</EmptyMsg>
        ) : (
          entries.map(entry => {
            const topic = getTopicForEntry(entry);
            const timeLabel = getTimeLabel(entry, eventTopicIds);
            const title = extractTitle(entry.content, builtinEntryName((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>));

            return (
              <EntryRow key={entry.id} onClick={() => { setSelectedEntryId(entry.id); navigate('/journal', { state: { from: '/calendar' } }); }}>
                <DateCol>
                  {timeLabel && <TimeLabel>{timeLabel}</TimeLabel>}
                </DateCol>
                <ContentArea>
                  {topic && <TopicLabel>{topic.name}</TopicLabel>}
                  <EntryTitle>{title}</EntryTitle>
                </ContentArea>
                <ChevronArea>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </ChevronArea>
              </EntryRow>
            );
          })
        )}
      </List>
    </Wrapper>
  );
}
