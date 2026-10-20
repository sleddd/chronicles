import styled from 'styled-components';
import { PillButton } from '../atoms/PillButton.js';
import { DashPanel, DashPanelHead } from '../molecules/DashPanel.js';
import { useAsNeededDoses } from '../../hooks/useAsNeededDoses.js';
import type { DoseLogRecord } from '../../services/api.js';

/* As-needed medications (How often = As needed): one row each — the name and
   dosage, today's doses as time pills (× removes one logged by mistake) and
   Take one, which logs a dose now. Every take is its own dose record, so four
   aspirin in a day count four times in Med history and Reports. Used in the
   Health dashboard (a panel) and the home dashboard's Medications section
   (bare). */

const Row = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 0;
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
  &:first-child { border-top: none; padding-top: 4px; }
`;

const Info = styled.div`
  min-width: 0;
  flex: 1;
`;

const Name = styled.div`
  font-size: 16px;
  color: var(--text-secondary);
  small { margin-left: 8px; font-size: 14px; color: var(--text-muted); }
`;

const Taken = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-muted);
`;

const TimePill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 4px 0 11px;
  border: 1px solid var(--border-card);
  border-radius: 999px;
  color: var(--text-secondary);
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: none;
    font-size: 13px;
    color: var(--text-muted);
    cursor: pointer;
  }
  button:hover { color: var(--text-secondary); background: var(--bg-hover); }
`;

const Side = styled.div`
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  span { font-size: 13px; color: var(--text-muted); }
`;

const ErrorNote = styled.p`
  margin: 8px 0 0;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--color-danger);
`;

/** "14:05:31" → "2:05 PM" */
function timeLabel(log: DoseLogRecord): string {
  const [h, m] = log.scheduledTime.split(':').map(Number);
  if (Number.isNaN(h)) return log.takenAt ?? '';
  return new Date(2000, 0, 1, h, m || 0).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export type AsNeededState = ReturnType<typeof useAsNeededDoses>;

export function AsNeededList({ state }: { state: AsNeededState }) {
  const { meds, takenOf, take, remove, busy, error } = state;
  if (!meds.length) return null;
  return (
    <div>
      {meds.map(m => {
        const taken = takenOf(m.id);
        return (
          <Row key={m.id}>
            <Info>
              <Name>{m.name}{m.dosage && <small>{m.dosage}</small>}</Name>
              <Taken aria-label={`${m.name} doses today`}>
                {taken.length === 0 ? 'Not taken today' : taken.map(l => (
                  <TimePill key={l.id}>
                    {timeLabel(l)}
                    <button type="button" aria-label={`Remove the ${timeLabel(l)} dose of ${m.name}`} onClick={() => void remove(l.id)}>✕</button>
                  </TimePill>
                ))}
              </Taken>
            </Info>
            <Side>
              <PillButton type="button" disabled={busy === m.id} onClick={() => void take(m.id)} aria-label={`Take one ${m.name}`}>
                {busy === m.id ? 'Logging…' : 'Take one'}
              </PillButton>
              {taken.length > 0 && <span>{taken.length}× today</span>}
            </Side>
          </Row>
        );
      })}
      {error && <ErrorNote role="alert">{error}</ErrorNote>}
    </div>
  );
}

/** Health dashboard panel; nothing when there are no as-needed medications */
export function AsNeededMeds() {
  const state = useAsNeededDoses();
  if (!state.meds.length) return null;
  return (
    <DashPanel aria-label="As needed">
      <DashPanelHead title="As needed" />
      <AsNeededList state={state} />
    </DashPanel>
  );
}
