import styled from 'styled-components';
import { CalendarHeader } from './CalendarHeader.js';
import { stripHtml, builtinEntryName } from '../../utils/stripHtml.js';
import type { DecryptedPost } from '@shared/crypto/types';
import type { CalendarViewMode } from '../../views/CalendarView.js';
import type { CalendarBillItem } from '../../types/finance.js';
import { formatCents } from '../../utils/finance.js';

/* ── Helpers ── */

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay(); // Sun = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const days: { date: Date; isOutside: boolean }[] = [];
  for (let i = startDow - 1; i >= 0; i--) days.push({ date: new Date(year, month - 1, prevMonthDays - i), isOutside: true });
  for (let d = 1; d <= daysInMonth; d++) days.push({ date: new Date(year, month, d), isOutside: false });
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) for (let d = 1; d <= remaining; d++) days.push({ date: new Date(year, month + 1, d), isOutside: true });
  return days;
}

/* ── Styled ── */

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-app);
  /* The day's list scrolls in under it here, so the grid keeps its own height */
  @media (max-width: 900px) { flex: none; min-height: 560px; }
  @media (max-width: 768px) { min-height: 0; }
`;

const GridArea = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 24px 0;
  overflow: hidden;
`;

/* Sun … Sat, left-aligned over each column, a firmer rule under them */
const WeekdayRow = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid var(--border-default);
  border-top: 1px solid var(--border-default);
  padding-top: 12px;
`;

const WeekdayLabel = styled.div`
  padding: 0 14px 12px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

/* Faint grid lines between cells; none round the outside */
const DaysGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-template-rows: repeat(6, 1fr);
  flex: 1;
  min-height: 0;
`;

const CELL_RULE = 'color-mix(in srgb, var(--border-subtle) 60%, var(--bg-app))';

const DayCell = styled.div<{ $isOutside?: boolean; $isSelected?: boolean; $accentColor?: string }>`
  border-bottom: 1px solid ${CELL_RULE};
  &:not(:nth-child(7n)) { border-right: 1px solid ${CELL_RULE}; }
  padding: 12px 10px 8px;
  cursor: ${({ $isOutside }) => ($isOutside ? 'default' : 'pointer')};
  background: ${({ $isSelected }) => ($isSelected ? 'var(--bg-panel)' : 'transparent')};
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
  transition: background 0.1s;
  &:hover { background: ${({ $isOutside }) => ($isOutside ? 'transparent' : 'var(--bg-panel)')}; }
`;

/* Today: a filled accent disc with dark ink; the chosen day: accent text */
const DayNumber = styled.div<{ $isToday?: boolean; $isSelected?: boolean; $accentColor: string }>`
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: ${({ $isToday }) => ($isToday ? 600 : 400)};
  color: ${({ $isToday, $isSelected }) =>
    $isToday ? 'var(--bg-sunken)' : $isSelected ? 'var(--color-accent-link)' : 'var(--text-secondary)'};
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: ${({ $isToday }) => ($isToday ? 'var(--color-accent)' : 'transparent')};
  flex-shrink: 0;
  margin: -4px 0 12px -2px; /* room under the day number / today's disc */
`;

const DayItems = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
  flex: 1;
  min-height: 0;
`;

/* "• AWS" — a dot (amber for bills, accent for entries) then the text */
const Dot = styled.i<{ $bill?: boolean }>`
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${({ $bill }) => ($bill ? 'var(--chart-amber)' : 'var(--color-accent)')};
`;

const DayItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  min-width: 0;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.3;
  color: var(--text-secondary);
  & > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

const BillItem = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  width: 100%;
  min-width: 0;
  padding: 0;
  text-align: left;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.3;
  color: var(--text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  & > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &:hover { color: var(--text-primary); }
`;

const MoreLabel = styled.div`
  flex-shrink: 0;
  padding-left: 14px;
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-muted);
`;

/* ── Mobile list view ── */

const DesktopOnly = styled.div`
  display: contents;
  @media (max-width: 768px) { display: none; }
`;

/* Phones: a compact month — S M T W T F S, centred numbers, up to three dots
   per day (amber = bill, accent = entry); today a filled accent disc, the
   chosen day on --bg-panel. The day's list shows under it (CalendarView). */
const MobileMonth = styled.div`
  display: none;
  @media (max-width: 768px) {
    display: block;
    flex: none;
    padding: 0 24px 8px;
  }
`;

const MobileWeekdays = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-default);
  span { text-align: center; font-family: var(--font-sans); font-size: 13px; color: var(--text-muted); }
  border-top: 1px solid var(--border-default);
  padding-top: 10px;
`;

const MobileDays = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  row-gap: 4px;
  padding-top: 10px;
`;

const MobileDay = styled.button<{ $selected: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  height: 52px;
  padding: 6px 0 0;
  border: none;
  border-radius: 10px;
  background: ${({ $selected }) => ($selected ? 'var(--bg-panel)' : 'transparent')};
  cursor: pointer;
  &:disabled { cursor: default; }
`;

const MobileNum = styled.span<{ $today: boolean; $selected: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: ${({ $today }) => ($today ? 600 : 400)};
  background: ${({ $today }) => ($today ? 'var(--color-accent)' : 'transparent')};
  color: ${({ $today, $selected }) => ($today ? 'var(--bg-sunken)' : $selected ? 'var(--color-accent-link)' : 'var(--text-secondary)')};
  margin-bottom: 3px; /* a little room above the dots */
`;

const MobileDots = styled.span`
  display: flex;
  gap: 3px;
  height: 6px;
`;

/** Lines that fit in a desktop month cell (items + the "+N more" line). */
const MAX_LINES = 3;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* ── Component ── */

interface CalendarGridProps {
  currentMonth: Date;
  selectedDate: string;
  entriesByDate: Map<string, DecryptedPost[]>;
  accentColor: string;
  eventTopicIds: Set<number>;
  viewMode: CalendarViewMode;
  currentDate: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewMode: (mode: CalendarViewMode) => void;
  onDayClick: (dateStr: string) => void;
  onDayDoubleClick: (dateStr: string) => void;
  getTopicName: (entry: DecryptedPost) => string | undefined;
  /** Bill due dates from Finance (only when it's switched on). */
  billsByDate?: Map<string, CalendarBillItem[]>;
  onBillClick?: (bill: CalendarBillItem) => void;
}

const billLabel = (b: CalendarBillItem) => `${b.name} · ${formatCents(b.amountCents)} due`;

export function CalendarGrid({
  currentMonth, selectedDate, entriesByDate, accentColor, eventTopicIds,
  viewMode, onPrev, onNext, onToday, onViewMode, onDayClick, onDayDoubleClick, getTopicName,
  billsByDate, onBillClick,
}: CalendarGridProps) {
  const today = new Date();
  const days = getCalendarDays(currentMonth.getFullYear(), currentMonth.getMonth());
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long' });
  const year = currentMonth.getFullYear();

  const title = <>{monthName} <span>{year}</span></>;

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

      {/* Desktop: full grid */}
      <DesktopOnly>
        <GridArea>
          <WeekdayRow>
            {WEEKDAYS.map(d => <WeekdayLabel key={d}>{d}</WeekdayLabel>)}
          </WeekdayRow>

          <DaysGrid>
            {days.map(({ date, isOutside }, i) => {
              const dateStr = toDateStr(date);
              const dayEntries = entriesByDate.get(dateStr) || [];
              const dayBills = billsByDate?.get(dateStr) || [];
              // A cell fits 3 lines: show 3 items, or 2 plus "+N more" when there are more
              const lines = dayEntries.length + dayBills.length > MAX_LINES ? MAX_LINES - 1 : MAX_LINES;
              // Events and meetings take the lines first, then bills
              const entrySlots = Math.min(dayEntries.length, lines);
              const billSlots = Math.min(dayBills.length, lines - entrySlots);
              const hidden = dayEntries.length + dayBills.length - entrySlots - billSlots;
              const isToday = isSameDay(date, today);
              const isSelected = selectedDate === dateStr;

              return (
                <DayCell
                  key={i}
                  $isOutside={isOutside}
                  $isSelected={!isOutside && isSelected}
                  $accentColor={accentColor}
                  onClick={() => !isOutside && onDayClick(dateStr)}
                  onDoubleClick={() => !isOutside && onDayDoubleClick(dateStr)}
                >
                  {!isOutside && (
                    <>
                      <DayNumber $isToday={isToday} $isSelected={isSelected} $accentColor={accentColor}>
                        {date.getDate()}
                      </DayNumber>
                      <DayItems>
                        {dayEntries.slice(0, entrySlots).map(entry => {
                          const topicName = getTopicName(entry);
                          const preview = (stripHtml(entry.content).trim() || builtinEntryName((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>)).slice(0, 30) || topicName || 'Entry';
                          return <DayItem key={entry.id}><Dot aria-hidden="true" /><span>{preview}</span></DayItem>;
                        })}
                        {dayBills.slice(0, billSlots).map(b => (
                          <BillItem key={b.key} type="button" title={billLabel(b)} onClick={e => { e.stopPropagation(); onBillClick?.(b); }}>
                            <Dot $bill aria-hidden="true" /><span>{b.name}</span>
                          </BillItem>
                        ))}
                        {hidden > 0 && <MoreLabel>+{hidden} more</MoreLabel>}
                      </DayItems>
                    </>
                  )}
                </DayCell>
              );
            })}
          </DaysGrid>
        </GridArea>
      </DesktopOnly>

      {/* Phones: compact month with dots */}
      <MobileMonth>
        <MobileWeekdays aria-hidden="true">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}</MobileWeekdays>
        <MobileDays>
          {days.map(({ date, isOutside }, i) => {
            if (isOutside) return <span key={i} />;
            const dateStr = toDateStr(date);
            const nBills = billsByDate?.get(dateStr)?.length ?? 0;
            const nEntries = entriesByDate.get(dateStr)?.length ?? 0;
            // Up to three dots: events and meetings first, then bills
            const dots = [...Array(Math.min(nEntries, 3)).fill(false), ...Array(Math.max(0, Math.min(nBills, 3 - Math.min(nEntries, 3)))).fill(true)] as boolean[];
            const isToday = isSameDay(date, today);
            const isSelected = selectedDate === dateStr;
            return (
              <MobileDay key={i} type="button" $selected={isSelected && !isToday} onClick={() => onDayClick(dateStr)}
                aria-label={`${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${nBills + nEntries ? `, ${nBills + nEntries} item${nBills + nEntries === 1 ? '' : 's'}` : ''}`}
                aria-pressed={isSelected}>
                <MobileNum $today={isToday} $selected={isSelected}>{date.getDate()}</MobileNum>
                <MobileDots aria-hidden="true">{dots.map((bill, k) => <Dot key={k} $bill={bill} />)}</MobileDots>
              </MobileDay>
            );
          })}
        </MobileDays>
      </MobileMonth>
    </Wrapper>
  );
}
