import styled from 'styled-components';
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

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function extractTitle(html: string, fallback?: string): string {
  const headingMatch = html.match(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/i);
  if (headingMatch) {
    // Sanitized text extraction — never parse raw entry HTML into the live DOM
    const text = stripHtml(headingMatch[1]).trim();
    if (text) return text;
  }
  return stripHtml(html).trim().slice(0, 60) || fallback || 'Untitled';
}

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
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
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

const HeaderDivider = styled.div`
  height: 1px;
  background: var(--border-subtle);
  flex-shrink: 0;
  margin-top: 16px;
`;

const List = styled.div`
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  @media (max-width: 768px) {
    padding: 0 12px;
  }
`;

const DayDivider = styled.div<{ $isToday: boolean; $accentColor: string }>`
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 20px 24px 8px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-app);
  position: sticky;
  top: 0;
  z-index: 1;
`;

const DayBigNum = styled.span<{ $isToday: boolean; $accentColor: string }>`
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 200;
  line-height: 1;
  color: ${({ $isToday, $accentColor }) => $isToday ? $accentColor : 'var(--text-primary)'};
  letter-spacing: -0.01em;
`;

const DayWeekday = styled.span`
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
`;

const EmptyDay = styled.div`
  padding: 12px 24px 20px;
  font-size: 13px;
  color: var(--text-tertiary);
`;

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

/* ── Component ── */

interface CalendarWeekViewProps {
  weekStart: Date;
  entriesByDate: Map<string, DecryptedPost[]>;
  allTopics: Topic[];
  accentColor: string;
  eventTopicIds: Set<number>;
  taskTopicIds: Set<number>;
  selectedDate: string;
  viewMode: CalendarViewMode;
  currentDate: Date;
  getTopicForEntry: (entry: DecryptedPost) => Topic | undefined;
  onDayClick: (dateStr: string) => void;
  onDayDoubleClick: (dateStr: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewMode: (mode: CalendarViewMode) => void;
}

export function CalendarWeekView({
  weekStart, entriesByDate, accentColor, eventTopicIds,
  viewMode, getTopicForEntry,
  onPrev, onNext, onToday, onViewMode,
}: CalendarWeekViewProps) {
  const navigate = useNavigate();
  const setSelectedEntryId = useUIStore(s => s.setSelectedEntryId);
  const today = new Date();

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const weekEnd = days[6];
  const startMonth = weekStart.toLocaleDateString('en-US', { month: 'long' });
  const endMonth = weekEnd.toLocaleDateString('en-US', { month: 'long' });
  const titleMonth = startMonth === endMonth ? startMonth : `${startMonth} – ${endMonth}`;
  const title = <>{titleMonth} <span>{weekStart.getFullYear()}</span></>;

  return (
    <Wrapper>
      <CalendarHeader
        title={title}
        viewMode={viewMode}
        accentColor={accentColor}
        onPrev={onPrev}
        onNext={onNext}
        onToday={onToday}
        onViewMode={onViewMode}
      />
      <HeaderDivider />

      <List>
        {days.map(date => {
          const dateStr = toDateStr(date);
          const dayEntries = entriesByDate.get(dateStr) || [];
          const isToday = isSameDay(date, today);
          const weekday = date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();

          return (
            <div key={dateStr}>
              <DayDivider $isToday={isToday} $accentColor={accentColor}>
                <DayBigNum $isToday={isToday} $accentColor={accentColor}>{date.getDate()}</DayBigNum>
                <DayWeekday>{weekday}</DayWeekday>
              </DayDivider>

              {dayEntries.length === 0 ? (
                <EmptyDay>No entries</EmptyDay>
              ) : (
                dayEntries.map(entry => {
                  const topic = getTopicForEntry(entry);
                  const timeLabel = getTimeLabel(entry, eventTopicIds);
                  const title = extractTitle(entry.content, builtinEntryName((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>));

                  return (
                    <EntryRow key={entry.id} onClick={() => { setSelectedEntryId(entry.id); navigate('/journal', { state: { from: '/calendar' } }); }}>
                      <DateCol>
                        <TimeLabel>{timeLabel}</TimeLabel>
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
            </div>
          );
        })}
      </List>
    </Wrapper>
  );
}
