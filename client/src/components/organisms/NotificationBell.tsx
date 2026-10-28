import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { useTodayDoses } from '../../hooks/useTodayDoses.js';
import { useRoutineChecklist } from '../../hooks/useRoutineChecklist.js';
import { NAV_COMPACT_QUERY } from '../../styles/breakpoints.js';
import {
  dueReminders, clockLabel, relativeLabel, loadDismissed, saveDismissed,
  type DueItem, type ReminderEvent, type ReminderBill, type ReminderTask,
} from '../../utils/dueReminders.js';
import { useFinance } from '../../hooks/useFinance.js';
import { useSaveFields } from '../../hooks/useSaveFields.js';
import { useOpenInJournal } from '../../hooks/useOpenInJournal.js';
import { occurrencesBetween, repeatRuleOf } from '../../utils/recurrence.js';
import { billCounts, nextUnpaidDue, markBillPaid, formatCents, newId } from '../../utils/finance.js';
import { stripHtml, builtinEntryName } from '../../utils/stripHtml.js';
import type { FinanceRecord } from '../../types/finance.js';
import { toDateStr } from '../../utils/dateUtils.js';
import { Icon } from '../atoms/core/Icon.jsx';
import type { ScheduledDose } from '../../types/health.js';
import type { RoutineSlot } from '../../utils/routines.js';


type BillRecord = FinanceRecord<'bills'>;
/* The reminders bell (nav rail on desktop, the top bar on phones / tablets):
   a count of what's due — today's doses and exercise sessions whose time has
   come, meetings and events about to start, bills due or overdue, tasks due
   or overdue (dueReminders) — and a panel listing them, each with Take /
   Done / Paid / Open, 
   Done to tick it there, or × to dismiss it for today (Dismiss all across
   from "Due now", whose head is ruled above and below) — then the rest of
   today; × at the top closes it. Worked out on the device
   (dueReminders); nothing is sent anywhere. Only the bell for the current
   layout loads anything. */

const Panel = styled.div<{ $bar: boolean }>`
  position: fixed;
  z-index: 1200;
  width: min(380px, calc(100vw - 24px));
  max-height: min(560px, calc(100vh - 96px));
  overflow-y: auto;
  padding: 18px 20px 16px;
  background: var(--bg-tile);
  border: 1px solid var(--border-pop);
  border-radius: 14px;
  box-shadow: var(--shadow-xl);
  font-family: var(--font-sans);
  h2 { margin: 0 0 4px; font-size: 15px; font-weight: 400; color: var(--text-muted); }
  h3 { margin: 0; font-size: 13px; font-weight: 500; color: var(--text-soft); }
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 60px;
  padding: 12px 0;
  & + & { border-top: 1px solid var(--border-subtle); }
`;

const RowText = styled.div`
  flex: 1;
  min-width: 0;
  b { display: block; font-size: 15px; font-weight: 400; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  span { display: block; margin-top: 2px; font-size: 13px; color: var(--text-muted); }
`;

const TickBtn = styled.button`
  flex: none;
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--color-accent-line);
  border-radius: 999px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-accent-soft);
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: wait; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* × — hides a reminder for today without ticking it */
const DismissBtn = styled.button`
  flex: none;
  display: inline-flex;
  padding: 4px;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 4px; }
`;

/* "Reminders" with the close × across from it */
const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
  h2 { margin: 0; }
`;

const CloseBtn = styled.button`
  display: inline-flex;
  padding: 4px;
  margin-right: -4px;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 4px; }
`;

/* A section's head ("Due now", "Later today"): ruled above and below, with
   Dismiss all across from Due now */
const SectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;
  padding: 8px 0;
  margin-top: 10px;
  border-top: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
  button { padding: 0; border: none; background: none; font-family: var(--font-sans); font-size: 13px; font-weight: 500; color: var(--color-accent-link); cursor: pointer; }
  button:hover { text-decoration: underline; }
`;

const Empty = styled.p`
  margin: 10px 0 4px;
  font-size: 15px;
  color: var(--text-secondary);
`;

const Links = styled.div`
  display: flex;
  gap: 18px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  button { padding: 0; border: none; background: none; font: inherit; font-size: 14px; font-weight: 500; color: var(--color-accent-link); cursor: pointer; }
  button:hover { text-decoration: underline; }
`;

/* The count on the bell: a small accent disc */
export const BellBadge = styled.span`
  position: absolute;
  top: -5px;
  right: -8px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--on-accent, #fff);
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
`;

/* Phones / tablets: the bell in the top bar */
const BarBell = styled.button`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

export interface BellTriggerProps {
  ref: Ref<HTMLButtonElement>;
  onClick: () => void;
  'aria-expanded': boolean;
  'aria-haspopup': 'dialog';
  'aria-label': string;
  count: number;
}

type Source = ScheduledDose | RoutineSlot | ReminderEvent | (ReminderBill & { bill: BillRecord }) | (ReminderTask & { entryId: number });
type Item = DueItem<Source>;

const ICON: Record<Item['kind'], string> = {
  med: 'medication', exercise: 'self_improvement', event: 'event', meeting: 'groups', bill: 'receipt_long', task: 'checklist',
};
const ACTION: Partial<Record<Item['kind'], string>> = { med: 'Take', exercise: 'Done', task: 'Done', bill: 'Paid', event: 'Open', meeting: 'Open' };

export function NotificationBell({ variant, trigger }: { variant: 'rail' | 'bar'; trigger?: (p: BellTriggerProps) => ReactNode }) {
  const compact = useMediaQuery(NAV_COMPACT_QUERY);
  // One bell at a time: the rail's on wide screens, the top bar's on phones / tablets
  const active = variant === 'bar' ? compact : !compact;
  return active ? <Bell variant={variant} trigger={trigger} /> : null;
}

function Bell({ variant, trigger }: { variant: 'rail' | 'bar'; trigger?: (p: BellTriggerProps) => ReactNode }) {
  const navigate = useNavigate();
  const { isUnlocked } = useEncryption();
  const ff = useEntriesStore(s => s.featureFlags);
  const medsOn = ff.medicationEnabled !== false;
  const exerciseOn = ff.exerciseEnabled !== false;
  const doses = useTodayDoses(isUnlocked && medsOn);
  const schedule = useRoutineChecklist();
  const financeOn = ff.financeEnabled === true;
  const bills = useFinance('bills', { enabled: financeOn });
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const saveFields = useSaveFields();
  const openInJournal = useOpenInJournal();
  const [now, setNow] = useState(() => new Date());
  const [open, setOpen] = useState<{ left?: number; right?: number; top: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Dismissed today (per browser); a new day starts fresh
  const day = toDateStr(now);
  const [dismissed, setDismissed] = useState(() => loadDismissed(toDateStr(new Date())));
  useEffect(() => { setDismissed(loadDismissed(day)); }, [day]);
  const dismiss = (keys: string[]) => setDismissed(prev => {
    const next = new Set([...prev, ...keys]);
    saveDismissed(day, next);
    return next;
  });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // A minute's tick moves things from "later" to "due"
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  // Today's meetings and events (repeats placed on today), unfinished tasks with a deadline
  const today = toDateStr(now);
  const { events, tasks } = useMemo(() => {
    const idsOf = (...names: string[]) => new Set(allTopics.filter(t => names.includes(t.name.trim().toLowerCase())).map(t => t.id));
    const eventIds = idsOf('event', 'events');
    const meetingIds = idsOf('meeting', 'meetings');
    const taskIds = idsOf('task', 'tasks');
    const ev: ReminderEvent[] = [];
    const tk: (ReminderTask & { entryId: number })[] = [];
    for (const e of entries) {
      const meta = (e.metadata ?? {}) as Record<string, unknown>;
      const tid = meta._taxonomyId as number;
      const cf = (meta._customFields ?? {}) as Record<string, unknown>;
      const name = (builtinEntryName(cf) || stripHtml(e.content).trim()).slice(0, 80) || 'Untitled';
      if (eventIds.has(tid) || meetingIds.has(tid)) {
        if (!occurrencesBetween(String(cf.startDate ?? ''), repeatRuleOf(cf), today, today).length) continue;
        const kind = meetingIds.has(tid) ? 'meeting' : 'event';
        const time = cf.allDay ? null : (typeof cf.startTime === 'string' && cf.startTime) || null;
        const detail = [kind === 'meeting' ? 'Meeting' : 'Event', typeof cf.location === 'string' ? cf.location : ''].filter(Boolean).join(' · ');
        ev.push({ id: e.id, name, kind, time, detail });
      } else if (taskIds.has(tid) && !cf.isCompleted && typeof cf.deadline === 'string' && cf.deadline) {
        tk.push({ id: e.id, entryId: e.id, name, deadline: cf.deadline });
      }
    }
    return { events: ev, tasks: tk };
  }, [entries, allTopics, today]);
  const unpaid = useMemo(() => (financeOn ? bills.records : [])
    .filter(b => billCounts(b))
    .flatMap(b => {
      const due = nextUnpaidDue(b, today);
      return due ? [{ id: b.id, name: b.name, due, detail: formatCents(b.amountCents), bill: b }] : [];
    }), [bills.records, financeOn, today]);

  const all = isUnlocked
    ? dueReminders<ScheduledDose, RoutineSlot, ReminderEvent, ReminderBill & { bill: BillRecord }, ReminderTask & { entryId: number }>({
      doses: doses.loaded ? doses.scheduled : [], isTaken: doses.isTaken,
      slots: schedule.slots, isDone: schedule.isDone,
      events, bills: unpaid, tasks,
      now, meds: medsOn, exercise: exerciseOn,
    })
    : { due: [] as Item[], later: [] as Item[] };
  const due = all.due.filter(i => !dismissed.has(i.key));
  const later = all.later.filter(i => !dismissed.has(i.key));

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    if (variant === 'rail') setOpen({ left: r.right + 8, top: Math.max(8, Math.min(r.top, window.innerHeight - 420)) });
    else setOpen({ right: Math.max(12, window.innerWidth - r.right), top: r.bottom + 8 });
  };
  const close = () => setOpen(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !btnRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); btnRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const tick = async (item: Item) => {
    if (item.kind === 'event' || item.kind === 'meeting') { close(); openInJournal((item.source as ReminderEvent).id); return; }
    setBusy(item.key);
    try {
      if (item.kind === 'med') await doses.setTaken(item.source as ScheduledDose, true);
      else if (item.kind === 'exercise') await schedule.setDone(item.source as RoutineSlot, true);
      else if (item.kind === 'bill') {
        // Mark paid, as the Finance page's button does (for the next unpaid due date)
        const { bill } = item.source as ReminderBill & { bill: BillRecord };
        await bills.save(markBillPaid(bill, today, newId()));
      } else if (item.kind === 'task') {
        const entry = useEntriesStore.getState().decryptedEntries.find(e => e.id === (item.source as ReminderTask & { entryId: number }).entryId);
        if (entry) {
          const cf = ((entry.metadata as Record<string, unknown> | undefined)?._customFields ?? {}) as Record<string, unknown>;
          await saveFields(entry, { ...cf, isCompleted: true, isInProgress: false, isInReview: false });
        }
      }
    } finally {
      setBusy(null);
    }
  };

  const go = (path: string) => { close(); navigate(path); };
  const label = due.length ? `Reminders, ${due.length} due` : 'Reminders';
  const props: BellTriggerProps = {
    ref: btnRef, onClick: () => (open ? close() : place()), 'aria-expanded': !!open, 'aria-haspopup': 'dialog', 'aria-label': label, count: due.length,
  };

  const row = (item: Item, showTick: boolean) => (
    <Row key={item.key}>
      <MaterialIcon $size={22} aria-hidden="true" style={{ color: 'var(--text-muted)' }}>
        {ICON[item.kind]}
      </MaterialIcon>
      <RowText>
        <b>{item.name}</b>
        <span>{(item.note ? [item.note, item.detail] : [clockLabel(item.time), relativeLabel(item.at, now), item.detail]).filter(Boolean).join(' · ')}</span>
      </RowText>
      {showTick && (
        <TickBtn type="button" disabled={busy === item.key} onClick={() => void tick(item)}
          aria-label={`${ACTION[item.kind]}: ${item.name}${item.time ? ` at ${clockLabel(item.time)}` : ''}`}>
          {ACTION[item.kind]}
        </TickBtn>
      )}
      <DismissBtn type="button" title="Dismiss for today" aria-label={`Dismiss ${item.name}${item.time ? ` at ${clockLabel(item.time)}` : ''} for today`}
        onClick={() => dismiss([item.key])}>
        <Icon name="x" size={16} strokeWidth={2} />
      </DismissBtn>
    </Row>
  );

  return (
    <>
      {trigger ? trigger(props) : (
        <BarBell type="button" ref={btnRef} onClick={props.onClick} aria-expanded={!!open} aria-haspopup="dialog" aria-label={label} title="Reminders">
          <MaterialIcon $size={24} aria-hidden="true">notifications</MaterialIcon>
          {due.length > 0 && <BellBadge aria-hidden="true" style={{ top: 2, right: 0 }}>{due.length}</BellBadge>}
        </BarBell>
      )}
      {open && createPortal(
        <Panel ref={panelRef} $bar={variant === 'bar'} role="dialog" aria-label="Reminders"
          style={{ left: open.left, right: open.right, top: open.top }}>
          <Head>
            <h2>Reminders</h2>
            <CloseBtn type="button" aria-label="Close reminders" onClick={() => { close(); btnRef.current?.focus(); }}>
              <Icon name="x" size={18} strokeWidth={2} />
            </CloseBtn>
          </Head>
          {due.length === 0 && <Empty>You’re all caught up.</Empty>}
          {due.length > 0 && (<>
            <SectionHead>
              <h3>Due now</h3>
              {due.length > 1 && <button type="button" onClick={() => dismiss(due.map(i => i.key))}>Dismiss all</button>}
            </SectionHead>
            {due.map(i => row(i, true))}
          </>)}
          {later.length > 0 && (<><SectionHead><h3>Later today</h3></SectionHead>{later.map(i => row(i, true))}</>)}
          {due.length === 0 && later.length === 0 && <Empty style={{ color: 'var(--text-muted)', fontSize: 14 }}>Nothing else scheduled today.</Empty>}
          <Links>
            {medsOn && <button type="button" onClick={() => go('/health/meds')}>Med list</button>}
            {exerciseOn && <button type="button" onClick={() => go('/health/exercise/schedule')}>Exercise schedule</button>}
            <button type="button" onClick={() => go('/calendar')}>Calendar</button>
            {financeOn && <button type="button" onClick={() => go('/finance')}>Bills</button>}
          </Links>
        </Panel>,
        document.body,
      )}
    </>
  );
}
