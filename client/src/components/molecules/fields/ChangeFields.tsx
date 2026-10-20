import { useId } from 'react';
import {
  FormWrap, Section, SectionHead, SectionLabel, TitleInput, BoxInput, BoxText, FieldNote,
} from './formKit.js';

/* Changes topic (journal editor): something you changed that the app can't
   see for itself — "Cut out dairy", "New mattress", "Started physical
   therapy". What changed as a big borderless title, When it changed (blank =
   the day you write it) and Notes. Reports and Med history line these up
   against the data (utils/healthChanges). Medication changes are recorded on
   the medication itself. Props only. */

export interface ChangeFieldValues {
  changeWhat: string;
  /** YYYY-MM-DD; blank = the day it was written */
  changeDate: string;
  notes: string;
}

interface ChangeFieldsProps {
  values: ChangeFieldValues;
  onChange: (values: ChangeFieldValues) => void;
}

export function ChangeFields({ values, onChange }: ChangeFieldsProps) {
  const set = (patch: Partial<ChangeFieldValues>) => onChange({ ...values, ...patch });
  const dateId = useId();
  const notesId = useId();

  return (
    <FormWrap>
      <TitleInput
        value={values.changeWhat}
        onChange={e => set({ changeWhat: e.target.value })}
        placeholder="What changed? e.g. Cut out dairy"
        aria-label="What changed?"
      />

      <Section style={{ marginTop: 30 }} aria-label="When">
        <SectionHead><SectionLabel as="label" htmlFor={dateId}>When did it change?</SectionLabel></SectionHead>
        <BoxInput id={dateId} type="date" value={values.changeDate} onChange={e => set({ changeDate: e.target.value })} />
        <FieldNote>Leave it blank for the day you write it. Medication changes are recorded on the medication itself.</FieldNote>
      </Section>

      <Section>
        <SectionHead><SectionLabel as="label" htmlFor={notesId}>Notes</SectionLabel></SectionHead>
        <BoxText id={notesId} value={values.notes} placeholder="Why, or anything to remember about it"
          onChange={e => set({ notes: e.target.value })} />
      </Section>
    </FormWrap>
  );
}
