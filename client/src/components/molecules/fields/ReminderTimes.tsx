import styled from 'styled-components';
import { Icon } from '../../atoms/core/Icon.jsx';
import { formatTime12h } from '../../../utils/dateUtils.js';

/* Reminder times (medications, the exercise schedule): outlined time pills —
   the time (its native clock) and × — plus a dashed "+ Add time" pill; or,
   compact (exercise schedule), grey filled pills and "+ Time". Props only. */

const Times = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
`;

const TimePill = styled.div<{ $compact?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: ${({ $compact }) => ($compact ? '36px' : '42px')};
  padding: 0 10px 0 ${({ $compact }) => ($compact ? '14px' : '16px')};
  border: 1px solid ${({ $compact }) => ($compact ? 'transparent' : 'var(--border-card)')};
  border-radius: 999px;
  background: ${({ $compact }) => ($compact ? 'color-mix(in srgb, var(--text-muted) 14%, transparent)' : 'transparent')};
  input { font-size: ${({ $compact }) => ($compact ? '15px' : '16px')} !important; }
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

/* Compact: the time as "7:00 AM" text, the real time input invisible over it
   (a click opens its picker; typing still edits it) */
const TimeFace = styled.label`
  position: relative;
  display: inline-flex;
  align-items: center;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-primary);
  cursor: pointer;
  white-space: nowrap;
`;

const HiddenTime = styled.input`
  && {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    opacity: 0;
    cursor: pointer;
  }
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

const AddTimePill = styled.button<{ $compact?: boolean }>`
  height: ${({ $compact }) => ($compact ? '36px' : '42px')};
  padding: 0 ${({ $compact }) => ($compact ? '14px' : '18px')};
  border: 1px dashed var(--border-dashed);
  border-radius: 999px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: ${({ $compact }) => ($compact ? '15px' : '16px')};
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
  /** Grey filled pills and "+ Time" (exercise schedule) */
  compact?: boolean;
}

export function ReminderTimes({ times, onChange, label, addAt = '08:00', compact = false }: ReminderTimesProps) {
  const update = (index: number, time: string) => onChange(times.map((t, i) => (i === index ? time : t)));
  return (
    <Times>
      {times.map((time, i) => (
        <TimePill key={i} $compact={compact}>
          {compact ? (
            <TimeFace>
              {time ? formatTime12h(time) : 'Set time'}
              <HiddenTime type="time" value={time} onChange={e => update(i, e.target.value)} aria-label={`${label} ${i + 1}`}
                onClick={e => { try { e.currentTarget.showPicker?.(); } catch { /* not supported */ } }} />
            </TimeFace>
          ) : (
            <TimeInput type="time" value={time} onChange={e => update(i, e.target.value)}
              aria-label={`${label} ${i + 1}`} />
          )}
          <RemoveBtn type="button" aria-label={`Remove ${time}`}
            onClick={() => onChange(times.filter((_, j) => j !== i))}>
            <Icon name="x" size={14} strokeWidth={2} />
          </RemoveBtn>
        </TimePill>
      ))}
      <AddTimePill type="button" $compact={compact} onClick={() => onChange([...times, addAt])}>
        {compact ? '+ Time' : '+ Add time'}
      </AddTimePill>
    </Times>
  );
}
