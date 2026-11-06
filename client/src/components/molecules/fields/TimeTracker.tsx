import { useState } from 'react';
import styled from 'styled-components';
import { PillButton } from '../../atoms/PillButton.js';
import { MaterialIcon } from '../../atoms/MaterialIcon.js';
import { Icon } from '../../atoms/core/Icon.jsx';
import { Section, SectionHead, SectionLabel, TextAction, RowBox, DateTimeBox, DateTimeField } from './formKit.js';
import { formatClock, formatSpent, sessionMs, type TimeSession } from '../../../utils/timeTracking.js';
import { toDateStr } from '../../../utils/dateUtils.js';

/* An entry's Time section (tasks, goals, milestones, exercise, Time Tracking
   activities): the time so far as a big thin figure — a running clock while
   its timer runs — with Start timer / Stop beside it, the sessions under it
   (newest first, × each), and "+ Add time" for time not timed. Props only. */

const Top = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 20px;
  padding: 16px 18px;
`;

const Figure = styled.div<{ $running: boolean }>`
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  b {
    font-family: var(--font-display);
    font-size: 34px;
    font-weight: 300;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    color: ${({ $running }) => ($running ? 'var(--color-accent-soft)' : 'var(--text-primary)')};
  }
  span { font-family: var(--font-sans); font-size: 14px; color: var(--text-muted); }
`;

const Btns = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 28px;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 6px 10px 6px 18px;
  border-top: 1px solid var(--border-card);
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-secondary);
  small { margin-left: 8px; font-size: 13px; color: var(--text-muted); }
  .spent { color: var(--text-muted); font-variant-numeric: tabular-nums; }
`;

const Remove = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
`;

const Foot = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 18px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-card);
`;

const AddRow = styled.form`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-card);
  ${DateTimeBox} { flex: 1 1 260px; }
`;

const Note = styled.p`
  margin: 10px 0 0;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

const SHOWN = 5;

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export interface TimeTrackerProps {
  sessions: TimeSession[];
  totalMs: number;
  running: boolean;
  /** Another entry's timer is running (starting this one stops it) */
  otherRunning: boolean;
  now: Date;
  /** Not saved yet: there's nothing to track time against */
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
  onAdd: (day: string, minutes: number) => void;
  onRemove: (id: string) => void;
  /** Exercise: put the tracked minutes in its Duration */
  onUseAsDuration?: (minutes: number) => void;
  /** No "+ Add time" (the Quick entry, where the entry isn't saved yet) */
  noAdd?: boolean;
  /** A note under the box in place of the usual ones */
  note?: string;
}

export function TimeTracker({ sessions, totalMs, running, otherRunning, now, disabled, onStart, onStop, onAdd, onRemove, onUseAsDuration, noAdd, note }: TimeTrackerProps) {
  const [adding, setAdding] = useState(false);
  const [addDay, setAddDay] = useState(() => toDateStr(new Date()));
  const [addMinutes, setAddMinutes] = useState('');
  const [showAll, setShowAll] = useState(false);
  const current = running ? sessions.find(s => s.end === null) : undefined;
  const shown = showAll ? sessions : sessions.slice(0, SHOWN);
  const minutes = Math.round(totalMs / 60_000);

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const m = Math.round(Number(addMinutes));
    if (!(m > 0)) return;
    onAdd(addDay, m);
    setAddMinutes('');
    setAdding(false);
  };

  return (
    <Section aria-label="Time">
      <SectionHead>
        <SectionLabel>Time</SectionLabel>
        {sessions.length > 0 && <TextAction as="span" style={{ fontWeight: 400, color: 'var(--text-muted)', cursor: 'default' }}>
          {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
        </TextAction>}
      </SectionHead>
      <RowBox>
        <Top>
          <Figure $running={running} aria-live="off">
            {running && current
              ? <><b>{formatClock(sessionMs(current, now))}</b><span>{formatSpent(totalMs)} in all</span></>
              : <><b>{formatSpent(totalMs)}</b>{totalMs > 0 && <span>tracked</span>}</>}
          </Figure>
          <Btns>
            {running ? (
              <PillButton type="button" onClick={onStop}>
                <MaterialIcon $size={18} aria-hidden="true">stop</MaterialIcon> Stop
              </PillButton>
            ) : (
              <PillButton type="button" onClick={onStart} disabled={disabled}>
                <MaterialIcon $size={18} aria-hidden="true">play_arrow</MaterialIcon> Start timer
              </PillButton>
            )}
          </Btns>
        </Top>
        {shown.map(s => (
          <Row key={s.id}>
            <span>
              {day(s.start)} · {s.manual ? 'added by hand' : s.end ? `${time(s.start)} – ${time(s.end)}` : `${time(s.start)} – now`}
            </span>
            <span className="spent">{s.end === null ? formatClock(sessionMs(s, now)) : formatSpent(sessionMs(s, now))}</span>
            {s.end === null ? <span /> : (
              <Remove type="button" aria-label={`Remove the ${day(s.start)} session`} title="Remove" onClick={() => onRemove(s.id)}>
                <Icon name="x" size={14} strokeWidth={2} />
              </Remove>
            )}
          </Row>
        ))}
        {adding ? (
          <AddRow onSubmit={submitAdd}>
            <DateTimeBox>
              <DateTimeField type="date" aria-label="Day" value={addDay} onChange={e => setAddDay(e.target.value)} />
              <DateTimeField inputMode="numeric" aria-label="Minutes" placeholder="Minutes" value={addMinutes} autoFocus
                onChange={e => setAddMinutes(e.target.value.replace(/[^\d]/g, ''))}
                onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setAdding(false); } }} />
            </DateTimeBox>
            <PillButton type="submit" disabled={!(Number(addMinutes) > 0)}>Add</PillButton>
            <PillButton type="button" $variant="neutral" onClick={() => setAdding(false)}>Cancel</PillButton>
          </AddRow>
        ) : noAdd ? null : (
          <Foot>
            <TextAction type="button" disabled={disabled} onClick={() => setAdding(true)}>+ Add time</TextAction>
            {sessions.length > SHOWN && (
              <TextAction type="button" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show fewer' : `Show all ${sessions.length}`}</TextAction>
            )}
            {onUseAsDuration && minutes > 0 && (
              <TextAction type="button" onClick={() => onUseAsDuration(minutes)}>Use {minutes} min as the duration</TextAction>
            )}
          </Foot>
        )}
      </RowBox>
      {note ? <Note>{note}</Note> : disabled
        ? <Note>Save the entry to start tracking time on it.</Note>
        : otherRunning && !running && <Note>Another timer is running. Starting this one stops it.</Note>}
    </Section>
  );
}
