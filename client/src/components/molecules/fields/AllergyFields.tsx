import { useId } from 'react';
import type { AllergyFieldValues } from '../../../types/fields.js';
import {
  FormWrap, Section, SectionHead, SectionLabel, TitleInput, BoxInput, BoxText, DateTimeBox, DateTimeField,
} from './formKit.js';
import { SeveritySection } from './SymptomFields.js';
export type { AllergyFieldValues } from '../../../types/fields.js';

/* Allergy fields (journal editor): the allergen as a big borderless title, the
   shared 1–10 Severity scale, Reaction in an outlined box, When (date | time)
   and Notes. Props only. */

interface AllergyFieldsProps {
  values: AllergyFieldValues;
  onChange: (values: AllergyFieldValues) => void;
}

export function AllergyFields({ values, onChange }: AllergyFieldsProps) {
  const set = (patch: Partial<AllergyFieldValues>) => onChange({ ...values, ...patch });
  const reactionId = useId();
  const notesId = useId();

  return (
    <FormWrap>
      <TitleInput
        value={values.allergen}
        onChange={e => set({ allergen: e.target.value })}
        placeholder="e.g. Peanuts, Pollen, Dust"
        aria-label="Allergen"
      />

      <Section style={{ marginTop: 40 }} aria-label="Reaction">
        <SectionHead><SectionLabel as="label" htmlFor={reactionId}>Reaction</SectionLabel></SectionHead>
        <BoxInput id={reactionId} value={values.reaction} placeholder="e.g. Hives, Swelling, Difficulty breathing"
          onChange={e => set({ reaction: e.target.value })} />
      </Section>

      <SeveritySection value={values.severity} onChange={n => set({ severity: n })} />

      <Section aria-label="When">
        <SectionHead><SectionLabel>When</SectionLabel></SectionHead>
        <DateTimeBox>
          <DateTimeField type="date" value={values.occurredDate ?? ''} aria-label="Date"
            onChange={e => set({ occurredDate: e.target.value })} />
          <DateTimeField type="time" value={values.occurredTime ?? ''} aria-label="Time"
            onChange={e => set({ occurredTime: e.target.value })} />
        </DateTimeBox>
      </Section>

      <Section>
        <SectionHead><SectionLabel as="label" htmlFor={notesId}>Notes</SectionLabel></SectionHead>
        <BoxText id={notesId} value={values.notes} placeholder="Additional details"
          onChange={e => set({ notes: e.target.value })} />
      </Section>
    </FormWrap>
  );
}
