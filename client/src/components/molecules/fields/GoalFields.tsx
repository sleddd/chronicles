import { useId } from 'react';
import type { GoalFieldValues } from '../../../types/fields.js';
import {
  FormWrap, Section, SectionHead, SectionLabel, TitleInput, Chips, Chip, RowBox, LabelledRow, RowLabel, BareDate, BoxText,
} from './formKit.js';
import { PickChips } from './PickChips.js';
export type { GoalFieldValues } from '../../../types/fields.js';

/* Goal fields — the same form in the journal editor and Quick Entry: the
   objective as a big borderless title (an older goal's text fills it once),
   then one outlined box of rows — Category (the person's own list: tap again
   to clear, + Add, Edit), Type and Status as outline chips, Start date and
   Target date (the two ends of its bar on the roadmap) — each with a muted
   label on the left, then Notes. Props only. */

const TYPES: { value: GoalFieldValues['goalType']; label: string }[] = [
  { value: 'short_term', label: 'Short-term' },
  { value: 'long_term', label: 'Long-term' },
];

/* Same statuses as the goals board's columns (Achieved = completed) */
const STATUSES: { value: GoalFieldValues['goalStatus']; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Achieved' },
];

interface GoalFieldsProps {
  values: GoalFieldValues;
  onChange: (values: GoalFieldValues) => void;
  /** The categories to offer (built-in + the owner's own) */
  categories?: string[];
  /** Save a new category; omitted = no + Add */
  onAddCategory?: (label: string) => void;
  /** Remove one from the list; omitted = no Edit */
  onRemoveCategory?: (label: string) => void;
}

export function GoalFields({ values, onChange, categories = [], onAddCategory, onRemoveCategory }: GoalFieldsProps) {
  const set = (patch: Partial<GoalFieldValues>) => onChange({ ...values, ...patch });
  // Older goals may hold a legacy status ("active", "archived") — those show as New
  const status = STATUSES.some(s => s.value === values.goalStatus) ? values.goalStatus : 'new';
  const startId = useId();
  const dateId = useId();
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
        <LabelledRow>
          <RowLabel>Category</RowLabel>
          <PickChips label="Category" value={values.goalCategory ?? ''} options={categories}
            onPick={goalCategory => set({ goalCategory })} onAdd={onAddCategory} onRemove={onRemoveCategory} />
        </LabelledRow>
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
        <LabelledRow>
          <RowLabel>Status</RowLabel>
          <Chips role="radiogroup" aria-label="Status">
            {STATUSES.map(s => (
              <Chip key={s.value} type="button" role="radio" aria-checked={status === s.value}
                $active={status === s.value} onClick={() => set({ goalStatus: s.value })}>
                {s.label}
              </Chip>
            ))}
          </Chips>
        </LabelledRow>
        <LabelledRow>
          <RowLabel as="label" htmlFor={startId}>Start date</RowLabel>
          <BareDate id={startId} type="date" value={values.startOn ?? ''} max={values.targetDate || undefined}
            onChange={e => set({ startOn: e.target.value })} />
        </LabelledRow>
        <LabelledRow>
          <RowLabel as="label" htmlFor={dateId}>Target date</RowLabel>
          <BareDate id={dateId} type="date" value={values.targetDate} onChange={e => set({ targetDate: e.target.value })} />
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
