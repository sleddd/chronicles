import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { CalendarHeader } from './CalendarHeader.js';
import { stripHtml, builtinEntryName } from '../../utils/stripHtml.js';
import { useUIStore } from '../../stores/uiStore.js';
import type { DecryptedPost } from '@shared/crypto/types';
import type { Topic } from '../../types/topics.js';
import type { CalendarViewMode } from '../../views/CalendarView.js';
import type { CalendarBillItem } from '../../types/finance.js';
import { formatCents } from '../../utils/finance.js';

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

const List = styled.div`
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 24px;
`;

/* One row per day: big thin number + short weekday | the day's items */
const DayRow = styled.div`
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 20px;
  align-items: center;
  min-height: 80px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border-subtle);
  @media (max-width: 640px) { grid-template-columns: 84px minmax(0, 1fr); gap: 12px; }
`;

const DayLabel = styled.div`
  display: flex;
  align-items: baseline;
  gap: 12px;
`;

const DayBigNum = styled.span<{ $isToday: boolean }>`
  font-family: var(--font-display);
  font-size: 34px;
  font-weight: 300;
  line-height: 1;
  color: ${({ $isToday }) => ($isToday ? 'var(--color-accent-link)' : 'var(--text-secondary)')};
  font-variant-numeric: tabular-nums;
`;

const DayWeekday = styled.span`
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

const Items = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
`;

const Item = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-secondary);
  cursor: pointer;
  & > span:first-of-type { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  small { flex: none; font-size: 13px; color: var(--text-muted); }
  &:hover { color: var(--text-primary); }
`;

const Dot = styled.i<{ $bill?: boolean }>`
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${({ $bill }) => ($bill ? 'var(--chart-amber)' : 'var(--color-accent)')};
`;

const Dash = styled.span`
  color: var(--text-faint);
  font-family: var(--font-sans);
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
  /** Bills due by day (Finance on) */
  billsByDate?: Map<string, CalendarBillItem[]>;
  onBillClick?: (bill: CalendarBillItem) => void;
  onDayClick: (dateStr: string) => void;
  onDayDoubleClick: (dateStr: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewMode: (mode: CalendarViewMode) => void;
}

export function CalendarWeekView({
  weekStart, entriesByDate, accentColor, eventTopicIds,
  viewMode, getTopicForEntry, billsByDate, onBillClick,
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
      <List>
        {days.map(date => {
          const dateStr = toDateStr(date);
          const dayEntries = entriesByDate.get(dateStr) || [];
          const dayBills = billsByDate?.get(dateStr) || [];
          const isToday = isSameDay(date, today);
          return (
            <DayRow key={dateStr}>
              <DayLabel>
                <DayBigNum $isToday={isToday}>{date.getDate()}</DayBigNum>
                <DayWeekday>{date.toLocaleDateString('en-US', { weekday: 'short' })}</DayWeekday>
              </DayLabel>
              <Items>
                {dayBills.map(b => (
                  <Item key={b.key} type="button" onClick={() => onBillClick?.(b)}>
                    <Dot $bill aria-hidden="true" /><span>{b.name}</span><small>{formatCents(b.amountCents)} due</small>
                  </Item>
                ))}
                {dayEntries.map(entry => {
                  const topic = getTopicForEntry(entry);
                  const title = extractTitle(entry.content, builtinEntryName((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>));
                  return (
                    <Item key={entry.id} type="button" onClick={() => { setSelectedEntryId(entry.id); navigate('/journal', { state: { from: '/calendar' } }); }}>
                      <Dot aria-hidden="true" /><span>{title}</span>{topic && <small>{topic.name} · {getTimeLabel(entry, eventTopicIds)}</small>}
                    </Item>
                  );
                })}
                {dayBills.length === 0 && dayEntries.length === 0 && <Dash aria-label="Nothing this day">—</Dash>}
              </Items>
            </DayRow>
          );
        })}
      </List>
    </Wrapper>
  );
}
