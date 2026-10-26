import { useState } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { Checkbox } from '../atoms/core/Checkbox.jsx';
import { Icon } from '../atoms/core/Icon.jsx';
import { AsNeededList } from './AsNeededMeds.js';
import { DashPanel } from '../molecules/DashPanel.js';
import { useAsNeededDoses } from '../../hooks/useAsNeededDoses.js';
import { useRoutineChecklist } from '../../hooks/useRoutineChecklist.js';
import type { RoutineSlot } from '../../utils/routines.js';
import { useTodayDoses } from '../../hooks/useTodayDoses.js';

/* Today's medications and exercise schedule as flat sections — the home
   dashboard's look, shared with the Health dashboard: a thin Work Sans title
   over a firmer rule with a link (Med list / Schedule) across, then one flat list by time —
   the standard checkmark (core Checkbox), the name, and the time or "Taken
   1:35 PM" / "Done 7:42 AM" on the right; as-needed medications under their
   own small heading. On the Health dashboard (`panel`) they sit in its
   --bg-panel card like the panels around them. */

const SectionHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 12px;
  padding-bottom: 12px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border-subtle);
  /* The Daily quote label's style, like every dashboard card title */
  h2 { margin: 0; font-family: var(--font-sans); font-size: 15px; font-weight: 400; line-height: 30px; color: var(--text-muted); }
  span { font-family: var(--font-sans); font-size: 13px; color: var(--text-muted); }
  button { padding: 0; border: none; background: none; font-family: var(--font-sans); font-size: 14px; font-weight: 500; color: var(--color-accent-link); cursor: pointer; }
  button:hover { text-decoration: underline; }
`;

/* Hairlines between rows only — none under the last one */
const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 52px;
  /* --border-faint: a lighter hairline in light theme, the same as before in dark */
  & + & { border-top: 1px solid var(--border-faint); }
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-secondary);
`;

const Muted = styled.p`
  margin: 14px 0 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

const ItemName = styled.span<{ $done: boolean }>`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({ $done }) => ($done ? 'var(--text-muted)' : 'var(--text-secondary)')};
  small { font-size: 16px; color: var(--text-muted); }
`;

const ItemWhen = styled.span`
  flex: none;
  font-size: 14px;
  color: var(--text-muted);
`;

/* ‹ Today › beside the Med list link — flips the schedule back a day at a time */
const DayNav = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  && span { min-width: 64px; text-align: center; font-size: 14px; color: var(--text-secondary); }
  && button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    color: var(--text-muted);
  }
  && button:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-row-hover); text-decoration: none; }
  && button:disabled { opacity: 0.35; cursor: default; }
`;

const HeadAside = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 16px;
`;

const AsNeededHead = styled.h3`
  margin: 28px 0 4px;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
`;

/** "Today", "Yesterday", else "Mon, Oct 19" */
function dayLabel(day: string, isToday: boolean): string {
  if (isToday) return 'Today';
  const d = new Date(`${day}T12:00:00`);
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function time12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export type TodayDoses = ReturnType<typeof useTodayDoses>;

interface MedicationsTodayProps {
  doses: TodayDoses;
  /** Render nothing when nothing is scheduled and no as-needed medication is active */
  hideWhenEmpty?: boolean;
  /** Inside a Health dashboard panel card */
  panel?: boolean;
}

export function MedicationsToday({ doses, hideWhenEmpty = false, panel = false }: MedicationsTodayProps) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState<string | null>(null);
  const asNeeded = useAsNeededDoses(doses.day);
  if (hideWhenEmpty && doses.total === 0 && asNeeded.meds.length === 0) return null;
  const Frame = panel ? DashPanel : 'section';
  return (
    <Frame aria-label="Medications">
      <SectionHead>
        <h2>Medications</h2>
        <HeadAside>
          <DayNav>
            <button type="button" aria-label="Previous day" title="Previous day" onClick={() => doses.shiftDay(-1)}>
              <Icon name="chevron-left" size={16} strokeWidth={2} />
            </button>
            <span aria-live="polite">{dayLabel(doses.day, doses.isToday)}</span>
            <button type="button" aria-label="Next day" title="Next day" disabled={doses.isToday} onClick={() => doses.shiftDay(1)}>
              <Icon name="chevron-right" size={16} strokeWidth={2} />
            </button>
          </DayNav>
          <button type="button" onClick={() => navigate('/health/meds')}>Med list</button>
        </HeadAside>
      </SectionHead>
      {doses.error && <Muted role="alert" style={{ color: 'var(--color-danger)' }}>{doses.error}</Muted>}
      {doses.total === 0 ? <Muted>No medications scheduled{doses.isToday ? ' today' : ''}.</Muted> : doses.scheduled.map((d, i) => {
        const key = `${d.medicationPostId}-${d.time}`;
        const taken = doses.isTaken(d);
        const log = doses.logOf(d);
        return (
          <Row key={`${key}-${i}`}>
            <Checkbox checked={taken} disabled={saving === key}
              aria-label={taken ? `Mark ${d.medicationName} as not taken` : `Mark ${d.medicationName} as taken`}
              onChange={async () => { setSaving(key); await doses.setTaken(d, !taken); setSaving(null); }} />
            <ItemName $done={taken}>{d.medicationName}{d.dosage ? ` ${d.dosage}` : ''}</ItemName>
            <ItemWhen>{taken && log?.takenAt ? `Taken ${log.takenAt}` : time12(d.time)}</ItemWhen>
          </Row>
        );
      })}
      {asNeeded.meds.length > 0 && (
        <>
          <AsNeededHead>As needed</AsNeededHead>
          <AsNeededList state={asNeeded} />
        </>
      )}
    </Frame>
  );
}

/** Today's exercise schedule (hooks/useRoutineChecklist) — ticking logs the session */
export function ExerciseToday({ panel = false }: { panel?: boolean }) {
  const navigate = useNavigate();
  const list = useRoutineChecklist();
  const Frame = panel ? DashPanel : 'section';
  return (
    <Frame aria-label="Exercise schedule">
      <SectionHead>
        <h2>Exercise schedule</h2>
        <button type="button" onClick={() => navigate('/health/exercise/schedule')}>Schedule</button>
      </SectionHead>
      {list.error && <Muted role="alert" style={{ color: 'var(--color-danger)' }}>{list.error}</Muted>}
      {list.total === 0 ? <Muted>Nothing scheduled today.</Muted> : list.slots.map(s => {
        const done = list.isDone(s);
        const items = list.doneItems(s);
        const at = list.doneAt(s);
        const when = done && at
          ? `Done ${new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
          : items.length ? `${items.length} of ${s.routine.items.length}` : time12(s.time);
        return (
          <Row key={s.key}>
            <Checkbox checked={done} disabled={list.busy === s.key}
              aria-label={done ? `Mark ${s.routine.name} not done` : `Mark ${s.routine.name} done`}
              onChange={() => void list.setDone(s, !done)} />
            <ItemName $done={done}>{s.routine.name}{s.routine.minutes ? <small> · {s.routine.minutes} min</small> : null}</ItemName>
            <ItemWhen>{when}</ItemWhen>
          </Row>
        );
      })}
    </Frame>
  );
}

/* Routine breakdown: a card per routine on today's schedule with two or more
   exercises — once, even when it's scheduled more than once today — its name
   (no time) over a light rule, then its exercises as a plain list to follow
   (name, and the amount on the right). Nothing shows when no routine qualifies. */
const Amount = styled.span`
  flex: none;
  font-size: 14px;
  color: var(--text-muted);
`;

export function RoutineBreakdown({ panel = false }: { panel?: boolean }) {
  const list = useRoutineChecklist();
  // One card per routine: its first session today
  const byRoutine = new Map<number, RoutineSlot>();
  for (const s of list.slots) {
    if (s.routine.items.length >= 2 && !byRoutine.has(s.routine.id)) byRoutine.set(s.routine.id, s);
  }
  const routines = [...byRoutine.values()];
  const Frame = panel ? DashPanel : 'section';
  if (routines.length === 0) return null;
  return (
    <>
      {routines.map(s => (
        <Frame key={s.routine.id} aria-label={s.routine.name}>
          <SectionHead>
            <h2>{s.routine.name}</h2>
          </SectionHead>
          {s.routine.items.map(it => (
            <Row key={it.id}>
              <ItemName $done={false}>{it.name}</ItemName>
              {it.amount && <Amount>{it.amount}</Amount>}
            </Row>
          ))}
        </Frame>
      ))}
    </>
  );
}
