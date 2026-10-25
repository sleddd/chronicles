import styled from 'styled-components';
import { Icon } from '../../atoms/core/Icon.jsx';

/* Reminder times (medications, exercise routines): outlined time pills — the
   time (its native clock) and × — plus a dashed "+ Add time" pill. Props only. */

const Times = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
`;

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

interface ReminderTimesProps {
  times: string[];
  onChange: (times: string[]) => void;
  /** "Dose time" → aria-label "Dose time 1" */
  label: string;
  /** The time a new pill starts at */
  addAt?: string;
}

export function ReminderTimes({ times, onChange, label, addAt = '08:00' }: ReminderTimesProps) {
  const update = (index: number, time: string) => onChange(times.map((t, i) => (i === index ? time : t)));
  return (
    <Times>
      {times.map((time, i) => (
        <TimePill key={i}>
          <TimeInput type="time" value={time} onChange={e => update(i, e.target.value)}
            aria-label={`${label} ${i + 1}`} />
          <RemoveBtn type="button" aria-label={`Remove ${time}`}
            onClick={() => onChange(times.filter((_, j) => j !== i))}>
            <Icon name="x" size={14} strokeWidth={2} />
          </RemoveBtn>
        </TimePill>
      ))}
      <AddTimePill type="button" onClick={() => onChange([...times, addAt])}>
        + Add time
      </AddTimePill>
    </Times>
  );
}
