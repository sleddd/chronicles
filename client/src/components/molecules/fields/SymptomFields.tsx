import { useId, useState, type KeyboardEvent } from 'react';
import styled from 'styled-components';
import type { SymptomFieldValues } from '../../../types/fields.js';
import {
  FormWrap, Section, SectionHead, SectionLabel, DateTimeBox, DateTimeField, Unit, BoxText, TitleInput, Chips, Chip, TextAction,
} from './formKit.js';
import { hasSymptom, toggleSymptom } from '../../../utils/symptomChips.js';
export type { SymptomFieldValues } from '../../../types/fields.js';

/* Symptom fields (journal editor): the symptom(s) as a big borderless title,
   with common symptoms as chips under it — tap to add or take one out, several
   allowed ("Flare day, Runny nose"); + Add saves a chip of your own and Edit
   lets chips be removed (the list itself comes from the owner, saved
   encrypted). Then Severity as ten tiles filled up to the
   chosen level — the accent, light at 1 and full strength at 10 — with
   the level as a big light figure + "/ 10 · Moderate" on the right and
   Mild / Moderate / Severe under the scale; When as one outlined box of
   date | time | how long it lasted; Notes in an outlined box. Props only. */

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function severityWord(n: number): string {
  return n <= 3 ? 'Mild' : n <= 6 ? 'Moderate' : 'Severe';
}

const Readout = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-muted);
`;

const Figure = styled.span`
  font-family: var(--font-display);
  font-size: 48px;
  font-weight: 200;
  line-height: 0.9;
  color: var(--text-primary);
`;

const Scale = styled.div`
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 4px;
`;

/* Filled tiles are the accent, lightened most at 1 and full strength at 10.
   Light tints carry dark ink; the deeper ones --on-accent */
const tint = (level: number) => Math.round(55 * (1 - (level - 1) / 9)); // % white
const Tile = styled.button<{ $filled: boolean; $level: number }>`
  height: 40px;
  min-width: 0;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: ${({ $filled, $level }) => ($filled
    ? `color-mix(in oklab, var(--color-accent), white ${tint($level)}%)`
    : 'var(--bg-today-col)')};
  font-family: var(--font-sans);
  font-size: 15px;
  color: ${({ $filled, $level }) => (!$filled ? 'var(--text-muted)' : tint($level) >= 25 ? '#202229' : 'var(--on-accent)')};
  cursor: pointer;
  transition: background 120ms, filter 120ms;
  &:hover { filter: brightness(1.12); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const ScaleLabels = styled.div`
  display: flex;
  justify-content: space-between;
  margin-top: 14px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-placeholder);
`;

/* date | time | lasted */
const WhenBox = styled(DateTimeBox)`
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 0.9fr);
  @media (max-width: 560px) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    & > :last-child { grid-column: 1 / -1; border-left: none; border-top: 1px solid var(--border-card); }
  }
`;

const Lasted = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 16px;
  cursor: text;
  &:focus-within { box-shadow: inset 0 0 0 1px var(--color-accent); }
`;

const LastedInput = styled(DateTimeField)`
  && { flex: 1; padding-right: 0; }
  &&:focus { box-shadow: none; }
  &::placeholder { color: var(--text-hint); }
  -moz-appearance: textfield;
  &::-webkit-inner-spin-button, &::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
`;

/* The 1–10 severity scale section — shared by Symptom and Allergy fields */
export function SeveritySection({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const level = Math.min(10, Math.max(1, Number(value) || 1));
  return (
    <Section aria-label="Severity">
      <SectionHead>
        <SectionLabel>Severity</SectionLabel>
        <Readout aria-live="polite">
          <Figure>{level}</Figure>
          <span>/ 10 · {severityWord(level)}</span>
        </Readout>
      </SectionHead>
      <Scale role="radiogroup" aria-label="Severity">
        {LEVELS.map(n => (
          <Tile key={n} type="button" role="radio" aria-checked={n === level} aria-label={`Severity ${n}`}
            $filled={n <= level} $level={n} onClick={() => onChange(n)}>
            {n}
          </Tile>
        ))}
      </Scale>
      <ScaleLabels aria-hidden="true"><span>Mild</span><span>Moderate</span><span>Severe</span></ScaleLabels>
    </Section>
  );
}

const ChipHead = styled(SectionHead)`
  margin-top: 26px;
`;

/* A chip in Edit mode: tapping removes it */
const RemoveChip = styled(Chip)`
  &::after { content: '×'; margin-left: 8px; font-size: 16px; line-height: 1; }
`;

const AddBox = styled.input`
  && {
    height: 32px;
    width: 160px;
    padding: 0 14px;
    border: 1px dashed var(--color-accent-line) !important;
    border-radius: 999px;
    background: transparent !important;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-secondary);
    outline: none;
  }
`;

const AddChip = styled(Chip)`
  border-style: dashed;
  color: var(--color-accent-soft);
`;

interface SymptomFieldsProps {
  values: SymptomFieldValues;
  onChange: (values: SymptomFieldValues) => void;
  /** The chips to show (built-in + the owner's own) */
  chips?: string[];
  /** Save a new chip; omitted = no + Add / Edit */
  onAddChip?: (label: string) => void;
  onRemoveChip?: (label: string) => void;
}

export function SymptomFields({ values, onChange, chips = [], onAddChip, onRemoveChip }: SymptomFieldsProps) {
  const set = (patch: Partial<SymptomFieldValues>) => onChange({ ...values, ...patch });
  const notesId = useId();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const commitDraft = () => {
    const label = draft.trim();
    if (label) {
      onAddChip?.(label);
      if (!hasSymptom(values.symptomName, label)) set({ symptomName: toggleSymptom(values.symptomName, label) });
    }
    setDraft('');
    setAdding(false);
  };
  const onDraftKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commitDraft(); }
    if (e.key === 'Escape') { setDraft(''); setAdding(false); }
  };

  return (
    <FormWrap>
      <TitleInput
        value={values.symptomName}
        onChange={e => set({ symptomName: e.target.value })}
        placeholder="What's going on?"
        aria-label="Symptom"
      />

      <Section aria-label="Common symptoms">
        <ChipHead>
          <SectionLabel>Common symptoms</SectionLabel>
          {onRemoveChip && chips.length > 0 && (
            <TextAction type="button" onClick={() => setEditing(e => !e)}>{editing ? 'Done' : 'Edit'}</TextAction>
          )}
        </ChipHead>
        <Chips>
          {chips.map(c => (editing ? (
            <RemoveChip key={c} type="button" $active={false} aria-label={`Remove ${c}`} onClick={() => onRemoveChip?.(c)}>{c}</RemoveChip>
          ) : (
            <Chip key={c} type="button" $active={hasSymptom(values.symptomName, c)} aria-pressed={hasSymptom(values.symptomName, c)}
              onClick={() => set({ symptomName: toggleSymptom(values.symptomName, c) })}>{c}</Chip>
          )))}
          {onAddChip && !editing && (adding ? (
            <AddBox autoFocus value={draft} maxLength={40} placeholder="New symptom" aria-label="New symptom"
              onChange={e => setDraft(e.target.value)} onKeyDown={onDraftKey} onBlur={commitDraft} />
          ) : (
            <AddChip type="button" $active={false} onClick={() => setAdding(true)}>+ Add</AddChip>
          ))}
        </Chips>
      </Section>

      <SeveritySection value={values.severity} onChange={n => set({ severity: n })} />

      <Section aria-label="When">
        <SectionHead><SectionLabel>When</SectionLabel></SectionHead>
        <WhenBox>
          <DateTimeField type="date" value={values.occurredDate} aria-label="Date"
            onChange={e => set({ occurredDate: e.target.value })} />
          <DateTimeField type="time" value={values.occurredTime} aria-label="Time"
            onChange={e => set({ occurredTime: e.target.value })} />
          <Lasted>
            <LastedInput inputMode="numeric" value={values.duration} placeholder="Lasted" aria-label="Lasted (minutes)"
              onChange={e => set({ duration: e.target.value.replace(/[^\d.]/g, '') })} />
            <Unit>min</Unit>
          </Lasted>
        </WhenBox>
      </Section>

      <Section>
        <SectionHead><SectionLabel as="label" htmlFor={notesId}>Notes</SectionLabel></SectionHead>
        <BoxText id={notesId} value={values.notes} placeholder="Additional details"
          onChange={e => set({ notes: e.target.value })} />
      </Section>
    </FormWrap>
  );
}
