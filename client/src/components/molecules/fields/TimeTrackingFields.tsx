import { useId } from 'react';
import { FormWrap, Section, SectionHead, SectionLabel, TitleInput, BoxText } from './formKit.js';

/* Time Tracking topic: an activity to track time to — "Writing the novel",
   "Client: Acme", "Piano practice". Its name as a big borderless title and
   Notes; the Time section (TimeTracker, added by EntryForm) holds the timer
   and its sessions. Props only. */

export interface TimeTrackingFieldValues {
  activityName: string;
  notes: string;
}

export function TimeTrackingFields({ values, onChange }: { values: TimeTrackingFieldValues; onChange: (values: TimeTrackingFieldValues) => void }) {
  const set = (patch: Partial<TimeTrackingFieldValues>) => onChange({ ...values, ...patch });
  const notesId = useId();
  return (
    <FormWrap>
      <TitleInput
        value={values.activityName}
        onChange={e => set({ activityName: e.target.value })}
        placeholder="What are you tracking time to?"
        aria-label="Activity"
      />
      <Section style={{ marginTop: 30 }}>
        <SectionHead><SectionLabel as="label" htmlFor={notesId}>Notes</SectionLabel></SectionHead>
        <BoxText id={notesId} value={values.notes} placeholder="What it's for, rates, anything to remember"
          onChange={e => set({ notes: e.target.value })} />
      </Section>
    </FormWrap>
  );
}
