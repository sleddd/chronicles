import { useId, useState, type ReactNode } from 'react';
import { TimerPopButton, PillPick } from './TaskCardFields.js';
import styled from 'styled-components';
import { NAV_COMPACT } from '../../../styles/breakpoints.js';
import { Icon } from '../../atoms/core/Icon.jsx';
import { Toggle } from '../../atoms/Toggle.js';
import { ReminderTimes } from './ReminderTimes.js';
import type { RoutineFieldValues, RoutineItem } from '../../../types/fields.js';
import { EXERCISE_TYPES, exerciseTypeLabel } from '../../../utils/exerciseSummary.js';
import { amountMinutes, describeDays } from '../../../utils/routines.js';
import { formatTime12h } from '../../../utils/dateUtils.js';
import {
  FormWrap, Section, SectionHead, SectionLabel, TitleInput, Chips, Chip, BoxInput, BoxText,
} from './formKit.js';

/* Exercise schedule fields (journal editor — the Exercise Schedule topic):
   the name as a big borderless title; Activity chips; Duration (an outlined
   "30 min" box) beside Times (grey time pills, "+ Time"); Days as square
   weekday chips with "Every day" across; Counts toward training — the
   training plans' categories as chips, plus None; Exercises and Notes behind
   "+ Add …" links until used; and an "On my schedule" card saying what it
   does ("Shows on Today at 7:00 AM … Ticking it logs a 30 min Walking entry
   that counts toward Aerobic."). Props only. */

const ACTIVITY_LABEL: Record<string, string> = { strength: 'Strength' };
const DAY_CHIPS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const Count = styled.span`
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

/* Duration | Times side by side; stacked on phones */
const Pair = styled.div.attrs({ className: 'card-contents' })`
  display: grid;
  grid-template-columns: 186px minmax(0, 1fr);
  column-gap: 28px;
  margin-top: 30px;
  /* beats formKit's Section + Section spacing: the pair sits on one line */
  && > section + section { margin-top: 0; }
  @media (max-width: 560px) {
    grid-template-columns: minmax(0, 1fr);
    && > section + section { margin-top: 30px; }
  }
`;

const DurationBox = styled.label`
  display: flex;
  align-items: baseline;
  gap: 8px;
  height: 48px;
  padding: 0 14px;
  border: 1px solid var(--border-card);
  border-radius: var(--r-lg, 6px);
  cursor: text;
  &:focus-within { border-color: var(--color-accent); }
  /* "min" (only that: the stopwatch's icon is a span too, and must keep the icon font) */
  & > .unit { flex: none; font-family: var(--font-sans); font-size: 15px; color: var(--text-muted); }
`;

const DurationInput = styled.input`
  && {
    flex: 1 1 0;
    width: 0;
    min-width: 0;
    height: 46px;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-display);
    font-size: 24px;
    font-weight: 300;
    line-height: 46px;
    color: var(--text-primary);
  }
  &::placeholder { color: var(--text-hint); }
`;

/* Days & times: the time pills, the day chips, and On my schedule at the right */
export const DaysLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 18px;
  min-width: 0;
  .sched {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 12px;
    font-family: var(--font-sans);
    font-size: 15px;
    color: var(--text-soft);
    white-space: nowrap;
  }
  /* Phones and tablets: on its own line, at the left like the times and days above it */
  ${NAV_COMPACT} { .sched { margin-left: 0; margin-top: 10px; flex-basis: 100%; } }
`;

export const Days = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;

export const DayChip = styled.button<{ $active: boolean }>`
  width: 46px;
  height: 44px;
  padding: 0;
  border-radius: var(--r-lg, 6px);
  /* The chosen day: an accent outline and soft-accent text, like the chosen chips */
  border: 1px solid ${({ $active }) => ($active ? 'var(--color-accent-line)' : 'color-mix(in srgb, var(--border-card) 75%, transparent)')};
  background: transparent;
  font-family: var(--font-sans);
  font-size: 15px;
  color: ${({ $active }) => ($active ? 'var(--color-accent-soft)' : 'var(--text-secondary)')};
  cursor: pointer;
  &:hover { border-color: ${({ $active }) => ($active ? 'var(--color-accent-line)' : 'var(--control-border)')}; }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
`;

const ItemList = styled.div`
  border: 1px solid var(--border-card);
  border-radius: 10px;
  margin-bottom: 12px;
`;

const Item = styled.div`
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 140px 28px;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 0 8px 0 14px;
  & + & { border-top: 1px solid var(--border-card); }
  @media (max-width: 560px) { grid-template-columns: 24px minmax(0, 1fr) 96px 28px; }
`;

const ItemNo = styled.span`
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

const InPlace = styled.input`
  && {
    min-width: 0;
    width: 100%;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 16px;
    color: var(--text-secondary);
  }
  &::placeholder { color: var(--text-hint); }
`;

const AmountInput = styled(InPlace)`
  && { color: var(--text-muted); text-align: right; }
`;

const Remove = styled.button`
  display: inline-flex;
  justify-content: center;
  padding: 4px;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--color-danger); }
`;

const AddLink = styled.button`
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--color-accent-link);
  cursor: pointer;
  &:hover { text-decoration: underline; }
`;

export const StatusCard = styled.div.attrs({ className: 'card-row' })`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 34px;
  padding: 18px 20px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  .title { font-family: var(--font-sans); font-size: 16px; color: var(--text-secondary); }
  .note { margin-top: 6px; font-family: var(--font-sans); font-size: 14px; line-height: 1.45; color: var(--text-muted); }
`;

/** "Pigeon pose 2 min" → name "Pigeon pose", amount "2 min"; "Squats 3x10" too */
export function splitExercise(text: string): { name: string; amount: string } {
  const m = text.trim().match(/^(.*?)\s+((?:\d+(?:\.\d+)?\s*(?:x|×)\s*\d+.*)|(?:\d+(?:\.\d+)?\s*(?:m|min|mins|minutes?|h|hr|hrs|hours?|s|sec|secs|seconds?|reps?)\b.*))$/i);
  return m && m[1] ? { name: m[1].trim(), amount: m[2].trim() } : { name: text.trim(), amount: '' };
}

/** "7:00 AM", "7:00 AM and 7:00 PM", "7:00 AM, 12:00 PM and 7:00 PM" */
function listTimes(times: string[]): string {
  const t = [...times].sort().map(formatTime12h);
  return t.length <= 1 ? (t[0] ?? '') : `${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}`;
}

/** What the "On my schedule" card says it does */
export function scheduleNote(v: Pick<RoutineFieldValues, 'scheduleTimes' | 'days' | 'exerciseType' | 'trainingCategory' | 'isActive'>, minutes: number): string {
  if (!v.isActive) return 'Paused. It stays off your schedule.';
  const times = v.scheduleTimes ?? [];
  const days = describeDays(v.days ?? []);
  const when = times.length
    ? `Shows on Today at ${listTimes(times)} (${/^(Every day|Weekdays|Weekends)$/.test(days) ? days.toLowerCase() : days}).`
    : 'Add a time to put it on Today.';
  const what = `Ticking it logs a${minutes ? ` ${minutes} min` : ''} ${exerciseTypeLabel(v.exerciseType) || 'Exercise'} entry`;
  return `${when} ${what}${v.trainingCategory ? ` that counts toward ${v.trainingCategory}` : ''}.`;
}

interface RoutineFieldsProps {
  values: RoutineFieldValues;
  onChange: (values: RoutineFieldValues) => void;
  /** Categories from your training plans, offered under Counts toward training */
  categoryOptions?: string[];
  /** The routine's Time panel, opened from a stopwatch at the right of Duration */
  timer?: ReactNode;
  timerRunning?: boolean;
}

export function RoutineFields({ values, onChange, categoryOptions = [], timer, timerRunning }: RoutineFieldsProps) {
  const set = (patch: Partial<RoutineFieldValues>) => onChange({ ...values, ...patch });
  const [draft, setDraft] = useState('');
  const [itemsOpen, setItemsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const notesId = useId();
  const durationId = useId();
  const items = values.items ?? [];
  const days = values.days ?? [];
  const category = values.trainingCategory ?? '';
  const categories = category && !categoryOptions.some(c => c.toLowerCase() === category.toLowerCase())
    ? [...categoryOptions, category] : categoryOptions;

  const summed = Math.round(items.reduce((t, i) => t + amountMinutes(i.amount), 0));
  const minutes = parseFloat(values.duration ?? '') || summed;
  const showItems = itemsOpen || items.length > 0;
  const showNotes = notesOpen || !!values.notes;

  const updateItem = (id: string, patch: Partial<RoutineItem>) =>
    set({ items: items.map(i => (i.id === id ? { ...i, ...patch } : i)) });
  const addItem = () => {
    if (!draft.trim()) return;
    set({ items: [...items, { id: crypto.randomUUID(), ...splitExercise(draft) }] });
    setDraft('');
  };
  const toggleDay = (d: number) =>
    set({ days: days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort() });

  return (
    <FormWrap>
      <div>
        <TitleInput value={values.routineName ?? ''} onChange={e => set({ routineName: e.target.value })}
          placeholder="e.g. Walk" aria-label="Exercise name" />
      </div>

      <Section aria-label="Activity" style={{ marginTop: 30 }}>
        <SectionHead><SectionLabel>Activity</SectionLabel></SectionHead>
        {/* The chips wrap within about two thirds of the row (phones keep at least 300px) */}
        <Chips style={{ maxWidth: 'max(66%, 300px)' }}>
          {EXERCISE_TYPES.map(t => (
            <Chip key={t.value} type="button" $active={values.exerciseType === t.value} aria-pressed={values.exerciseType === t.value}
              onClick={() => set({ exerciseType: t.value })}>
              {ACTIVITY_LABEL[t.value] ?? t.label}
            </Chip>
          ))}
        </Chips>
      </Section>

      <Pair>
        <Section>
          <SectionHead><SectionLabel as="label" htmlFor={durationId}>Duration</SectionLabel></SectionHead>
          {/* Just as wide as a few minutes and the stopwatch need */}
          <DurationBox style={{ maxWidth: 220 }}>
            <DurationInput id={durationId} inputMode="numeric" value={values.duration ?? ''} placeholder={summed ? String(summed) : '0'}
              onChange={e => set({ duration: e.target.value.replace(/[^\d.]/g, '') })} />
            <span className="unit">min</span>
            {/* The timer at the box's right: view the time, start one, add time */}
            {timer && <span style={{ alignSelf: 'center', marginRight: -8 }}><TimerPopButton timer={timer} running={timerRunning} /></span>}
          </DurationBox>
        </Section>
        {/* Times and the days, on one row */}
        <Section aria-label="Days and times">
          <SectionHead><SectionLabel>Days &amp; times</SectionLabel></SectionHead>
          <DaysLine>
          <ReminderTimes compact times={values.scheduleTimes ?? []} label="Time" addAt="07:00"
            onChange={scheduleTimes => set({ scheduleTimes })} />
          <Days aria-label="Days">
            {DAY_CHIPS.map((label, d) => (
              <DayChip key={label} type="button" $active={days.includes(d)} aria-pressed={days.includes(d)}
                aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]}
                onClick={() => toggleDay(d)}>
                {label}
              </DayChip>
            ))}
          </Days>
          {/* On my schedule, at the row's right */}
          <span className="sched" title={scheduleNote(values, minutes)}>
            On my schedule
            <Toggle checked={values.isActive} aria-label="On my schedule" onChange={v => set({ isActive: v })} />
          </span>
          </DaysLine>
        </Section>
      </Pair>

      {categories.length > 0 && (
        <Section aria-label="Training">
          <SectionHead><SectionLabel>Training</SectionLabel></SectionHead>
          {/* A pill dropdown: None, then the plans' categories */}
          <div>
            <PillPick>
              <span className="value">{categories.find(c => c.toLowerCase() === category.toLowerCase()) ?? 'None'}</span>
              <Icon name="chevron-down" size={14} strokeWidth={2} />
              <select aria-label="Counts toward training" value={categories.find(c => c.toLowerCase() === category.toLowerCase()) ?? ''}
                onChange={e => set({ trainingCategory: e.target.value })}>
                <option value="">None</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </PillPick>
          </div>
        </Section>
      )}

      <Section aria-label="Exercises">
        <SectionHead>
          <SectionLabel>Exercises</SectionLabel>
          {items.length > 0 && <Count>{items.length} exercise{items.length === 1 ? '' : 's'}{summed ? ` · ${summed} min` : ''}</Count>}
        </SectionHead>
        {showItems ? (
          <>
            {items.length > 0 && (
              <ItemList>
                {items.map((item, i) => (
                  <Item key={item.id}>
                    <ItemNo>{i + 1}</ItemNo>
                    <InPlace value={item.name} placeholder="Exercise" aria-label={`Exercise ${i + 1}`}
                      onChange={e => updateItem(item.id, { name: e.target.value })} />
                    <AmountInput value={item.amount} placeholder="5 min / 3 × 10" aria-label={`Exercise ${i + 1} amount`}
                      onChange={e => updateItem(item.id, { amount: e.target.value })} />
                    <Remove type="button" aria-label={`Remove ${item.name || `exercise ${i + 1}`}`}
                      onClick={() => set({ items: items.filter(x => x.id !== item.id) })}>
                      <Icon name="x" size={14} strokeWidth={2} />
                    </Remove>
                  </Item>
                ))}
              </ItemList>
            )}
            <BoxInput value={draft} placeholder="+ Add an exercise, e.g. Pigeon pose 2 min" aria-label="Add an exercise"
              autoFocus={itemsOpen && items.length === 0}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
              onBlur={addItem} />
          </>
        ) : (
          <AddLink type="button" onClick={() => setItemsOpen(true)}>+ Add exercises to tick one by one</AddLink>
        )}
      </Section>

      <Section>
        <SectionHead>
          {showNotes ? <SectionLabel as="label" htmlFor={notesId}>Notes</SectionLabel> : <SectionLabel>Notes</SectionLabel>}
        </SectionHead>
        {showNotes ? (
          <BoxText id={notesId} value={values.notes ?? ''} placeholder="e.g. Hold each pose for five breaths"
            autoFocus={notesOpen && !values.notes} onChange={e => set({ notes: e.target.value })} />
        ) : (
          <AddLink type="button" onClick={() => setNotesOpen(true)}>+ Add notes</AddLink>
        )}
      </Section>

    </FormWrap>
  );
}
