/* The bell's reminders, worked out on the device (nothing is sent anywhere):
   - due (counted on the badge): today's medication doses and exercise
     sessions whose time has come and that aren't ticked; meetings and events
     from 15 minutes before they start until an hour after; bills due today or
     overdue and not paid; tasks due today or overdue and not done
   - later today (not counted): the day's other doses, sessions and timed
     events, and all-day events
   Pure. */

export interface ReminderDose { medicationPostId: number; medicationName: string; dosage: string; time: string }
export interface ReminderSlot { key: string; time: string; routine: { id: number; name: string; minutes: number } }

export interface ReminderEvent { id: number; name: string; kind: 'event' | 'meeting'; /** HH:MM, or null for all day */ time: string | null; detail: string }
export interface ReminderBill { id: string; name: string; /** The next unpaid due date */ due: string; detail: string }
export interface ReminderTask { id: number; name: string; deadline: string }

export type ReminderKind = 'med' | 'exercise' | 'event' | 'meeting' | 'bill' | 'task';

/** How early a meeting or event starts showing as due, and how long it stays */
export const EVENT_LEAD_MIN = 15;
export const EVENT_LINGER_MIN = 60;

export interface DueItem<T = unknown> {
  key: string;
  kind: ReminderKind;
  name: string;
  /** "1,000 IU" / "30 min" */
  detail: string;
  /** HH:MM today */
  time: string;
  at: Date;
  /** Said instead of the time: "Due today", "Overdue · Oct 25", "All day" */
  note?: string;
  /** The dose / slot / event / bill / task itself, for acting on it */
  source: T;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shortDay = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const startOf = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};
/** "Due today" / "Overdue · Oct 25" */
const dueNote = (day: string, today: string) => (day === today ? 'Due today' : `Overdue · ${shortDay(day)}`);

const atToday = (hhmm: string, now: Date) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 0, m || 0);
};

export function dueReminders<D extends ReminderDose, S extends ReminderSlot, E extends ReminderEvent = ReminderEvent, B extends ReminderBill = ReminderBill, T extends ReminderTask = ReminderTask>(opts: {
  doses: D[];
  isTaken: (d: D) => boolean;
  slots: S[];
  isDone: (s: S) => boolean;
  /** Today's meetings and events (repeats already placed on today) */
  events?: E[];
  /** Unpaid bills with their next due date */
  bills?: B[];
  /** Unfinished tasks with a deadline */
  tasks?: T[];
  now: Date;
  meds?: boolean;
  exercise?: boolean;
}): { due: DueItem<D | S | E | B | T>[]; later: DueItem<D | S | E | B | T>[] } {
  const { now, meds = true, exercise = true } = opts;
  const today = ymd(now);
  type Any = DueItem<D | S | E | B | T>;
  const items: Any[] = [];
  const due: Any[] = [];
  const later: Any[] = [];
  if (meds) {
    for (const d of opts.doses) {
      if (opts.isTaken(d)) continue;
      const time = d.time.slice(0, 5);
      items.push({ key: `med-${d.medicationPostId}-${time}`, kind: 'med', name: d.medicationName, detail: d.dosage, time, at: atToday(time, now), source: d });
    }
  }
  if (exercise) {
    for (const s of opts.slots) {
      if (opts.isDone(s)) continue;
      items.push({
        key: `ex-${s.key}`, kind: 'exercise', name: s.routine.name, detail: s.routine.minutes ? `${s.routine.minutes} min` : '',
        time: s.time, at: atToday(s.time, now), source: s,
      });
    }
  }
  for (const i of items) (i.at <= now ? due : later).push(i);

  for (const e of opts.events ?? []) {
    if (!e.time) {
      later.push({ key: `${e.kind}-${e.id}-${today}`, kind: e.kind, name: e.name, detail: e.detail, time: '', at: startOf(today), note: 'All day', source: e });
      continue;
    }
    const time = e.time.slice(0, 5);
    const at = atToday(time, now);
    const mins = (now.getTime() - at.getTime()) / 60000;
    if (mins > EVENT_LINGER_MIN) continue; // over
    const item: Any = { key: `${e.kind}-${e.id}-${today}-${time}`, kind: e.kind, name: e.name, detail: e.detail, time, at, source: e };
    (mins >= -EVENT_LEAD_MIN ? due : later).push(item);
  }
  for (const b of opts.bills ?? []) {
    if (b.due > today) continue;
    due.push({ key: `bill-${b.id}-${b.due}`, kind: 'bill', name: b.name, detail: b.detail, time: '', at: startOf(b.due), note: dueNote(b.due, today), source: b });
  }
  for (const t of opts.tasks ?? []) {
    if (!t.deadline || t.deadline > today) continue;
    due.push({ key: `task-${t.id}-${t.deadline}`, kind: 'task', name: t.name, detail: '', time: '', at: startOf(t.deadline), note: dueNote(t.deadline, today), source: t });
  }

  const byTime = (a: DueItem, b: DueItem) => a.at.getTime() - b.at.getTime() || a.name.localeCompare(b.name);
  return { due: due.sort(byTime), later: later.sort(byTime) };
}

/** "8:00 AM" */
export function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return Number.isNaN(h) ? hhmm : `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "now" / "25 min ago" / "2 h ago" / "in 40 min" / "in 3 h" */
export function relativeLabel(at: Date, now: Date): string {
  const mins = Math.round((now.getTime() - at.getTime()) / 60000);
  const span = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 >= 30 ? ' 30' : ''}`);
  if (Math.abs(mins) < 1) return 'now';
  return mins > 0 ? `${span(mins)} ago` : `in ${span(-mins)}`;
}

/* Dismissed reminders: hidden for the rest of the day in this browser (not
   ticked), then everything starts fresh. A convenience, so localStorage. */
const DISMISSED_KEY = 'chronicles.reminders-dismissed-v1';

export function loadDismissed(day: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_KEY) || 'null') as { day?: string; keys?: unknown } | null;
    return raw?.day === day && Array.isArray(raw.keys) ? new Set(raw.keys.filter((k): k is string => typeof k === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export function saveDismissed(day: string, keys: Set<string>): void {
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify({ day, keys: [...keys] })); } catch { /* storage unavailable */ }
}

