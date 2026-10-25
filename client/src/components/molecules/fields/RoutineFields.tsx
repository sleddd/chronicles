import { useId, useState } from 'react';
import styled from 'styled-components';
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
const Pair = styled.div`
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
  span { flex: none; font-family: var(--font-sans); font-size: 15px; color: var(--text-muted); }
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

const Days = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;

const DayChip = styled.button<{ $active: boolean }>`
  width: 46px;
  height: 44px;
  padding: 0;
  border-radius: var(--r-lg, 6px);
  border: 1px solid ${({ $active }) => ($active ? 'var(--color-accent-line)' : 'var(--border-card)')};
  background: ${({ $active }) => ($active ? 'var(--bg-selected, transparent)' : 'var(--bg-control, transparent)')};
  font-family: var(--font-sans);
  font-size: 15px;
  color: ${({ $active }) => ($active ? 'var(--color-accent-soft)' : 'var(--text-secondary)')};
  cursor: pointer;
  &:hover { border-color: ${({ $active }) => ($active ? 'var(--color-accent-line)' : 'var(--control-border)')}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
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

const StatusCard = styled.div`
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
}

export function RoutineFields({ values, onChange, categoryOptions = [] }: RoutineFieldsProps) {
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
        <Chips>
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
          <DurationBox>
            <DurationInput id={durationId} inputMode="numeric" value={values.duration ?? ''} placeholder={summed ? String(summed) : '0'}
              onChange={e => set({ duration: e.target.value.replace(/[^\d.]/g, '') })} />
            <span>min</span>
          </DurationBox>
        </Section>
        <Section aria-label="Times">
          <SectionHead><SectionLabel>Times</SectionLabel></SectionHead>
          <ReminderTimes compact times={values.scheduleTimes ?? []} label="Time" addAt="07:00"
            onChange={scheduleTimes => set({ scheduleTimes })} />
        </Section>
      </Pair>

      <Section aria-label="Days" style={{ marginTop: 30 }}>
        <SectionHead>
          <SectionLabel>Days</SectionLabel>
          <Count>{describeDays(days)}</Count>
        </SectionHead>
        <Days>
          {DAY_CHIPS.map((label, d) => (
            <DayChip key={label} type="button" $active={days.includes(d)} aria-pressed={days.includes(d)}
              aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]}
              onClick={() => toggleDay(d)}>
              {label}
            </DayChip>
          ))}
        </Days>
      </Section>

      {categories.length > 0 && (
        <Section aria-label="Counts toward training">
          <SectionHead><SectionLabel>Counts toward training</SectionLabel></SectionHead>
          <Chips>
            {categories.map(c => {
              const on = c.toLowerCase() === category.toLowerCase();
              return (
                <Chip key={c} type="button" $active={on} aria-pressed={on} onClick={() => set({ trainingCategory: c })}>{c}</Chip>
              );
            })}
            <Chip type="button" $active={!category} aria-pressed={!category} onClick={() => set({ trainingCategory: '' })}>None</Chip>
          </Chips>
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

      <StatusCard>
        <div>
          <div className="title">On my schedule</div>
          <div className="note">{scheduleNote(values, minutes)}</div>
        </div>
        <Toggle checked={values.isActive} aria-label="On my schedule" onChange={v => set({ isActive: v })} />
      </StatusCard>
    </FormWrap>
  );
}
