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
`;

const GridArea = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 0 0;
  overflow: hidden;
`;

const WeekdayRow = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-top: 1px solid var(--border-subtle);
`;

const WeekdayLabel = styled.div`
  text-align: center;
  font-family: var(--font-label, var(--font-sans));
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  padding: 6px 0;
`;

const DaysGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-template-rows: repeat(6, 1fr);
  flex: 1;
  min-height: 0;
  border-top: 1px solid var(--border-subtle);
  border-left: 1px solid var(--border-subtle);
`;

const DayCell = styled.div<{ $isOutside?: boolean; $isSelected?: boolean; $accentColor?: string }>`
  border-right: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
  padding: 6px 8px;
  cursor: ${({ $isOutside }) => $isOutside ? 'default' : 'pointer'};
  background: ${({ $isSelected, $accentColor }) => $isSelected ? `${$accentColor}14` : 'transparent'};
  opacity: ${({ $isOutside }) => $isOutside ? 0.35 : 1};
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
  transition: background 0.1s;
  &:hover { background: ${({ $isOutside, $isSelected, $accentColor }) =>
    $isOutside ? 'transparent' : $isSelected ? `${$accentColor}1a` : 'var(--bg-hover)'}; }
`;

const DayNumber = styled.div<{ $isToday?: boolean; $isSelected?: boolean; $accentColor: string }>`
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: ${({ $isToday }) => $isToday ? 700 : 400};
  color: ${({ $isToday, $isSelected, $accentColor }) =>
    $isToday ? $accentColor : $isSelected ? $accentColor : 'var(--text-secondary)'};
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  /* Today: a thin accent circle around the number */
  border: 1px solid ${({ $isToday, $accentColor }) => ($isToday ? $accentColor : 'transparent')};
  background: transparent;
  flex-shrink: 0;
  margin-bottom: 3px;
`;

const DayItems = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
  flex: 1;
  min-height: 0;
`;

const DayItem = styled.div`
  flex-shrink: 0; /* never squash lines into each other — overflow goes to "+N more" */
  font-size: 11px;
  line-height: 1.3;
  color: var(--text-secondary);
  padding: 2px 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: 2px;
  font-weight: 400;
`;

/* A bill due that day (Finance): a quiet sunken chip, opens Budget & Bills */
const BillItem = styled.button`
  display: block;
  flex-shrink: 0;
  width: 100%;
  text-align: left;
  font-family: inherit;
  font-size: 11px;
  line-height: 1.3;
  color: var(--text-secondary);
  background: var(--bg-sunken);
  border: none;
  padding: 2px 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: 2px;
  cursor: pointer;
  &:hover { color: var(--text-primary); }
`;

const MoreLabel = styled.div`
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-tertiary);
  padding: 1px 4px;
`;

/* ── Mobile list view ── */

const DesktopOnly = styled.div`
  display: contents;
  @media (max-width: 768px) { display: none; }
`;

const MobileList = styled.div`
  display: none;
  @media (max-width: 768px) {
    display: block;
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 0 12px;
  }
`;

const MobileDayRow = styled.div<{ $isToday: boolean; $accentColor: string }>`
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 16px;
  align-items: flex-start;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: background 100ms;
  &:hover { background: var(--bg-hover); }
`;

const MobileDateCol = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1;
  flex-shrink: 0;
`;

const MobileDayNum = styled.span<{ $isToday: boolean; $accentColor: string }>`
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 200;
  line-height: 1;
  color: ${({ $isToday, $accentColor }) => $isToday ? $accentColor : 'var(--text-primary)'};
  letter-spacing: -0.01em;
  /* Today: a thin accent circle around the number */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6em;
  height: 1.6em;
  border-radius: 50%;
  border: 1px solid ${({ $isToday, $accentColor }) => ($isToday ? $accentColor : 'transparent')};
`;

const MobileDayName = styled.span`
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin-top: 5px;
`;

const MobileEntries = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 4px;
  min-width: 0;
`;

const MobileEntryChip = styled.div`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const MobileEmptyDay = styled.div`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-tertiary);
`;

/** Lines that fit in a desktop month cell (items + the "+N more" line). */
const MAX_LINES = 3;

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

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
              const billSlots = Math.min(dayBills.length, lines);
              const entrySlots = lines - billSlots;
              const hidden = dayEntries.length + dayBills.length - billSlots - Math.min(entrySlots, dayEntries.length);
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
                        {dayBills.slice(0, billSlots).map(b => (
                          <BillItem key={b.key} type="button" title={billLabel(b)} onClick={e => { e.stopPropagation(); onBillClick?.(b); }}>
                            {billLabel(b)}
                          </BillItem>
                        ))}
                        {dayEntries.slice(0, entrySlots).map(entry => {
                          const topicName = getTopicName(entry);
                          const preview = (stripHtml(entry.content).trim() || builtinEntryName((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>)).slice(0, 30) || topicName || 'Entry';
                          return <DayItem key={entry.id}>{preview}</DayItem>;
                        })}
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

      {/* Mobile: scrollable day list */}
      <MobileList>
        {days.filter(d => !d.isOutside).map(({ date }) => {
          const dateStr = toDateStr(date);
          const dayEntries = entriesByDate.get(dateStr) || [];
          const dayBills = billsByDate?.get(dateStr) || [];
          const isToday = isSameDay(date, today);
          const weekday = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();

          return (
            <MobileDayRow
              key={dateStr}
              $isToday={isToday}
              $accentColor={accentColor}
              onClick={() => onDayClick(dateStr)}
            >
              <MobileDateCol>
                <MobileDayNum $isToday={isToday} $accentColor={accentColor}>{date.getDate()}</MobileDayNum>
                <MobileDayName>{weekday}</MobileDayName>
              </MobileDateCol>
              <MobileEntries>
                {dayBills.map(b => (
                  <BillItem key={b.key} type="button" onClick={e => { e.stopPropagation(); onBillClick?.(b); }}>{billLabel(b)}</BillItem>
                ))}
                {dayEntries.length === 0 ? (
                  dayBills.length === 0 && <MobileEmptyDay>No entries</MobileEmptyDay>
                ) : (
                  dayEntries.map(entry => {
                    const topicName = getTopicName(entry);
                    const preview = (stripHtml(entry.content).trim() || builtinEntryName((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>)).slice(0, 50) || topicName || 'Entry';
                    return <MobileEntryChip key={entry.id}>{preview}</MobileEntryChip>;
                  })
                )}
              </MobileEntries>
            </MobileDayRow>
          );
        })}
      </MobileList>
    </Wrapper>
  );
}
