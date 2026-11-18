import { useId } from 'react';
import styled from 'styled-components';
import { Icon } from '../../atoms/core/Icon.jsx';
import { Toggle } from '../../atoms/Toggle.js';
import type { HabitFieldValues } from '../../../types/fields.js';
import type { GoalOption } from '../../../types/ui.js';
import {
  FormWrap, Section, SectionHead, SectionLabel, TitleInput, RowBox, LabelledRow, RowLabel, BareSelect, BoxText, JoinedGroup, JoinedBtn,
} from './formKit.js';
import { Days, DayChip } from './RoutineFields.js';
import { CategoryPill } from './GoalFields.js';
import { PillPick } from './TaskCardFields.js';
import { describeDays } from '../../../utils/routines.js';
import { describeTarget, habitFrom, weekTarget } from '../../../utils/habits.js';
export type { HabitFieldValues } from '../../../types/fields.js';

/* Habit fields — the same form in the journal editor and Quick Entry: the
   habit as a big borderless title, then one outlined box of rows — Target
   (how many times, a day or a week), Category (the goal categories) and Part
   of (a goal) — then the Days it's due (none = any day), Notes and an "On my
   habits" card with a switch. Check-ins aren't here: they're ticked on
   Health → Habits and the dashboard. Props only. */

const DAY_CHIPS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* Target: its count and period with Active at the top right, the days under them */
const TargetBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  .top { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; }
  .active {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 12px;
    font-family: var(--font-sans);
    font-size: 15px;
    color: var(--text-soft);
    white-space: nowrap;
  }
`;

/* Category and Part of side by side */
const PillRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  min-width: 0;
`;

const TargetRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-soft);
`;

/* − 3 + : the count between two quiet round buttons */
const Stepper = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  padding: 0 4px;
  border: 1px solid var(--border-card);
  border-radius: 999px;
  b { min-width: 28px; text-align: center; font-weight: 500; font-variant-numeric: tabular-nums; color: var(--text-primary); }
  button {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  button:hover:not(:disabled) { color: var(--text-primary); }
  button:disabled { color: var(--text-disabled); cursor: default; }
  button:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
`;

const Count = styled.span`
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

interface HabitFieldsProps {
  values: HabitFieldValues;
  onChange: (values: HabitFieldValues) => void;
  goalOptions?: GoalOption[];
  /** The goal categories to offer (built-in + the owner's own) */
  categories?: string[];
  onAddCategory?: (label: string) => void;
  onRemoveCategory?: (label: string) => void;
}

export function HabitFields({ values, onChange, goalOptions = [], categories = [], onAddCategory, onRemoveCategory }: HabitFieldsProps) {
  const set = (patch: Partial<HabitFieldValues>) => onChange({ ...values, ...patch });
  const habit = habitFrom(0, values as unknown as Record<string, unknown>, '');
  const days = habit.days;
  const toggleDay = (d: number) => set({ days: (days.includes(d) ? days.filter(x => x !== d) : [...days, d]).sort() });
  const goalId = useId();
  const notesId = useId();
  const perWeek = weekTarget(habit);

  return (
    <FormWrap>
      <Section>
        <TitleInput
          value={values.habitName ?? ''}
          onChange={e => set({ habitName: e.target.value })}
          placeholder="What do you want to keep doing?"
          aria-label="Habit"
        />
      </Section>

      <RowBox style={{ marginTop: 30 }}>
        {/* Target: how many times a day or week, Active at the top right, and the days it's due under them (none = any day) */}
        <LabelledRow style={{ paddingTop: 26, paddingBottom: 26 }}>
          <RowLabel>Target</RowLabel>
          <TargetBlock>
            <div className="top">
              <TargetRow>
                <Stepper role="group" aria-label="How many times">
                  <button type="button" aria-label="Fewer" disabled={habit.target <= 1} onClick={() => set({ targetCount: habit.target - 1 })}>
                    <Icon name="minus" size={14} strokeWidth={2} />
                  </button>
                  <b aria-live="polite">{habit.target}</b>
                  <button type="button" aria-label="More" disabled={habit.target >= 35} onClick={() => set({ targetCount: habit.target + 1 })}>
                    <Icon name="plus" size={14} strokeWidth={2} />
                  </button>
                </Stepper>
                {habit.target === 1 ? 'time a' : 'times a'}
                <JoinedGroup role="radiogroup" aria-label="Each">
                  {(['day', 'week'] as const).map(p => (
                    <JoinedBtn key={p} type="button" role="radio" aria-checked={habit.period === p} $active={habit.period === p} $fill
                      onClick={() => set({ targetPeriod: p })}>
                      {p === 'day' ? 'Day' : 'Week'}
                    </JoinedBtn>
                  ))}
                </JoinedGroup>
              </TargetRow>
              <span className="active" title={values.isActive === false
                ? 'Paused. It keeps its history and stays off your lists.'
                : `${describeTarget(habit, describeDays)}, so ${perWeek} ${perWeek === 1 ? 'time' : 'times'} makes a full week. Tick it off on Health → Habits or the dashboard.`}>
                Active
                <Toggle checked={values.isActive !== false} aria-label="Active" onChange={v => set({ isActive: v })} />
              </span>
            </div>
            <Days aria-label="Days">
              {DAY_CHIPS.map((label, d) => (
                <DayChip key={label} type="button" $active={days.includes(d)} aria-pressed={days.includes(d)}
                  aria-label={DAY_NAMES[d]} onClick={() => toggleDay(d)}>
                  {label}
                </DayChip>
              ))}
            </Days>
          </TargetBlock>
        </LabelledRow>
        {/* Category and the goal it's part of, as two pill dropdowns on one row */}
        <LabelledRow style={{ paddingTop: 26, paddingBottom: 26 }}>
          <RowLabel>Category</RowLabel>
          <PillRow>
            <CategoryPill name="Category:" value={values.habitCategory ?? ''} categories={categories}
              onPick={habitCategory => set({ habitCategory })} onAdd={onAddCategory} />
            <div>
              <PillPick>
                <span className="name">Part of:</span>
                <span className="value">{goalOptions.find(g => g.id === values.parentGoalId)?.title ?? 'No goal'}</span>
                <Icon name="chevron-down" size={14} strokeWidth={2} />
                <select id={goalId} aria-label="Part of" value={values.parentGoalId?.toString() || ''}
                  onChange={e => set({ parentGoalId: e.target.value ? parseInt(e.target.value, 10) : null })}>
                  <option value="">No goal</option>
                  {goalOptions.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select>
              </PillPick>
            </div>
          </PillRow>
        </LabelledRow>
      </RowBox>


      <Section style={{ marginTop: 30 }}>
        <SectionHead><SectionLabel as="label" htmlFor={notesId}>Notes</SectionLabel></SectionHead>
        <BoxText id={notesId} value={values.notes ?? ''} placeholder="Why it matters, how you do it"
          onChange={e => set({ notes: e.target.value })} />
      </Section>

    </FormWrap>
  );
}
