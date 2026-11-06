/*
 * Time tracking: sessions of time spent on an entry (a task, goal, milestone,
 * exercise session or a Time Tracking topic's activity). Kept together as one
 * master-key-encrypted setting (`timeLog`), never inside the entries, so a
 * timer started or stopped from anywhere can't collide with an entry open in
 * the editor. One timer runs at a time: starting another stops the first.
 * Pure — times are ISO strings, `now` is passed in.
 */

export interface TimeSession {
  id: string;
  entryId: number;
  /** ISO start */
  start: string;
  /** ISO end; null while it's running */
  end: string | null;
  /** Typed in by hand ("+ Add time") rather than timed */
  manual?: boolean;
}

/** The topic types an entry can track time on */
export const TIME_TRACKED_TYPES = new Set(['task', 'goal', 'milestone', 'exercise', 'routine', 'time_tracking']);

export const TIME_TRACKING_TOPIC = 'Time Tracking';

const ms = (iso: string) => new Date(iso).getTime();

export function runningSession(sessions: TimeSession[]): TimeSession | null {
  return sessions.find(s => s.end === null) ?? null;
}

export function sessionMs(s: TimeSession, now: Date): number {
  return Math.max(0, (s.end ? ms(s.end) : now.getTime()) - ms(s.start));
}

/** Starts timing an entry; whatever was running stops first */
export function startTimer(sessions: TimeSession[], entryId: number, now: Date, id: string): TimeSession[] {
  return [...stopTimer(sessions, now), { id, entryId, start: now.toISOString(), end: null }];
}

/** Stops the running timer; a run under a second is dropped (a double tap) */
export function stopTimer(sessions: TimeSession[], now: Date): TimeSession[] {
  return sessions.flatMap(s => {
    if (s.end !== null) return [s];
    if (now.getTime() - ms(s.start) < 1000) return [];
    return [{ ...s, end: now.toISOString() }];
  });
}

/** Time typed in by hand: `minutes` ending at the end of that day's work (noon if no time) */
export function addManualTime(sessions: TimeSession[], entryId: number, day: string, minutes: number, id: string): TimeSession[] {
  if (!(minutes > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return sessions;
  const start = new Date(`${day}T12:00:00`);
  const end = new Date(start.getTime() + minutes * 60_000);
  return [...sessions, { id, entryId, start: start.toISOString(), end: end.toISOString(), manual: true }];
}

export function removeSession(sessions: TimeSession[], id: string): TimeSession[] {
  return sessions.filter(s => s.id !== id);
}

/** An entry's sessions, newest first */
export function sessionsFor(sessions: TimeSession[], entryId: number): TimeSession[] {
  return sessions.filter(s => s.entryId === entryId).sort((a, b) => ms(b.start) - ms(a.start));
}

export function totalMs(sessions: TimeSession[], entryId: number, now: Date): number {
  return sessions.reduce((t, s) => (s.entryId === entryId ? t + sessionMs(s, now) : t), 0);
}

/** "2 h 05 min", "45 min", "0 min" */
export function formatSpent(msTotal: number): string {
  const minutes = Math.floor(msTotal / 60_000);
  if (minutes < 1) return '0 min';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

/** A running clock: "12:04", "1:02:09" */
export function formatClock(msTotal: number): string {
  const total = Math.floor(msTotal / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return h ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

/** Whole minutes, rounded (an exercise's Duration from its timed sessions) */
export function totalMinutes(sessions: TimeSession[], entryId: number, now: Date): number {
  return Math.round(totalMs(sessions, entryId, now) / 60_000);
}

/** Sessions of entries that no longer exist are dropped (a deleted task's time goes with it) */
export function pruneSessions(sessions: TimeSession[], entryIds: Set<number>): TimeSession[] {
  return sessions.filter(s => entryIds.has(s.entryId));
}

/** Only well-formed sessions from the stored setting */
export function parseSessions(raw: unknown): TimeSession[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is TimeSession => !!s && typeof s === 'object'
    && typeof (s as TimeSession).id === 'string'
    && typeof (s as TimeSession).entryId === 'number'
    && typeof (s as TimeSession).start === 'string' && !Number.isNaN(ms((s as TimeSession).start))
    && ((s as TimeSession).end === null || (typeof (s as TimeSession).end === 'string' && !Number.isNaN(ms((s as TimeSession).end as string)))));
}

/** A topic for tracking time to anything, under any of its usual names ("Time Tracking", "Timesheet", "Time log"…) */
export function isTimeTrackingTopic(name: string | undefined): boolean {
  if (!name) return false;
  return /^(time\s*(tracking|tracker|track|log|logs|sheet|sheets)|timesheets?|timers?)$/.test(name.trim().toLowerCase());
}

export type TimePeriod = 'today' | 'week' | 'month';

/** Where a period starts: today's midnight, 6 days before it, or the 1st of the month */
export function timePeriodStart(period: TimePeriod, now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') d.setDate(d.getDate() - 6);
  if (period === 'month') d.setDate(1);
  return d;
}

/** Time per entry within [from, now] — sessions that cross the start count only their part inside */
export function timeByEntry(sessions: TimeSession[], from: Date, now: Date): Map<number, number> {
  const out = new Map<number, number>();
  const lo = from.getTime();
  const hi = now.getTime();
  for (const s of sessions) {
    const a = Math.max(ms(s.start), lo);
    const b = Math.min(s.end ? ms(s.end) : hi, hi);
    if (b > a) out.set(s.entryId, (out.get(s.entryId) ?? 0) + (b - a));
  }
  return out;
}

/**
 * What a Start timer press saves when nothing has been typed yet, so the timer
 * never waits on a title: a dated name ("Timer · Nov 5, 9:04 AM") in the
 * entry's name field (or its text) and, for exercise, when it started.
 */
export function timerFill(customType: string | null, nameKey: string | undefined, now: Date): { content: string; fields: Record<string, unknown> } {
  const label = `Timer · ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  const fields: Record<string, unknown> = {};
  if (nameKey) fields[nameKey] = label;
  if (customType === 'exercise') {
    const pad = (n: number) => String(n).padStart(2, '0');
    fields.performedDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    fields.performedTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }
  return { content: `<p>${label}</p>`, fields };
}
