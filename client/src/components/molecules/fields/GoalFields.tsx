import { useId, useState, type ReactNode } from 'react';
import styled from 'styled-components';
import type { GoalFieldValues } from '../../../types/fields.js';
import {
  FormWrap, Section, SectionHead, SectionLabel, TitleInput, Chips, Chip, RowBox, LabelledRow, RowLabel, BoxText,
} from './formKit.js';
import { Icon } from '../../atoms/core/Icon.jsx';
import { PillPick, FootPickBox, StatusDropdown, WhenBox2, WhenLine, WhenLabel, DateTimeInput, TimerPopButton } from './TaskCardFields.js';
export type { GoalFieldValues } from '../../../types/fields.js';

/* Goal fields — the same form in the journal editor and Quick Entry: the
   objective as the text's first line, its Category in the text box's foot
   strip (GoalCategoryPick) and Status as the first row (where it's reached
   for), then Type, When (Starts / Ends, the two ends of its roadmap bar) —
   each with a muted label on the left — then Notes. Props only. */

const TYPES: { value: GoalFieldValues['goalType']; label: string }[] = [
  { value: 'short_term', label: 'Short-term' },
  { value: 'long_term', label: 'Long-term' },
];

/* Same statuses as the goals board's columns (Achieved = completed) */
const STATUSES: { value: GoalFieldValues['goalStatus']; label: string; dot: string }[] = [
  { value: 'new', label: 'New', dot: 'var(--text-muted)' },
  { value: 'planned', label: 'Planned', dot: 'var(--text-secondary)' },
  { value: 'in_progress', label: 'In progress', dot: 'var(--chart-amber)' },
  { value: 'paused', label: 'Paused', dot: 'var(--text-muted)' },
  { value: 'completed', label: 'Achieved', dot: 'var(--color-accent)' },
];

/** The goal's Status, for its field row (like the task card's) */
export function GoalStatusPick({ values, onChange }: { values: GoalFieldValues; onChange: (v: GoalFieldValues) => void }) {
  const status = STATUSES.some(s => s.value === values.goalStatus) ? values.goalStatus : 'new';
  return <StatusDropdown value={status} options={STATUSES} onChange={goalStatus => onChange({ ...values, goalStatus })} />;
}

const NEW_CATEGORY = '__new_category__';

/* "+ New category…": a name box with a × to cancel */
const NameBox = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  input {
    width: 200px;
    height: 34px;
    padding: 0 12px;
    border: 1px solid var(--color-accent-line) !important;
    border-radius: 8px;
    background: transparent;
    font-family: var(--font-sans);
    font-size: 15px;
    color: var(--text-primary);
  }
  button {
    display: grid; place-items: center; width: 28px; height: 28px; padding: 0;
    border: none; border-radius: 50%; background: none; color: var(--text-muted); cursor: pointer;
  }
  button:hover { color: var(--text-primary); background: var(--bg-hover); }
`;

interface GoalFieldsProps {
  values: GoalFieldValues;
  onChange: (values: GoalFieldValues) => void;
  /** The categories to offer (built-in + the owner's own) */
  categories?: string[];
  /** Save a new category; omitted = no + Add */
  onAddCategory?: (label: string) => void;
  /** The goal's Time panel, opened from a stopwatch in the When row's top-right corner */
  timer?: ReactNode;
  timerRunning?: boolean;
  /** Category is picked in the text box's foot strip (the entry editor), so it has no row here */
  categoryInFoot?: boolean;
}

/** A category as a pill dropdown: None, the list, then "+ New category…" (a name box with a × in its
    place) — the goal's and the habit's. `name` puts a muted "Category:" before the choice */
export function CategoryPill({ value, categories, onPick, onAdd, name, foot }: {
  value: string; categories: string[]; onPick: (v: string) => void; onAdd?: (label: string) => void; name?: string;
  /** In the text box's foot strip: no pill, like the other foot pickers */
  foot?: boolean;
}) {
  const list = value && !categories.some(c => c.toLowerCase() === value.toLowerCase()) ? [...categories, value] : categories;
  const shown = list.find(c => c.toLowerCase() === value.toLowerCase());
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');
  const commit = () => {
    const label = draft.trim().replace(/\s+/g, ' ');
    if (label) { onAdd?.(label); onPick(label); }
    setDraft(''); setNaming(false);
  };
  if (naming) return (
    <NameBox>
      <input autoFocus value={draft} maxLength={40} placeholder="New category" aria-label="New category"
        onChange={e => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); setDraft(''); setNaming(false); }
        }} />
      <button type="button" aria-label="Cancel new category" title="Cancel"
        onMouseDown={e => e.preventDefault()} onClick={() => { setDraft(''); setNaming(false); }}>
        <Icon name="x" size={14} strokeWidth={2} />
      </button>
    </NameBox>
  );
  const Shell = foot ? FootPickBox : PillPick;
  const picker = (
    <Shell>
      {name && <span className="name">{name}</span>}
      <span className="value">{shown ?? 'None'}</span>
      <Icon name="chevron-down" size={14} strokeWidth={2} />
      <select aria-label="Category" value={shown ?? ''}
        onChange={e => { if (e.target.value === NEW_CATEGORY) setNaming(true); else onPick(e.target.value); }}>
        <option value="">None</option>
        {list.map(c => <option key={c} value={c}>{c}</option>)}
        {onAdd && <option value={NEW_CATEGORY}>+ New category…</option>}
      </select>
    </Shell>
  );
  return foot ? picker : <div>{picker}</div>;
}

/** The goal's Category, for the text box's foot strip (Status has the row under the title) */
export function GoalCategoryPick({ values, onChange, categories, onAddCategory }: {
  values: GoalFieldValues; onChange: (v: GoalFieldValues) => void; categories: string[]; onAddCategory?: (label: string) => void;
}) {
  return <CategoryPill foot name="Category" value={values.goalCategory ?? ''} categories={categories}
    onPick={goalCategory => onChange({ ...values, goalCategory })} onAdd={onAddCategory} />;
}

export function GoalFields({ values, onChange, categories = [], onAddCategory, timer, timerRunning, categoryInFoot }: GoalFieldsProps) {
  const set = (patch: Partial<GoalFieldValues>) => onChange({ ...values, ...patch });
  const notesId = useId();


  return (
    <FormWrap>
      <Section>
        <TitleInput
          value={values.goalObjective ?? ''}
          onChange={e => set({ goalObjective: e.target.value })}
          placeholder="What do you want to achieve?"
          aria-label="Goal"
        />
      </Section>

      <RowBox style={{ marginTop: 30 }}>
        {/* Status first, where it's reached for */}
        <LabelledRow>
          <RowLabel>Status</RowLabel>
          <GoalStatusPick values={values} onChange={onChange} />
        </LabelledRow>
        {!categoryInFoot && (
          <LabelledRow>
            <RowLabel>Category</RowLabel>
            <CategoryPill value={values.goalCategory ?? ''} categories={categories} onPick={goalCategory => set({ goalCategory })} onAdd={onAddCategory} />
          </LabelledRow>
        )}
        <LabelledRow>
          <RowLabel>Type</RowLabel>
          <Chips role="radiogroup" aria-label="Type">
            {TYPES.map(t => (
              <Chip key={t.value} type="button" role="radio" aria-checked={values.goalType === t.value}
                $active={values.goalType === t.value} onClick={() => set({ goalType: t.value })}>
                {t.label}
              </Chip>
            ))}
          </Chips>
        </LabelledRow>
        {/* When: Starts (the start date) and Ends (the target date), the two ends of its roadmap bar */}
        <LabelledRow style={timer ? { position: 'relative' } : undefined}>
          <RowLabel>When</RowLabel>
          {/* The timer in the row's top-right corner: view the time, start one, add time */}
          {timer && <span style={{ position: 'absolute', top: 10, right: 20 }}><TimerPopButton timer={timer} running={timerRunning} /></span>}
          <WhenBox2 style={{ maxWidth: 420 }}>
            <WhenLine $allDay>
              <WhenLabel>Starts</WhenLabel>
              <DateTimeInput type="date" aria-label="Start date" value={values.startOn ?? ''} max={values.targetDate || undefined}
                onChange={e => set({ startOn: e.target.value })} />
            </WhenLine>
            <WhenLine $allDay>
              <WhenLabel>Ends</WhenLabel>
              <DateTimeInput type="date" aria-label="Target date" value={values.targetDate} onChange={e => set({ targetDate: e.target.value })} />
            </WhenLine>
          </WhenBox2>
        </LabelledRow>
      </RowBox>

      <Section style={{ marginTop: 30 }}>
        <SectionHead><SectionLabel as="label" htmlFor={notesId}>Notes</SectionLabel></SectionHead>
        <BoxText id={notesId} value={values.notes ?? ''} placeholder="Additional details"
          onChange={e => set({ notes: e.target.value })} />
      </Section>
    </FormWrap>
  );
}
