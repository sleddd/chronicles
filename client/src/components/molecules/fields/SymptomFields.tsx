import { useId, useState, type KeyboardEvent } from 'react';
import { Icon } from '../../atoms/core/Icon.jsx';
import { PillPick } from './TaskCardFields.js';
import styled from 'styled-components';
import type { SymptomFieldValues } from '../../../types/fields.js';
import {
  FormWrap, Section, SectionHead, SectionLabel, DateTimeBox, DateTimeField, Unit, BoxText, TitleInput, Chips, TextAction,
  RemoveChip, AddChipBox,
} from './formKit.js';
import { hasSymptom, toggleSymptom } from '../../../utils/symptomChips.js';
import { severityWord } from '../../../utils/symptomHistory.js';
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

export { severityWord };

/* "5 · Moderate" in the accent, across from the scale's start */
const Readout = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-accent-soft);
`;

const THUMB = 22;

/* A slider: a rounded track filled in the accent up to the level, a round thumb,
   and the numbers 1–10 under it, each under its stop */
const Slider = styled.input<{ $pct: number }>`
  && {
    display: block;
    width: 100%;
    height: ${THUMB}px;
    margin: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
  }
  &::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(to right, var(--color-accent) ${({ $pct }) => $pct}%, var(--border-default) ${({ $pct }) => $pct}%);
  }
  &::-moz-range-track { height: 6px; border-radius: 3px; background: var(--border-default); }
  &::-moz-range-progress { height: 6px; border-radius: 3px; background: var(--color-accent); }
  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: ${THUMB}px;
    height: ${THUMB}px;
    margin-top: ${(6 - THUMB) / 2}px;
    border: 2px solid var(--text-secondary);
    border-radius: 50%;
    background: #fff;
  }
  &::-moz-range-thumb { width: ${THUMB - 4}px; height: ${THUMB - 4}px; border: 2px solid var(--text-secondary); border-radius: 50%; background: #fff; }
  &:focus-visible { outline: none; }
  &:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px var(--color-accent-subtle), 0 0 0 1px var(--color-accent); }
`;

/* The stops' numbers, each centred under where the thumb sits for it */
const Ticks = styled.div`
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  padding: 0 ${THUMB / 2 - 4}px;
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-muted);
  span { width: 8px; text-align: center; }
`;

const ADD = '__add_symptom__';
const EDIT = '__edit_symptoms__';

/* Common symptoms, then the date | time | lasted box, on one line */
const SymptomLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  min-width: 0;
  & > label:first-child { max-width: 100%; }
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

/* The 1–10 severity slider — shared by Symptom and Allergy fields */
export function SeveritySection({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const level = Math.min(10, Math.max(1, Number(value) || 1));
  return (
    <Section aria-label="Severity">
      <SectionHead><SectionLabel as="label" htmlFor="severity-slider">Severity</SectionLabel></SectionHead>
      <div>
        <Readout aria-hidden="true">{level} · {severityWord(level)}</Readout>
        <Slider id="severity-slider" type="range" min={1} max={10} step={1} value={level}
          $pct={((level - 1) / 9) * 100} aria-valuetext={`${level} out of 10, ${severityWord(level)}`}
          onChange={e => onChange(Number(e.target.value))} />
        <Ticks aria-hidden="true">{LEVELS.map(n => <span key={n}>{n}</span>)}</Ticks>
      </div>
    </Section>
  );
}


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
    if (e.key === 'Escape') { e.preventDefault(); setDraft(''); setAdding(false); }
  };

  return (
    <FormWrap>
      <TitleInput
        value={values.symptomName}
        onChange={e => set({ symptomName: e.target.value })}
        placeholder="What's going on?"
        aria-label="Symptom"
      />

      {/* Common symptoms (a pill dropdown: picking one adds it to the name, picking it again takes it
          out; + Add a symptom…, Edit list…) and when, on one row */}
      <Section aria-label="When">
        <SectionHead><SectionLabel>When</SectionLabel></SectionHead>
        <SymptomLine>
          {adding ? (
            <AddChipBox autoFocus value={draft} maxLength={40} placeholder="New symptom" aria-label="New symptom"
              onChange={e => setDraft(e.target.value)} onKeyDown={onDraftKey} onBlur={commitDraft} />
          ) : (
            <PillPick style={{ height: 52, borderRadius: 10, padding: '0 16px' }}>
              <span className="value">{chips.filter(c => hasSymptom(values.symptomName, c)).join(', ') || 'Common symptoms'}</span>
              <Icon name="chevron-down" size={14} strokeWidth={2} />
              <select aria-label="Common symptoms" value=""
                onChange={e => {
                  const v = e.target.value;
                  if (v === ADD) setAdding(true);
                  else if (v === EDIT) setEditing(true);
                  else if (v) set({ symptomName: toggleSymptom(values.symptomName, v) });
                }}>
                <option value="">Common symptoms</option>
                {chips.map(c => <option key={c} value={c}>{hasSymptom(values.symptomName, c) ? `✓ ${c}` : c}</option>)}
                {onAddChip && <option value={ADD}>+ Add a symptom…</option>}
                {onRemoveChip && chips.length > 0 && <option value={EDIT}>Edit list…</option>}
              </select>
            </PillPick>
          )}
          <WhenBox style={{ flex: '1 1 300px', maxWidth: 480 }}>
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
        </SymptomLine>
        {/* Edit list: the list's symptoms with a × each (a built-in one is hidden, your own deleted) */}
        {editing && (
          <Chips aria-label="Edit common symptoms">
            {chips.map(c => (
              <RemoveChip key={c} type="button" $active={false} aria-label={`Remove ${c}`} onClick={() => onRemoveChip?.(c)}>{c}</RemoveChip>
            ))}
            <TextAction type="button" onClick={() => setEditing(false)}>Done</TextAction>
          </Chips>
        )}
      </Section>

      <SeveritySection value={values.severity} onChange={n => set({ severity: n })} />


      <Section>
        <SectionHead><SectionLabel as="label" htmlFor={notesId}>Notes</SectionLabel></SectionHead>
        <BoxText id={notesId} value={values.notes} placeholder="Additional details"
          onChange={e => set({ notes: e.target.value })} />
      </Section>
    </FormWrap>
  );
}
