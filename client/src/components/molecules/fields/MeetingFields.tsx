import { MeetingFieldsLayout } from './EventFields.js';
import type { MeetingFieldValues } from '../../../types/fields.js';
export type { MeetingFieldValues } from '../../../types/fields.js';

/* Meeting fields: the event layout (title, When, Where, Notes, calendar sync)
   plus an About box with the meeting's topic and attendees — see EventFields. */

interface MeetingFieldsProps {
  values: MeetingFieldValues;
  onChange: (values: MeetingFieldValues) => void;
  /** Show the "Sync to calendar" card (when calendar sync is enabled). */
  showCalendarSync?: boolean;
}

export function MeetingFields(props: MeetingFieldsProps) {
  return <MeetingFieldsLayout {...props} />;
}
