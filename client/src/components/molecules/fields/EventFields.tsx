import styled from 'styled-components';
import { Icon } from '../../atoms/core/Icon.jsx';
import { MaterialIcon } from '../../atoms/MaterialIcon.js';
import { Toggle } from '../../atoms/Toggle.js';
import type { EventFieldValues, MeetingFieldValues } from '../../../types/fields.js';
export type { EventFieldValues } from '../../../types/fields.js';

/* Event and meeting fields in the journal editor (and Quick Entry): the name as
   a big borderless title; meetings add an About box (topic, attendees);
   When — Starts / Ends rows of date | time in one outlined box, with an All day
   switch that drops the times; Where — venue, address and phone rows with
   icons in one outlined box; Notes in an outlined box; and a "Sync to
   calendar" card with a switch. Sentence-case section labels. Props only. */

/* Margins, not gaps: the journal editor zeroes gaps on its field wrappers */
const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
`;

const Section = styled.section`
  display: flex;
  flex-direction: column;
  margin-top: 40px;
`;

const NameInput = styled.input`
  && {
    width: 100%;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-display);
    font-size: 38px;
    font-weight: 300;
    line-height: 1.2;
    color: var(--text-primary);
  }
  &::placeholder { color: var(--text-hint); }
`;

const SectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
`;

const SectionLabel = styled.h3`
  margin: 0;
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: 500;
  color: var(--text-soft);
`;

const AllDay = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 12px;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-soft);
`;

/* One outlined box of rows split by rules */
const Box = styled.div`
  border: 1px solid var(--border-card);
  border-radius: 10px;
  overflow: hidden;
  & > * + * { border-top: 1px solid var(--border-card); }
`;

/* When rows: "Starts" | date | time */
const WhenRow = styled.div<{ $allDay: boolean }>`
  display: grid;
  grid-template-columns: 84px minmax(0, 1.5fr) ${({ $allDay }) => ($allDay ? '' : 'minmax(0, 1fr)')};
  align-items: stretch;
  @media (max-width: 560px) { grid-template-columns: 64px minmax(0, 1fr) ${({ $allDay }) => ($allDay ? '' : 'minmax(0, 1fr)')}; }
`;

const RowLabel = styled.span`
  display: flex;
  align-items: center;
  padding-left: 16px;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

const DateTimeInput = styled.input`
  && {
    width: 100%;
    min-width: 0;
    height: 48px;
    padding: 0 16px;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 16px;
    color: var(--text-secondary);
    color-scheme: light dark;
  }
  &&:focus { box-shadow: inset 0 0 0 1px var(--color-accent); }
  /* The native picker icon in the muted grey */
  &::-webkit-calendar-picker-indicator { opacity: 0.55; cursor: pointer; }
`;

const TimeCell = styled.div`
  border-left: 1px solid var(--border-card);
`;

/* Where / About rows: icon + borderless input */
const IconRow = styled.label`
  display: flex;
  align-items: center;
  gap: 16px;
  height: 50px;
  padding: 0 16px;
  color: var(--text-muted);
  cursor: text;
  &:focus-within { box-shadow: inset 0 0 0 1px var(--color-accent); }
`;

const RowInput = styled.input`
  && {
    flex: 1;
    min-width: 0;
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

const NotesBox = styled.textarea`
  && {
    width: 100%;
    min-height: 112px;
    padding: 14px 16px;
    border: 1px solid var(--border-card) !important;
    border-radius: 10px;
    background: transparent !important;
    font-family: var(--font-sans);
    font-size: 16px;
    line-height: 1.5;
    color: var(--text-secondary);
    resize: vertical;
    outline: none;
  }
  &&:focus { border-color: var(--color-accent) !important; }
  &::placeholder { color: var(--text-hint); }
`;

/* "Sync to calendar" card: title + note on the left, switch on the right */
const SyncCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 36px;
  padding: 16px 18px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
`;

const SyncTitle = styled.div`
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-secondary);
`;

const SyncNote = styled.div`
  margin-top: 4px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

type EventLike = EventFieldValues | MeetingFieldValues;

interface EventLikeFieldsProps<V extends EventLike> {
  kind: 'event' | 'meeting';
  values: V;
  onChange: (values: V) => void;
  showCalendarSync?: boolean;
}

function EventLikeFields<V extends EventLike>({ kind, values, onChange, showCalendarSync }: EventLikeFieldsProps<V>) {
  const set = (patch: Partial<EventLike>) => onChange({ ...values, ...patch } as V);
  const isMeeting = kind === 'meeting';
  const nameKey = isMeeting ? 'meetingName' : 'eventName';
  const name = ((values as unknown as Record<string, unknown>)[nameKey] as string | undefined) ?? '';
  const allDay = !!values.allDay;
  const meeting = values as MeetingFieldValues;

  return (
    <Wrapper>
      <NameInput
        value={name}
        onChange={e => set({ [nameKey]: e.target.value } as Partial<EventLike>)}
        placeholder={isMeeting ? 'What is the meeting?' : 'What is the event?'}
        aria-label={isMeeting ? 'Meeting name' : 'Event name'}
      />

      {isMeeting && (
        <Section aria-label="About">
          <SectionHead><SectionLabel>About</SectionLabel></SectionHead>
          <Box>
            <IconRow>
              <Icon name="tag" size={18} strokeWidth={1.8} aria-hidden="true" />
              <RowInput value={meeting.meetingTopic ?? ''} onChange={e => set({ meetingTopic: e.target.value } as Partial<EventLike>)}
                placeholder="What is the meeting about?" aria-label="Topic" />
            </IconRow>
            <IconRow>
              <Icon name="user" size={18} strokeWidth={1.8} aria-hidden="true" />
              <RowInput value={meeting.attendees ?? ''} onChange={e => set({ attendees: e.target.value } as Partial<EventLike>)}
                placeholder="Attendees — comma-separated names" aria-label="Attendees" />
            </IconRow>
          </Box>
        </Section>
      )}

      <Section aria-label="When">
        <SectionHead>
          <SectionLabel>When</SectionLabel>
          <AllDay>
            All day
            <Toggle
              checked={allDay}
              aria-label="All day"
              // All day drops the times; turning it off brings the time boxes back empty
              onChange={v => set(v ? { allDay: true, startTime: '', endTime: '' } : { allDay: false })}
            />
          </AllDay>
        </SectionHead>
        <Box>
          <WhenRow $allDay={allDay}>
            <RowLabel>Starts</RowLabel>
            <DateTimeInput type="date" value={values.startDate} onChange={e => set({ startDate: e.target.value })} aria-label="Start date" />
            {!allDay && (
              <TimeCell>
                <DateTimeInput type="time" value={values.startTime} onChange={e => set({ startTime: e.target.value })} aria-label="Start time" />
              </TimeCell>
            )}
          </WhenRow>
          <WhenRow $allDay={allDay}>
            <RowLabel>Ends</RowLabel>
            <DateTimeInput type="date" value={values.endDate} onChange={e => set({ endDate: e.target.value })} aria-label="End date" />
            {!allDay && (
              <TimeCell>
                <DateTimeInput type="time" value={values.endTime} onChange={e => set({ endTime: e.target.value })} aria-label="End time" />
              </TimeCell>
            )}
          </WhenRow>
        </Box>
      </Section>

      <Section aria-label="Where">
        <SectionHead><SectionLabel>Where</SectionLabel></SectionHead>
        <Box>
          <IconRow>
            <Icon name="map-pin" size={18} strokeWidth={1.8} aria-hidden="true" />
            <RowInput value={values.location} onChange={e => set({ location: e.target.value })} placeholder="Venue name" aria-label="Venue name" />
          </IconRow>
          <IconRow>
            <MaterialIcon $size={20} aria-hidden="true">home</MaterialIcon>
            <RowInput value={values.address} onChange={e => set({ address: e.target.value })} placeholder="Full address" aria-label="Full address" />
          </IconRow>
          <IconRow>
            <MaterialIcon $size={20} aria-hidden="true">call</MaterialIcon>
            <RowInput type="tel" value={values.phone} onChange={e => set({ phone: e.target.value })} placeholder="Contact number" aria-label="Contact number" />
          </IconRow>
        </Box>
      </Section>

      <Section>
        <SectionHead><SectionLabel as="label" htmlFor={`${kind}-notes`}>Notes</SectionLabel></SectionHead>
        <NotesBox id={`${kind}-notes`} value={values.notes} onChange={e => set({ notes: e.target.value })} placeholder="Additional details" />
      </Section>

      {showCalendarSync && (
        <SyncCard>
          <div>
            <SyncTitle>Sync to calendar</SyncTitle>
            <SyncNote>
              {values.noCalendarSync
                ? `This ${kind} stays out of your calendar`
                : `This ${kind} will appear in your calendar`}
            </SyncNote>
          </div>
          <Toggle checked={!values.noCalendarSync} aria-label="Sync to calendar"
            onChange={v => set({ noCalendarSync: !v })} />
        </SyncCard>
      )}
    </Wrapper>
  );
}

interface EventFieldsProps {
  values: EventFieldValues;
  onChange: (values: EventFieldValues) => void;
  /** Show the "Sync to calendar" card (when calendar sync is enabled). */
  showCalendarSync?: boolean;
}

export function EventFields(props: EventFieldsProps) {
  return <EventLikeFields kind="event" {...props} />;
}

interface MeetingFieldsProps {
  values: MeetingFieldValues;
  onChange: (values: MeetingFieldValues) => void;
  showCalendarSync?: boolean;
}

export function MeetingFieldsLayout(props: MeetingFieldsProps) {
  return <EventLikeFields kind="meeting" {...props} />;
}
