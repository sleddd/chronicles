import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { cardLabel } from '../../styles/cardLabel.js';
import { Checkbox } from '../atoms/core/Checkbox.jsx';
import { DashPanel } from '../molecules/DashPanel.js';
import { useHabits } from '../../hooks/useHabits.js';
import { useOpenInJournal } from '../../hooks/useOpenInJournal.js';
import { toDateStr } from '../../utils/dateUtils.js';
import { weekOf } from '../../utils/planner.js';
import { dayTarget, isDueOn, nextCount, weekProgress } from '../../utils/habits.js';

/* A day's habits as a flat list in the dashboards' look (TodayLists): the
   standard checkmark, the name, and how the week stands on the right
   ("2 of 3 this week", "Target met"): the habits due that day (exercise
   routines are not habits; they have their own Exercise schedule list). On the home
   dashboard it is a card of its own (`panel` gives it one on the Health dashboard); in the planner's day (`plain`) it sits
   under the day's tasks with a small heading. */

const SectionHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 12px;
  padding-bottom: 12px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border-subtle);
  h2 { margin: 0; line-height: 30px; ${cardLabel} }
  button { padding: 0; border: none; background: none; font-family: var(--font-sans); font-size: 14px; font-weight: 500; color: var(--color-accent-link); cursor: pointer; }
  button:hover { text-decoration: underline; }
`;

const PlainHead = styled.h4`
  margin: 12px 4px 2px;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
`;

const Row = styled.div<{ $plain?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ $plain }) => ($plain ? '10px' : '14px')};
  min-height: ${({ $plain }) => ($plain ? '44px' : '52px')};
  ${({ $plain }) => ($plain ? 'padding: 0 4px;' : '')}
  & + & { border-top: 1px solid var(--border-faint); }
  font-family: var(--font-sans);
  font-size: ${({ $plain }) => ($plain ? '15px' : '16px')};
  color: var(--text-secondary);
`;

const Name = styled.button<{ $done: boolean }>`
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font: inherit;
  color: ${({ $done }) => ($done ? 'var(--text-muted)' : 'var(--text-secondary)')};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const When = styled.span<{ $met: boolean }>`
  flex: none;
  font-size: 14px;
  color: ${({ $met }) => ($met ? 'var(--color-accent-soft)' : 'var(--text-muted)')};
`;

const Muted = styled.p`
  margin: 14px 0 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

interface HabitsTodayProps {
  /** YYYY-MM-DD; today when left out */
  day?: string;
  /** No card title: a small heading, and nothing at all when no habit is due */
  plain?: boolean;
  /** In a --bg-panel card of its own (the Health dashboard), like the panels around it */
  panel?: boolean;
}

export function HabitsToday({ day, plain = false, panel = false }: HabitsTodayProps) {
  const Frame = panel ? DashPanel : 'section';
  const navigate = useNavigate();
  const openInJournal = useOpenInJournal();
  const { habits, count, setCount, loaded } = useHabits();
  const today = toDateStr(new Date());
  const on = day ?? today;
  const week = weekOf(on);
  // Your own habits due that day (a weekly one is due until its week is met, and stays listed once ticked)
  const due = habits.filter(h => isDueOn(h, on));

  const rows = due.map(h => {
    const n = count(h, on);
    const full = dayTarget(h);
    const wp = weekProgress(h, week, count);
    const done = n >= full;
    return (
      <Row key={h.id} $plain={plain}>
        <Checkbox checked={done} disabled={!loaded || on > today}
          aria-label={done ? `Mark "${h.name}" not done` : `Mark "${h.name}" done`}
          onChange={() => setCount(h, on, nextCount(h, n))} />
        <Name type="button" $done={done} onClick={() => openInJournal(h.id)}>
          {h.name}{full > 1 ? ` · ${n} of ${full}` : ''}
        </Name>
        <When $met={wp.met}>{wp.met ? 'Target met' : `${wp.done} of ${wp.target} this week`}</When>
      </Row>
    );
  });

  if (plain) return due.length === 0 ? null : <div aria-label="Habits"><PlainHead>Habits</PlainHead>{rows}</div>;
  return (
    <Frame aria-label="Habits">
      <SectionHead>
        <h2>Habits</h2>
        <button type="button" onClick={() => navigate('/health/habits')}>Habits</button>
      </SectionHead>
      {due.length === 0 ? <Muted>{habits.length > 0 ? 'No habits due today.' : 'No habits yet. Add one in Health.'}</Muted> : rows}
    </Frame>
  );
}
