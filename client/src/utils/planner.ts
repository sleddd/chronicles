/* The week / day planner: tasks put on a day (`scheduledDate`, YYYY-MM-DD) and, when they
   have one, a time on it (`scheduledTime`), each as long as its same-day end time, its own
   length or its estimate says (`hoursOf`). A task with no planned day but a deadline AND a time
   of day chosen shows on its deadline's day (`plannedDay`). An unfinished task set to
   auto-migrate ("Move to tomorrow if unfinished") whose day has passed shows under today —
   worked out when read, nothing is rewritten. Without it the task stays on its day and is listed
   as overdue. The order within a day is the sealed setting `plannerOrder` (day → task ids, top
   first). The parts of a day (Morning / Noon / Night, `scheduledPart` / `scheduledPartEnd`) are
   from the planner's earlier rows: the older task form still sets them and `plannedDay` reads
   them, but the planner itself lays tasks out by the hour. Pure. */

import { addDays, dayOf, dayNumber } from './planTimeline.js';
import { taskStatusOf } from '../types/goals.js';

export { addDays };

/** The parts of a day a task can be planned for (no hours) */
export type DayPart = 'morning' | 'noon' | 'night';

/* `hours` says when each part is */
export const DAY_PARTS: { value: DayPart; label: string; hours: string }[] = [
  { value: 'morning', label: 'Morning', hours: 'Before 12 PM' },
  { value: 'noon', label: 'Noon', hours: '12 – 5 PM' },
  { value: 'night', label: 'Night', hours: 'After 5 PM' },
];

/** There is no "any time" part: a task on a day with no part chosen counts as Morning */
export const DEFAULT_PART: DayPart = 'morning';

/** A task's part of the day from its fields (Morning when none was chosen) */
export const partOf = (cf: Record<string, unknown> | undefined): DayPart =>
  (DAY_PARTS.some(p => p.value === cf?.scheduledPart) ? cf!.scheduledPart as DayPart : DEFAULT_PART);

/** The time of day the task itself names ('' when none was chosen) */
export const chosenPart = (cf: Record<string, unknown> | undefined): DayPart | '' =>
  (DAY_PARTS.some(p => p.value === cf?.scheduledPart) ? cf!.scheduledPart as DayPart : '');

const partIndex = (p: DayPart): number => DAY_PARTS.findIndex(x => x.value === p);

/** The last part of the day a task covers: its `scheduledPartEnd` when that is its part or a later one, else its part */
export function partEndOf(cf: Record<string, unknown> | undefined): DayPart {
  const start = partOf(cf);
  const end = DAY_PARTS.find(p => p.value === cf?.scheduledPartEnd)?.value;
  return end && partIndex(end) >= partIndex(start) ? end : start;
}

/** The parts from `start` through `end` (just `start` when `end` is missing or earlier) */
export function partsCovered(start: DayPart, end?: DayPart | ''): DayPart[] {
  const a = partIndex(start);
  const b = end ? Math.max(a, partIndex(end)) : a;
  return DAY_PARTS.slice(a, b + 1).map(p => p.value);
}

/**
 * The day a task is planned for: the one it was given ("Planned for"), else
 * its deadline once a time of day was chosen for it — a deadline with
 * "Morning" is something to do that morning. A bare deadline plans nothing.
 */
export function plannedDay(cf: Record<string, unknown> | undefined): string {
  return dayOf(cf?.scheduledDate) || (chosenPart(cf) ? dayOf(cf?.deadline) : '');
}

export interface PlannerTask {
  id: number;
  /** '' = not on a day */
  scheduled: string;
  /** Where in that day ('' only when it has no day) */
  part?: DayPart | '';
  /** The last part of the day it covers (its part, unless it was stretched) */
  partEnd?: DayPart | '';
  /** On its day through its deadline and time of day, not a "Planned for" day */
  fromDeadline?: boolean;
  done: boolean;
  /** An idea kept for later (the "Idea / Backlog" status): listed in Unscheduled's own Ideas / Backlog group */
  backlog?: boolean;
  autoMigrate: boolean;
  /** YYYY-MM-DD or '' */
  deadline: string;
  priority: string;
  created: number;
  /** How long it takes, in hours (its length on the planner's day) */
  hours: number;
  /** A time it was dragged to on its day (minutes from midnight, `scheduledTime`); none = it follows the day's order */
  at?: number;
}

/** A task's own time on its day (`scheduledTime`, "HH:MM"), in minutes from midnight */
export function timeOf(cf: Record<string, unknown> | undefined): number | undefined {
  const v = cf?.scheduledTime;
  if (typeof v !== 'string') return undefined;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return undefined;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return mins >= 0 && mins < 24 * 60 ? mins : undefined;
}

/** Minutes from midnight as "HH:MM" */
export function hhmm(mins: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** A task's length on the planner: five-minute steps from five minutes to twelve hours */
export const MIN_HOURS = 5 / 60;
export const MAX_HOURS = 12;
export const DEFAULT_HOURS = 1;
/** A same-day end time (the task's Ends time on its planned day, after its start), in minutes */
export function sameDayEnd(cf: Record<string, unknown> | undefined): number | undefined {
  const start = timeOf(cf);
  const v = cf?.deadlineTime;
  if (start === undefined || typeof v !== 'string') return undefined;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return undefined;
  const end = Number(m[1]) * 60 + Number(m[2]);
  const deadline = typeof cf?.deadline === 'string' ? cf.deadline : '';
  const day = typeof cf?.scheduledDate === 'string' ? cf.scheduledDate : '';
  if (deadline && day && deadline !== day) return undefined;
  return end > start ? end : undefined;
}

/** A task's length in hours: from its start to a same-day end time when it has one (to the
 *  minute — 4:10 to 4:15 is 5 minutes), else its own length (five-minute steps), else its estimate
 *  when that fits in a day's block, else an hour */
export function hoursOf(cf: Record<string, unknown> | undefined): number {
  const end = sameDayEnd(cf);
  if (end !== undefined) return Math.min(MAX_HOURS, (end - timeOf(cf)!) / 60);
  const n = typeof cf?.scheduledHours === 'number' ? cf.scheduledHours : Number(cf?.scheduledHours);
  if (Number.isFinite(n) && n > 0) return clampHours(n);
  // No length of its own yet: its estimate. One longer than a block can be ("2 days") is work
  // for several sittings, not one twelve-hour card: it starts at the default like any other task
  const est = estimateOf(cf);
  return est && est <= MAX_HOURS * 60 ? clampHours(est / 60) : DEFAULT_HOURS;
}

/* ── Estimated time: how long a task is expected to take (`estimatedMinutes`) ── */

/** A task's estimate in minutes, or undefined when it has none (anything odd is ignored) */
export function estimateOf(cf: Record<string, unknown> | undefined): number | undefined {
  const n = typeof cf?.estimatedMinutes === 'number' ? cf.estimatedMinutes : Number(cf?.estimatedMinutes);
  return Number.isFinite(n) && n > 0 && n <= 7 * 24 * 60 ? Math.round(n) : undefined;
}

/** An estimate as words: "15 min", "1 h 30 min", "6 h", "2 days" (a day = 8 working hours) */
export function estimateLabel(minutes: number): string {
  if (minutes >= 16 * 60 && minutes % (8 * 60) === 0) return `${minutes / (8 * 60)} days`;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
/**
 * A typed estimate in minutes: "45" or "45 min", "1.5 h", "1 h 30 min", "1h30", "1:30",
 * "2 days" (a day = 8 working hours, as estimateLabel shows it). A bare number is minutes.
 * '' → null (no estimate); anything it can't read, or over a week → undefined.
 */
export function parseEstimate(text: string): number | null | undefined {
  const t = text.trim().toLowerCase();
  if (!t || t === 'none') return null;
  const clock = /^(\d+):([0-5]\d)$/.exec(t);
  let total = 0;
  if (clock) total = Number(clock[1]) * 60 + Number(clock[2]);
  else {
    const re = /(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m)?\s*/gy;
    let m: RegExpExecArray | null;
    let read = 0;
    while (read < t.length && (m = re.exec(t))) {
      if (!m[0]) break;
      const n = Number(m[1]);
      const unit = m[2] ?? '';
      if (unit.startsWith('d')) total += n * 8 * 60;
      else if (unit.startsWith('h')) total += n * 60;
      else if (unit.startsWith('m')) total += n;
      // "1h30": a bare number after hours is minutes; on its own it is minutes too
      else total += n;
      read = re.lastIndex;
    }
    if (read !== t.length) return undefined;
  }
  const minutes = Math.round(total);
  return minutes > 0 && minutes <= 7 * 24 * 60 ? minutes : undefined;
}

/** The fields after moving a task's start to `start` (minutes), its same-day end time moved with it */
export function startPatch(cf: Record<string, unknown>, start: number): Record<string, unknown> {
  const end = sameDayEnd(cf);
  const old = timeOf(cf);
  const out: Record<string, unknown> = { ...cf, scheduledTime: hhmm(start) };
  if (end !== undefined && old !== undefined) out.deadlineTime = hhmm(Math.min(24 * 60 - 1, start + (end - old)));
  return out;
}
/**
 * The fields after moving a task to another day. An end time on its old day is its length
 * (4:10 to 4:15 is five minutes), so that end date moves with it; a deadline on any other day stays.
 */
export function dayPatch(cf: Record<string, unknown>, day: string): Record<string, unknown> {
  const out: Record<string, unknown> = { ...cf, scheduledDate: day };
  if (day && sameDayEnd(cf) !== undefined && cf.deadline && cf.deadline === cf.scheduledDate) out.deadline = day;
  return out;
}
/** The fields after giving a task `hours`: its same-day end time follows, when it has one */
export function lengthPatch(cf: Record<string, unknown>, hours: number): Record<string, unknown> {
  const start = timeOf(cf);
  const out: Record<string, unknown> = { ...cf, scheduledHours: clampHours(hours) };
  if (sameDayEnd(cf) !== undefined && start !== undefined) out.deadlineTime = hhmm(Math.min(24 * 60 - 1, start + Math.round(hours * 60)));
  return out;
}

/** Whether two lengths (hours) are the same to the minute. Lengths are kept in hours, so five
 *  minutes is a repeating fraction — compare with this, never `===` */
export const sameLength = (a: number, b: number): boolean => Math.round(a * 60) === Math.round(b * 60);

/** Rounded to five minutes and kept in range */
export const clampHours = (h: number): number => Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.round(h * 12) / 12));

/** "30 min", "1 h", "1 h 30" */
export function hoursLabel(h: number): string {
  const mins = Math.round(h * 60);
  if (mins < 60) return `${mins} min`;
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return mm ? `${hh} h ${String(mm).padStart(2, '0')}` : `${hh} h`;
}

/** A task's planner facts from its custom fields */
export function plannerFacts(id: number, cf: Record<string, unknown> | undefined, created: number): PlannerTask {
  const scheduled = plannedDay(cf);
  return {
    id, created,
    scheduled,
    part: scheduled ? partOf(cf) : '',
    partEnd: scheduled ? partEndOf(cf) : '',
    fromDeadline: !!scheduled && !dayOf(cf?.scheduledDate),
    done: !!cf?.isCompleted,
    backlog: !!cf && taskStatusOf(cf) === 'backlog',
    autoMigrate: !!cf?.isAutoMigrating,
    deadline: dayOf(cf?.deadline),
    priority: typeof cf?.priority === 'string' ? cf.priority : 'none',
    hours: hoursOf(cf),
    at: scheduled ? timeOf(cf) : undefined,
  };
}

/** The day a task shows on: its own, or today once an unfinished auto-migrating one has slipped. '' = none */
export function effectiveDay(t: Pick<PlannerTask, 'scheduled' | 'done' | 'autoMigrate'>, today: string): string {
  if (!t.scheduled) return '';
  return !t.done && t.autoMigrate && t.scheduled < today ? today : t.scheduled;
}

/** True when the task shows under today because it rolled forward */
export const hasMigrated = (t: Pick<PlannerTask, 'scheduled' | 'done' | 'autoMigrate'>, today: string): boolean =>
  !!t.scheduled && effectiveDay(t, today) !== t.scheduled;

/** The Sunday–Saturday week holding `day` */
export function weekOf(day: string): string[] {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  const sunday = addDays(day, -dow);
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

export type PlannerOrder = Record<string, number[]>;

/** The saved order, well-formed (it is user data from the server) */
export function parsePlannerOrder(raw: unknown): PlannerOrder {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: PlannerOrder = {};
  for (const [day, ids] of Object.entries(raw as Record<string, unknown>)) {
    if (dayOf(day) !== day || !Array.isArray(ids)) continue;
    const list = ids.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    if (list.length) out[day] = list;
  }
  return out;
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const rank = (p: string) => PRIORITY_RANK[p] ?? 4;
/** Soonest deadline first (none last), then priority, then newest */
const byUrgency = (a: PlannerTask, b: PlannerTask) =>
  (a.deadline ? 0 : 1) - (b.deadline ? 0 : 1) || a.deadline.localeCompare(b.deadline) || rank(a.priority) - rank(b.priority) || b.created - a.created;

/** Priority first (Urgent, High, Medium, Low, none), then the soonest deadline, then newest */
const byPriority = (a: PlannerTask, b: PlannerTask) =>
  rank(a.priority) - rank(b.priority) || (a.deadline ? 0 : 1) - (b.deadline ? 0 : 1) || a.deadline.localeCompare(b.deadline) || b.created - a.created;

/** Where a task lands in a day's list by its priority: before the first task of a lower priority */
export function priorityIndex(list: Pick<PlannerTask, 'priority'>[], priority: string): number {
  const r = rank(priority);
  const at = list.findIndex(t => rank(t.priority) > r);
  return at === -1 ? list.length : at;
}

/**
 * The tasks showing on each of `days`: the ones you've arranged stay in your
 * order, and any not placed yet land among them by priority (before the first
 * task of a lower priority). Finished tasks stay where they are.
 */
export function tasksByDay<T extends PlannerTask>(tasks: T[], days: string[], today: string, order: PlannerOrder): Map<string, T[]> {
  const map = new Map<string, T[]>(days.map(d => [d, []]));
  for (const t of tasks) map.get(effectiveDay(t, today))?.push(t);
  for (const [day, list] of map) {
    const placedAt = new Map((order[day] ?? []).map((id, i) => [id, i]));
    const placed = list.filter(t => placedAt.has(t.id)).sort((a, b) => placedAt.get(a.id)! - placedAt.get(b.id)!);
    const out = [...placed];
    for (const t of list.filter(x => !placedAt.has(x.id)).sort(byPriority)) out.splice(priorityIndex(out, t.priority), 0, t);
    map.set(day, out);
  }
  return map;
}

/**
 * Where each task in a day sits, in minutes from midnight: a task with its own
 * time (`at`, dragged there) sits at it; the rest go one after another in the
 * day's order, from `dayStart`, each as long as its hours — and never over an
 * event, a meeting or a timed task (one that would run into one starts after it).
 */
export function layoutDay(tasks: { id: number; hours: number; at?: number }[], events: { start: number; end: number }[], dayStart: number): Map<number, number> {
  const out = new Map<number, number>();
  const pinned = tasks.filter(t => t.at !== undefined);
  for (const t of pinned) out.set(t.id, t.at!);
  const busy = [...events, ...pinned.map(t => ({ start: t.at!, end: t.at! + Math.round(t.hours * 60) }))]
    .filter(e => e.end > e.start).sort((a, b) => a.start - b.start);
  let at = dayStart;
  for (const t of tasks.filter(x => x.at === undefined)) {
    const len = Math.round(t.hours * 60);
    for (let moved = true; moved;) {
      moved = false;
      for (const e of busy) {
        if (e.start < at + len && e.end > at) { at = e.end; moved = true; }
      }
    }
    out.set(t.id, at);
    at += len;
  }
  return out;
}

/**
 * Side by side, like a calendar: what overlaps on one day shares the width.
 * Items that overlap — directly or through a chain of others — form a group;
 * each item takes the first column free at its start, and every item in the
 * group is drawn 1 / `cols` wide. `minLength` is the least time an item takes
 * on screen (a 5-minute card is drawn taller than its time), so two short
 * items a few minutes apart don't sit on top of each other. Pure.
 */
export function overlapColumns(items: { key: string; start: number; end: number }[], minLength = 0): Map<string, { col: number; cols: number }> {
  const out = new Map<string, { col: number; cols: number }>();
  const sorted = items
    .map(it => ({ ...it, end: Math.max(it.end, it.start + minLength) }))
    .sort((a, b) => a.start - b.start || b.end - a.end || a.key.localeCompare(b.key));
  let group: { key: string; col: number }[] = [];
  let colEnds: number[] = [];
  let groupEnd = -Infinity;
  const close = () => {
    for (const g of group) out.set(g.key, { col: g.col, cols: colEnds.length });
    group = [];
    colEnds = [];
  };
  for (const it of sorted) {
    if (it.start >= groupEnd) close();
    let col = colEnds.findIndex(end => end <= it.start);
    if (col === -1) { col = colEnds.length; colEnds.push(it.end); } else colEnds[col] = it.end;
    group.push({ key: it.key, col });
    groupEnd = Math.max(groupEnd, it.end);
  }
  close();
  return out;
}

/**
 * What isn't on a day: `overdue` — unfinished tasks whose day has passed and
 * that don't roll forward (oldest first) — `open`, unfinished tasks with no
 * day (by urgency), and `ideas`, the ones kept for later (Idea / Backlog) with
 * no day, listed in a group of their own.
 */
export function unscheduled<T extends PlannerTask>(tasks: T[], today: string): { overdue: T[]; open: T[]; ideas: T[] } {
  const overdue = tasks.filter(t => !t.done && t.scheduled && t.scheduled < today && !t.autoMigrate)
    .sort((a, b) => a.scheduled.localeCompare(b.scheduled) || byUrgency(a, b));
  const open = tasks.filter(t => !t.done && !t.backlog && !t.scheduled).sort(byUrgency);
  const ideas = tasks.filter(t => !t.done && t.backlog && !t.scheduled).sort(byUrgency);
  return { overdue, open, ideas };
}

/** `ids` with `id` put where `overId` is (the end when there's no such card) */
export function placeIn(ids: number[], id: number, overId: number | null): number[] {
  const without = ids.filter(x => x !== id);
  if (overId === null || overId === id) return ids.includes(id) && overId === id ? ids : [...without, id];
  const from = ids.indexOf(id);
  const to = ids.indexOf(overId);
  if (to === -1) return [...without, id];
  // Dragging down within the list lands after the card it was dropped on, like a sortable list
  const at = without.indexOf(overId) + (from !== -1 && from < to ? 1 : 0);
  return [...without.slice(0, at), id, ...without.slice(at)];
}

/**
 * The order after dropping task `id` on `day` ('' = taken off its day):
 * removed from every other day, placed in `dayIds` (that day's cards as
 * shown) where `overId` is. Days more than `keep` days old are dropped.
 */
export function movedOrder(order: PlannerOrder, id: number, day: string, dayIds: number[], overId: number | null, today: string, keep = 60): PlannerOrder {
  const out: PlannerOrder = {};
  const oldest = dayNumber(today) - keep;
  for (const [d, ids] of Object.entries(order)) {
    if (d === day || dayNumber(d) < oldest) continue;
    const rest = ids.filter(x => x !== id);
    if (rest.length) out[d] = rest;
  }
  if (day) out[day] = placeIn(dayIds, id, overId);
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const parts = (day: string) => ({ m: Number(day.slice(5, 7)) - 1, d: Number(day.slice(8, 10)), dow: new Date(`${day}T12:00:00Z`).getUTCDay() });

/** "Oct 25 – 31" / "Oct 28 – Nov 3" */
export function weekLabel(days: string[]): string {
  const a = parts(days[0]);
  const b = parts(days[days.length - 1]);
  return a.m === b.m ? `${MONTHS[a.m]} ${a.d} – ${b.d}` : `${MONTHS[a.m]} ${a.d} – ${MONTHS[b.m]} ${b.d}`;
}

/** Every day of the month grid holding `day`: whole Sunday–Saturday weeks, so it starts and ends with days of the months beside it */
export function monthGridOf(day: string): string[] {
  const first = `${day.slice(0, 7)}-01`;
  const last = addDays(addMonths(first, 1), -1);
  const start = weekOf(first)[0];
  const end = weekOf(last)[6];
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The 1st of the month `n` months from `day`'s */
export function addMonths(day: string, n: number): string {
  const total = Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1 + n;
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

/** "November 2026" */
export const monthLabel = (day: string): string => `${LONG_MONTHS[parts(day).m]} ${day.slice(0, 4)}`;

/** "Mon 12" */
export const laneLabel = (day: string): string => { const p = parts(day); return `${WEEKDAYS[p.dow]} ${p.d}`; };
/** "Thursday, October 15" */
export const longDayLabel = (day: string): string => { const p = parts(day); return `${LONG_DAYS[p.dow]}, ${LONG_MONTHS[p.m]} ${p.d}`; };
/** "Thu, Oct 15" */
export const dayLabel = (day: string): string => { const p = parts(day); return `${WEEKDAYS[p.dow]}, ${MONTHS[p.m]} ${p.d}`; };
/** "Oct 15" */
export const monthDay = (day: string): string => { const p = parts(day); return `${MONTHS[p.m]} ${p.d}`; };
