import { useId, useState } from 'react';
import styled from 'styled-components';
import { Icon } from '../../atoms/core/Icon.jsx';
import { Toggle } from '../../atoms/Toggle.js';
import { DOSE_NUTRIENTS, parseMedNutrients } from '../../../utils/medNutrients.js';
import type { MedicationFieldValues } from '../../../types/fields.js';
import {
  FormWrap, Section, SectionHead, SectionLabel, TitleInput, Chips, Chip,
  Strip, Cell, CellHead, CellValue, CellInput, Unit, BoxText, FieldNote,
} from './formKit.js';
export type { MedicationFieldValues } from '../../../types/fields.js';

/* Medication fields (journal editor + Quick Entry): the name as a big
   borderless title with the dosage as a quiet line under it; How often as
   outline chips; Reminders as time pills plus a dashed "+ Add time" pill;
   Nutrients per dose as an outlined strip; Notes behind "+ Add notes"; and a
   "Currently taking" card with a switch. Props only. */

const DoseInput = styled.input`
  && {
    width: 100%;
    margin-top: 12px;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 17px;
    color: var(--text-soft);
  }
  &::placeholder { color: var(--text-hint); }
`;

const Head = styled.div`
  margin-bottom: 4px;
`;

const Times = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
`;

/* A reminder: an outlined pill holding the time (its native clock) and × */
const TimePill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 42px;
  padding: 0 10px 0 16px;
  border: 1px solid var(--border-card);
  border-radius: 999px;
  &:focus-within { border-color: var(--color-accent); }
`;

const TimeInput = styled.input`
  && {
    width: auto;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 16px;
    color: var(--text-primary);
    color-scheme: light dark;
  }
  &::-webkit-calendar-picker-indicator { opacity: 0.55; cursor: pointer; margin-left: 8px; }
`;

const RemoveBtn = styled.button`
  display: inline-flex;
  padding: 4px;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--color-danger); }
`;

const AddTimePill = styled.button`
  height: 42px;
  padding: 0 18px;
  border: 1px dashed var(--border-dashed);
  border-radius: 999px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--color-accent-link);
  cursor: pointer;
  &:hover { border-color: var(--control-border); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* Four across; two-up on phones */
const NutrientStrip = styled(Strip)`
  @media (max-width: 560px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
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

/* "Currently taking": title + note on the left, switch on the right */
const StatusCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 40px;
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

const FREQUENCIES: { value: MedicationFieldValues['frequency']; label: string }[] = [
  { value: 'once_daily', label: 'Once daily' },
  { value: 'twice_daily', label: 'Twice daily' },
  { value: 'as_needed', label: 'As needed' },
  { value: 'weekly', label: 'Weekly' },
];

/* Older choices no longer offered — still shown while an entry has one */
const LEGACY_FREQUENCY: Record<string, string> = {
  three_times_daily: 'Three times daily',
  custom: 'Custom',
};

interface MedicationFieldsProps {
  values: MedicationFieldValues;
  onChange: (values: MedicationFieldValues) => void;
  /** The medication's name (entry text) — lets "Vitamin D3 1000 IU" prefill its nutrients. */
  entryName?: string;
}

export function MedicationFields({ values, onChange, entryName = '' }: MedicationFieldsProps) {
  const cf = values as unknown as Record<string, unknown>;
  const set = (patch: Partial<MedicationFieldValues>) => onChange({ ...values, ...patch });
  const detected = parseMedNutrients(entryName || values.medicationName || '', values.dosage ?? '');
  const [notesOpen, setNotesOpen] = useState(false);
  const showNotes = notesOpen || !!values.notes;
  const notesId = useId();
  const aiKeys = new Set(cf.doseNutrientSource === 'ai'
    ? DOSE_NUTRIENTS.filter(n => String(cf[n.key] ?? '') !== '').map(n => n.key as string)
    : []);
  const anyAi = aiKeys.size > 0;
  const setNutrient = (key: string, v: string) =>
    onChange({ ...cf, [key]: v, doseNutrientSource: 'manual' } as unknown as MedicationFieldValues);

  const frequencies = LEGACY_FREQUENCY[values.frequency]
    ? [...FREQUENCIES, { value: values.frequency, label: LEGACY_FREQUENCY[values.frequency] }]
    : FREQUENCIES;

  const updateTime = (index: number, time: string) => {
    const times = [...values.scheduleTimes];
    times[index] = time;
    set({ scheduleTimes: times });
  };

  return (
    <FormWrap>
      <Head>
        <TitleInput
          value={values.medicationName ?? ''}
          onChange={e => set({ medicationName: e.target.value })}
          placeholder="e.g. Montelukast"
          aria-label="Medication name"
        />
        <DoseInput
          value={values.dosage}
          onChange={e => set({ dosage: e.target.value })}
          placeholder="Dosage, e.g. 500mg"
          aria-label="Dosage"
        />
      </Head>

      <Section aria-label="How often">
        <SectionHead><SectionLabel>How often</SectionLabel></SectionHead>
        <Chips role="radiogroup" aria-label="How often">
          {frequencies.map(f => (
            <Chip key={f.value} type="button" role="radio" aria-checked={values.frequency === f.value}
              $active={values.frequency === f.value} onClick={() => set({ frequency: f.value })}>
              {f.label}
            </Chip>
          ))}
        </Chips>
      </Section>

      <Section aria-label="Reminders">
        <SectionHead><SectionLabel>Reminders</SectionLabel></SectionHead>
        <Times>
          {values.scheduleTimes.map((time, i) => (
            <TimePill key={i}>
              <TimeInput type="time" value={time} onChange={e => updateTime(i, e.target.value)}
                aria-label={`Dose time ${i + 1}`} />
              <RemoveBtn type="button" aria-label={`Remove ${time}`}
                onClick={() => set({ scheduleTimes: values.scheduleTimes.filter((_, j) => j !== i) })}>
                <Icon name="x" size={14} strokeWidth={2} />
              </RemoveBtn>
            </TimePill>
          ))}
          <AddTimePill type="button" onClick={() => set({ scheduleTimes: [...values.scheduleTimes, '08:00'] })}>
            + Add time
          </AddTimePill>
        </Times>
      </Section>

      <Section aria-label="Nutrients per dose">
        <SectionHead><SectionLabel>Nutrients per dose</SectionLabel></SectionHead>
        <NutrientStrip $cols={DOSE_NUTRIENTS.length}>
          {DOSE_NUTRIENTS.map(n => {
            const ai = aiKeys.has(n.key);
            return (
              <Cell key={n.key} title={ai ? 'AI estimate — edit to override' : undefined}>
                <CellHead>{n.key === 'vitaminB12' ? n.short : n.label}</CellHead>
                <CellValue>
                  <CellInput
                    inputMode="decimal"
                    $ai={ai}
                    value={String(cf[n.key] ?? '')}
                    placeholder={detected[n.key] !== undefined ? String(detected[n.key]) : '—'}
                    aria-label={`${n.label}${n.unit ? ` (${n.unit})` : ''}${ai ? ', AI estimate' : ''}`}
                    onChange={e => setNutrient(n.key, e.target.value.replace(/[^\d.]/g, ''))}
                  />
                  <Unit>{n.unit}</Unit>
                </CellValue>
              </Cell>
            );
          })}
        </NutrientStrip>
        <FieldNote>
          Counted in your Meals log when you mark a dose taken. Leave blank to fill from the name and dosage, or by In-App AI.
          {anyAi && <> <em>Italic</em> values are AI estimates.</>}
        </FieldNote>
      </Section>

      <Section>
        <SectionHead>
          {showNotes
            ? <SectionLabel as="label" htmlFor={notesId}>Notes</SectionLabel>
            : <SectionLabel>Notes</SectionLabel>}
        </SectionHead>
        {showNotes ? (
          <BoxText id={notesId} value={values.notes} placeholder="e.g. Take with food"
            autoFocus={notesOpen && !values.notes}
            onChange={e => set({ notes: e.target.value })} />
        ) : (
          <AddLink type="button" onClick={() => setNotesOpen(true)}>+ Add notes</AddLink>
        )}
      </Section>

      <StatusCard>
        <div>
          <StatusTitle>Currently taking</StatusTitle>
          <StatusNote>
            {values.isActive
              ? 'Reminders are on and doses count toward your log'
              : 'Not taking it now — no reminders or doses'}
          </StatusNote>
        </div>
        <Toggle checked={values.isActive} aria-label="Currently taking" onChange={v => set({ isActive: v })} />
      </StatusCard>
    </FormWrap>
  );
}
