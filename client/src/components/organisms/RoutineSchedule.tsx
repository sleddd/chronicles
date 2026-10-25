import { useState } from 'react';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { EmptyState } from '../atoms/EmptyState.js';
import { TickMark } from '../atoms/TickMark.js';
import { DashPanel, DashPanelHead } from '../molecules/DashPanel.js';
import { useRoutineChecklist } from '../../hooks/useRoutineChecklist.js';
import { useOpenInJournal } from '../../hooks/useOpenInJournal.js';
import { toDateStr, formatTime12h, formatDateDisplay } from '../../utils/dateUtils.js';
import { exerciseTypeLabel } from '../../utils/exerciseSummary.js';
import type { RoutineSlot } from '../../utils/routines.js';

/* A day of the exercise schedule — the Medications panel for exercise. On
   the Schedule tab: "Today" (or the day) over its date with ‹ › across; on the
   Health dashboard: a panel heading with ‹ Today ›. Then "2 of 7 done" over a
   4px rule, and the day by time ("7:00 AM", "2 / 3", Do all). Each row: a
   round tick (the whole session) and its name (opens it) over "Yoga · 15 min".
   A session with exercises opens (chevron) to tick them one by one. Ticks log Exercise entries
   (hooks/useRoutineChecklist). */

const DayHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 30px;
`;

const DayTitle = styled.h2`
  margin: 0;
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 300;
  line-height: 1.1;
  color: var(--text-primary);
`;

const DayDate = styled.p`
  margin: 6px 0 0;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

const DateNav = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const NavButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
`;

const DateLabel = styled.span`
  min-width: 72px;
  text-align: center;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
`;

const ProgressStats = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

const ProgressTrack = styled.div`
  height: 4px;
  border-radius: 2px;
  background: var(--progress-track, var(--bg-row-hover));
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $percent: number }>`
  height: 100%;
  width: ${({ $percent }) => $percent}%;
  background: var(--color-accent-fill, var(--color-accent));
  border-radius: 2px;
  transition: width 0.4s ease;
`;

const TimeGroup = styled.div`
  margin-top: 32px;
`;

const TimeHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
`;

const TimeLabel = styled.span`
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
`;

const TimeAside = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 16px;
  font-size: 15px;
  color: var(--text-muted);
`;

const TextBtn = styled.button`
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 600;
  color: var(--color-accent-link);
  cursor: pointer;
  &:hover { text-decoration: underline; }
  &:disabled { opacity: 0.5; cursor: default; text-decoration: none; }
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 56px;
  padding: 8px 0;
  &:first-of-type { margin-top: 8px; }
`;

const TickBtn = styled.button`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 50%; }
  &:disabled { opacity: 0.5; cursor: wait; }
`;

const NameBtn = styled.button<{ $done: boolean }>`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  font-family: var(--font-sans);
  .name { font-size: 17px; color: ${({ $done }) => ($done ? 'var(--text-muted)' : 'var(--text-secondary)')}; }
  .meta { font-size: 14px; color: var(--text-muted); }
  &:hover .name { text-decoration: underline; }
`;

const Partial = styled.span`
  flex: none;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

const Expand = styled.button<{ $open: boolean }>`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')});
  transition: transform 0.15s ease;
  &:hover { color: var(--text-primary); }
`;

const Items = styled.ul`
  margin: 0 0 10px 44px;
  padding: 0;
  list-style: none;
  li {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 44px;
    font-family: var(--font-sans);
  }
  .item { flex: 1; min-width: 0; font-size: 16px; color: var(--text-secondary); }
  .item[data-done='true'] { color: var(--text-muted); text-decoration: line-through; }
  .amount { flex: none; font-size: 15px; color: var(--text-muted); }
`;

const ErrorNote = styled.p`
  margin: 16px 0 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--color-danger);
`;

/** "Today", "Tomorrow", "Yesterday", else the weekday */
function dayName(date: string, today: string): string {
  const diff = Math.round((new Date(date + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
}

interface RoutineScheduleProps {
  /** A panel heading (Health dashboard) — without one, the day is the heading */
  heading?: string;
}

export function RoutineSchedule({ heading }: RoutineScheduleProps) {
  const today = toDateStr(new Date());
  const [viewDate, setViewDate] = useState(today);
  const { slots, groups, done, total, isDone, doneItems, setDone, toggleItem, doAll, busy, error } = useRoutineChecklist(viewDate);
  const openInJournal = useOpenInJournal();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const isToday = viewDate === today;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  const navigateDate = (days: number) => {
    const d = new Date(viewDate + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setViewDate(toDateStr(d));
  };
  const toggleOpen = (key: string) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const arrows = (label?: string) => (
    <DateNav>
      <NavButton onClick={() => navigateDate(-1)} title="Previous day" aria-label="Previous day">
        <Icon name="chevron-left" size={16} strokeWidth={2} />
      </NavButton>
      {label && <DateLabel>{label}</DateLabel>}
      <NavButton onClick={() => navigateDate(1)} title="Next day" aria-label="Next day">
        <Icon name="chevron-right" size={16} strokeWidth={2} />
      </NavButton>
    </DateNav>
  );

  const renderSlot = (s: RoutineSlot) => {
    const r = s.routine;
    const ticked = isDone(s);
    const items = doneItems(s);
    const expanded = open.has(s.key);
    const meta = [exerciseTypeLabel(r.exerciseType), r.minutes ? `${r.minutes} min` : ''].filter(Boolean).join(' · ');
    return (
      <div key={s.key}>
        <Row>
          <TickBtn type="button" disabled={busy === s.key} aria-pressed={ticked}
            aria-label={ticked ? `Mark ${r.name} not done` : `Mark ${r.name} done`}
            onClick={() => void setDone(s, !ticked)}>
            <TickMark checked={ticked} size={24} />
          </TickBtn>
          <NameBtn type="button" $done={ticked} onClick={() => openInJournal(r.id)} title={`Open ${r.name}`}>
            <span className="name">{r.name}</span>
            <span className="meta">
              {meta}
            </span>
          </NameBtn>
          {items.length > 0 && !ticked && <Partial>{items.length} of {r.items.length}</Partial>}
          {r.items.length > 0 && (
            <Expand type="button" $open={expanded} aria-expanded={expanded}
              aria-label={expanded ? `Hide ${r.name} exercises` : `Show ${r.name} exercises`}
              onClick={() => toggleOpen(s.key)}>
              <Icon name="chevron-down" size={16} strokeWidth={2} />
            </Expand>
          )}
        </Row>
        {expanded && (
          <Items aria-label={`${r.name} exercises`}>
            {r.items.map(item => {
              const on = items.includes(item.id);
              return (
                <li key={item.id}>
                  <TickBtn type="button" aria-pressed={on}
                    aria-label={on ? `Mark ${item.name} not done` : `Mark ${item.name} done`}
                    onClick={() => void toggleItem(s, item.id)}>
                    <TickMark checked={on} size={20} />
                  </TickBtn>
                  <span className="item" data-done={on}>{item.name}</span>
                  {item.amount && <span className="amount">{item.amount}</span>}
                </li>
              );
            })}
          </Items>
        )}
      </div>
    );
  };

  return (
    <DashPanel aria-label={heading ?? `Exercise schedule, ${dayName(viewDate, today)}`}>
      {heading ? (
        <DashPanelHead title={heading} aside={arrows(isToday ? 'Today' : formatDateDisplay(viewDate))} />
      ) : (
        <DayHead>
          <div>
            <DayTitle>{dayName(viewDate, today)}</DayTitle>
            <DayDate>{new Date(viewDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</DayDate>
          </div>
          {arrows()}
        </DayHead>
      )}

      {total > 0 && (
        <div>
          <ProgressStats>
            <span>{done} of {total} done</span>
            <span>{percent}%</span>
          </ProgressStats>
          <ProgressTrack><ProgressFill $percent={percent} /></ProgressTrack>
        </div>
      )}

      {error && <ErrorNote role="alert">{error}</ErrorNote>}

      {slots.length === 0 ? (
        <EmptyState message={isToday ? 'Nothing scheduled today' : 'Nothing scheduled this day'}
          submessage="Add exercise with days and times to build your schedule." />
      ) : (
        groups.map(g => {
          const groupDone = g.slots.filter(isDone).length;
          return (
            <TimeGroup key={g.time}>
              <TimeHeader>
                <TimeLabel>{formatTime12h(g.time)}</TimeLabel>
                <TimeAside>
                  <span>{groupDone} / {g.slots.length}</span>
                  <TextBtn type="button" disabled={groupDone === g.slots.length || busy !== null}
                    onClick={() => void doAll(g.slots)}>Do all</TextBtn>
                </TimeAside>
              </TimeHeader>
              {g.slots.map(renderSlot)}
            </TimeGroup>
          );
        })
      )}
    </DashPanel>
  );
}
