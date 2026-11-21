import styled from 'styled-components';

/* Planning → Planner → Month: the month at a glance. A ruled grid of days
   (Sunday first), each with its planned tasks (done ones struck through), then
   its events and meetings. A glance, not a board: nothing is dragged here.
   A day's number opens that day in Day view, an item opens it in the journal.
   Phones show a dot on a day with anything on it. Props only. */

export interface PlannerMonthItem {
  key: string;
  id: number;
  title: string;
  kind: 'event' | 'task';
  /** "9:00 AM", for an event or a task with a time */
  time?: string;
  done?: boolean;
}

export interface PlannerMonthDay {
  day: string;
  number: number;
  /** In the month on show (the grid starts and ends with days of the months beside it) */
  inMonth: boolean;
  today: boolean;
  /** "Thursday, November 19", for screen readers */
  label: string;
  items: PlannerMonthItem[];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/* Rows in a cell before "+N more" */
const SHOWN = 4;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  font-family: var(--font-sans);
`;

const Weekday = styled.div`
  padding: 0 10px 10px;
  border-bottom: 1px solid var(--border-default);
  font-size: 13px;
  color: var(--text-muted);
  @media (max-width: 768px) { padding: 0 0 8px; text-align: center; }
`;

const Cell = styled.div<{ $out: boolean }>`
  min-width: 0;
  min-height: 132px;
  padding: 8px 10px 10px;
  border-bottom: 1px solid var(--border-subtle);
  border-left: 1px solid var(--border-subtle);
  &:nth-child(7n + 1) { border-left: none; }
  opacity: ${p => (p.$out ? 0.5 : 1)};
  @media (max-width: 768px) {
    min-height: 56px;
    padding: 6px 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
`;

const DayBtn = styled.button<{ $today: boolean }>`
  display: inline-grid;
  place-items: center;
  min-width: 28px;
  height: 28px;
  margin: 0 0 6px -4px;
  padding: 0 6px;
  border: none;
  border-radius: 999px;
  background: ${p => (p.$today ? 'var(--color-accent)' : 'none')};
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 300;
  color: ${p => (p.$today ? 'var(--on-accent)' : 'var(--text-secondary)')};
  cursor: pointer;
  &:hover { color: ${p => (p.$today ? 'var(--on-accent)' : 'var(--color-accent-text)')}; }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
  @media (max-width: 768px) { margin: 0; }
`;

const Items = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  @media (max-width: 768px) { display: none; }
`;

const ItemBtn = styled.button<{ $event: boolean; $done: boolean }>`
  display: block;
  width: 100%;
  padding: 2px 0 2px ${p => (p.$event ? '7px' : '0')};
  border: none;
  border-left: ${p => (p.$event ? '2px solid var(--color-accent-line)' : 'none')};
  background: none;
  text-align: left;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.35;
  color: ${p => (p.$done ? 'var(--text-muted)' : 'var(--text-secondary)')};
  text-decoration: ${p => (p.$done ? 'line-through' : 'none')};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  small { margin-right: 5px; font-size: 12px; color: var(--text-muted); }
  &:hover { color: var(--color-accent-text); }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
`;

const More = styled.button`
  padding: 2px 0;
  border: none;
  background: none;
  text-align: left;
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--color-accent-text); }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
`;

/* Phones: one dot for a day with anything on it, like the Calendar's month */
const Dot = styled.span`
  display: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  opacity: 0.5;
  @media (max-width: 768px) { display: block; }
`;

export function PlannerMonth({ days, onPickDay, onOpen }: {
  days: PlannerMonthDay[];
  onPickDay: (day: string) => void;
  onOpen: (id: number) => void;
}) {
  return (
    <Grid role="grid" aria-label="Month">
      {WEEKDAYS.map(w => <Weekday key={w} role="columnheader">{w}</Weekday>)}
      {days.map(d => {
        const shown = d.items.length > SHOWN ? d.items.slice(0, SHOWN - 1) : d.items;
        const more = d.items.length - shown.length;
        const count = d.items.length ? `, ${d.items.length} ${d.items.length === 1 ? 'item' : 'items'}` : '';
        return (
          <Cell key={d.day} role="gridcell" $out={!d.inMonth}>
            <DayBtn type="button" $today={d.today} aria-label={`${d.label}${d.today ? ', today' : ''}${count}. Open day`}
              aria-current={d.today ? 'date' : undefined} onClick={() => onPickDay(d.day)}>
              {d.number}
            </DayBtn>
            {d.items.length > 0 && <Dot aria-hidden="true" />}
            <Items>
              {shown.map(i => (
                <ItemBtn key={i.key} type="button" $event={i.kind === 'event'} $done={!!i.done} title={i.title}
                  aria-label={`${i.kind === 'event' ? 'Event' : i.done ? 'Done task' : 'Task'}: ${i.title}${i.time ? `, ${i.time}` : ''}`}
                  onClick={() => onOpen(i.id)}>
                  {i.time && <small>{i.time}</small>}{i.title}
                </ItemBtn>
              ))}
              {more > 0 && <More type="button" onClick={() => onPickDay(d.day)}>+{more} more</More>}
            </Items>
          </Cell>
        );
      })}
    </Grid>
  );
}
