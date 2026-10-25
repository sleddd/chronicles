import { useId, useState } from 'react';
import styled from 'styled-components';
import { Icon } from '../../atoms/core/Icon.jsx';
import { Toggle } from '../../atoms/Toggle.js';
import { ReminderTimes } from './ReminderTimes.js';
import type { RoutineFieldValues, RoutineItem } from '../../../types/fields.js';
import { EXERCISE_TYPES } from '../../../utils/exerciseSummary.js';
import { WEEKDAYS, amountMinutes, describeDays } from '../../../utils/routines.js';
import {
  FormWrap, Section, SectionHead, SectionLabel, TitleInput, Chips, Chip,
  Strip, Cell, CellHead, CellValue, CellInput, Unit, BoxInput, BoxText, FieldNote,
} from './formKit.js';

/* Exercise routine fields (journal editor): the name as a big borderless
   title; Activity chips (what its sessions log as); Exercises as rows — name
   and amount edited in place, × — plus an outlined add box ("Pigeon 2 min"
   splits into name + amount); Session length; Days as weekday chips; Times as
   reminder pills; an optional Training category; Notes; and a "Currently
   doing" card — like a medication's Currently taking. Props only. */

const ACTIVITY_LABEL: Record<string, string> = { strength: 'Strength' };

const Count = styled.span`
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
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

const StatusCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 30px;
  padding: 16px 18px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
`;

const StatusTitle = styled.div`
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-secondary);
`;

const StatusNote = styled.div`
  margin-top: 4px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

/** "Pigeon pose 2 min" → name "Pigeon pose", amount "2 min"; "Squats 3x10" too */
export function splitExercise(text: string): { name: string; amount: string } {
  const m = text.trim().match(/^(.*?)\s+((?:\d+(?:\.\d+)?\s*(?:x|×)\s*\d+.*)|(?:\d+(?:\.\d+)?\s*(?:m|min|mins|minutes?|h|hr|hrs|hours?|s|sec|secs|seconds?|reps?)\b.*))$/i);
  return m && m[1] ? { name: m[1].trim(), amount: m[2].trim() } : { name: text.trim(), amount: '' };
}

interface RoutineFieldsProps {
  values: RoutineFieldValues;
  onChange: (values: RoutineFieldValues) => void;
  /** Categories from your training plans, offered for Training category */
  categoryOptions?: string[];
}

export function RoutineFields({ values, onChange, categoryOptions = [] }: RoutineFieldsProps) {
  const set = (patch: Partial<RoutineFieldValues>) => onChange({ ...values, ...patch });
  const [draft, setDraft] = useState('');
  const notesId = useId();
  const categoryId = useId();
  const listId = useId();
  const items = values.items ?? [];
  const days = values.days ?? [];

  const summed = Math.round(items.reduce((t, i) => t + amountMinutes(i.amount), 0));
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
        <TitleInput
          value={values.routineName ?? ''}
          onChange={e => set({ routineName: e.target.value })}
          placeholder="e.g. Morning yoga"
          aria-label="Routine name"
        />
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

      <Section aria-label="Exercises">
        <SectionHead>
          <SectionLabel>Exercises</SectionLabel>
          <Count>{items.length === 0 ? 'None yet' : `${items.length} exercise${items.length === 1 ? '' : 's'}${summed ? ` · ${summed} min` : ''}`}</Count>
        </SectionHead>
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
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
          onBlur={addItem} />
      </Section>

      <Section aria-label="Session length">
        <SectionHead><SectionLabel>Session length</SectionLabel></SectionHead>
        <Strip $cols={1} style={{ maxWidth: 220 }}>
          <Cell>
            <CellHead>Duration</CellHead>
            <CellValue>
              <CellInput inputMode="numeric" value={values.duration ?? ''} placeholder={summed ? String(summed) : '0'} aria-label="Duration (min)"
                onChange={e => set({ duration: e.target.value.replace(/[^\d.]/g, '') })} />
              <Unit>min</Unit>
            </CellValue>
          </Cell>
        </Strip>
        <FieldNote>Leave blank to add up the exercises’ minutes.</FieldNote>
      </Section>

      <Section aria-label="Days">
        <SectionHead>
          <SectionLabel>Days</SectionLabel>
          <Count>{describeDays(days)}</Count>
        </SectionHead>
        <Chips>
          {WEEKDAYS.map((label, d) => (
            <Chip key={label} type="button" $active={days.includes(d)} aria-pressed={days.includes(d)}
              onClick={() => toggleDay(d)}>
              {label}
            </Chip>
          ))}
        </Chips>
        <FieldNote>Pick none to do it every day.</FieldNote>
      </Section>

      <Section aria-label="Times">
        <SectionHead><SectionLabel>Times</SectionLabel></SectionHead>
        <ReminderTimes times={values.scheduleTimes ?? []} label="Routine time" addAt="07:00"
          onChange={scheduleTimes => set({ scheduleTimes })} />
      </Section>

      <Section>
        <SectionHead><SectionLabel as="label" htmlFor={categoryId}>Training category</SectionLabel></SectionHead>
        <BoxInput id={categoryId} list={categoryOptions.length ? listId : undefined} value={values.trainingCategory ?? ''}
          placeholder="e.g. Core stability" onChange={e => set({ trainingCategory: e.target.value })} />
        {categoryOptions.length > 0 && (
          <datalist id={listId}>{categoryOptions.map(c => <option key={c} value={c} />)}</datalist>
        )}
        <FieldNote>Sessions count toward this category in your training plan.</FieldNote>
      </Section>

      <Section>
        <SectionHead><SectionLabel as="label" htmlFor={notesId}>Notes</SectionLabel></SectionHead>
        <BoxText id={notesId} value={values.notes ?? ''} placeholder="e.g. Hold each pose for five breaths"
          onChange={e => set({ notes: e.target.value })} />
      </Section>

      <StatusCard>
        <div>
          <StatusTitle>Currently doing</StatusTitle>
          <StatusNote>
            {values.isActive
              ? 'On your daily checklist at its times'
              : 'Paused. It stays off your checklist.'}
          </StatusNote>
        </div>
        <Toggle checked={values.isActive} aria-label="Currently doing" onChange={v => set({ isActive: v })} />
      </StatusCard>
    </FormWrap>
  );
}
