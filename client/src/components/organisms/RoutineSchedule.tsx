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

/* The day's exercise routines — the Medications panel for exercise: ‹ Today ›
   across from the title, "N of M done" over a 4px rule, then routines grouped
   by time ("7:00 AM", "1 / 2", Do all). Each row: a round tick (the whole
   routine), its name (opens it), "Yoga · 20 min" muted, and — for a routine
   with exercises — "2 of 5" and a chevron that opens its exercises to tick one
   by one. Ticks log Exercise entries (hooks/useRoutineChecklist). */

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
  font-size: 13px;
  color: var(--text-muted);
`;

const ProgressTrack = styled.div`
  height: 4px;
  border-radius: 2px;
  background: var(--progress-track, var(--border-card));
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
  margin-top: 26px;
`;

const TimeHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
`;

const TimeLabel = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: var(--text-tertiary);
`;

const TimeAside = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 14px;
  font-size: 13px;
  color: var(--text-muted);
`;

const TextBtn = styled.button`
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-accent-link);
  cursor: pointer;
  &:hover { text-decoration: underline; }
  &:disabled { opacity: 0.5; cursor: default; text-decoration: none; }
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  &:first-of-type { margin-top: 6px; }
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
  gap: 2px;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  font-family: var(--font-sans);
  .name { font-size: 14px; color: ${({ $done }) => ($done ? 'var(--text-muted)' : 'var(--text-secondary)')}; }
  .meta { font-size: 12px; color: var(--text-muted); }
  &:hover .name { text-decoration: underline; }
`;

const Partial = styled.span`
  flex: none;
  font-family: var(--font-sans);
  font-size: 12px;
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
  margin: 0 0 8px 34px;
  padding: 0;
  list-style: none;
  li {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 36px;
    font-family: var(--font-sans);
    font-size: 14px;
  }
  .item { flex: 1; min-width: 0; color: var(--text-secondary); }
  .item[data-done='true'] { color: var(--text-muted); text-decoration: line-through; }
  .amount { flex: none; font-size: 12px; color: var(--text-muted); }
`;

const ErrorNote = styled.p`
  margin: 16px 0 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--color-danger);
`;

interface RoutineScheduleProps {
  title?: string;
}

export function RoutineSchedule({ title = 'Routines' }: RoutineScheduleProps) {
  const [viewDate, setViewDate] = useState(() => toDateStr(new Date()));
  const { slots, groups, done, total, isDone, doneItems, setDone, toggleItem, doAll, busy, error } = useRoutineChecklist(viewDate);
  const openInJournal = useOpenInJournal();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const isToday = viewDate === toDateStr(new Date());
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
            <TickMark checked={ticked} />
          </TickBtn>
          <NameBtn type="button" $done={ticked} onClick={() => openInJournal(r.id)} title="Open routine">
            <span className="name">{r.name}</span>
            {meta && <span className="meta">{meta}</span>}
          </NameBtn>
          {r.items.length > 0 && (
            <>
              {items.length > 0 && !ticked && <Partial>{items.length} of {r.items.length}</Partial>}
              <Expand type="button" $open={expanded} aria-expanded={expanded}
                aria-label={expanded ? `Hide ${r.name} exercises` : `Show ${r.name} exercises`}
                onClick={() => toggleOpen(s.key)}>
                <Icon name="chevron-down" size={16} strokeWidth={2} />
              </Expand>
            </>
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
                    <TickMark checked={on} size={18} />
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
    <DashPanel aria-label={title}>
      <DashPanelHead
        title={title}
        aside={(
          <DateNav>
            <NavButton onClick={() => navigateDate(-1)} title="Previous day" aria-label="Previous day">
              <Icon name="chevron-left" size={16} strokeWidth={2} />
            </NavButton>
            <DateLabel>{isToday ? 'Today' : formatDateDisplay(viewDate)}</DateLabel>
            <NavButton onClick={() => navigateDate(1)} title="Next day" aria-label="Next day">
              <Icon name="chevron-right" size={16} strokeWidth={2} />
            </NavButton>
          </DateNav>
        )}
      />

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
        <EmptyState message={isToday ? 'No routines today' : 'No routines this day'}
          submessage="Add a routine with days and times, and mark it Currently doing." />
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
