/* The week / day planner: tasks put on a day (`scheduledDate`, YYYY-MM-DD —
   by day and, if you like, a part of it — `scheduledPart`: morning (the default), noon
   or night — never hours). A task can cover more than one part: through
   `scheduledPartEnd` (morning to night = the whole day). A task with no
   planned day but a deadline AND a time of day chosen shows on its deadline's
   day, in that part (`plannedDay`). An unfinished task set to auto-migrate ("Move to
   tomorrow if unfinished") whose day has passed shows under today — worked out
   when read, nothing is rewritten. Without it the task stays on its day and
   is listed as overdue. The order within a day is the sealed setting
   `plannerOrder` (day → task ids, top first). Pure. */

import { addDays, dayOf, dayNumber } from './planTimeline.js';
import { taskStatusOf } from '../types/goals.js';

export { addDays };

/** The parts of a day a task can be planned for (no hours) */
export type DayPart = 'morning' | 'noon' | 'night';

/* `hours` says when each part is (the same bounds `partOfTime` sorts events by) */
export const DAY_PARTS: { value: DayPart; label: string; hours: string }[] = [
  { value: 'morning', label: 'Morning', hours: 'Before 12 PM' },
  { value: 'noon', label: 'Noon', hours: '12 – 5 PM' },
  { value: 'night', label: 'Night', hours: 'After 5 PM' },
];

/** The planner grid's rows. There is no "any time" row: a task on a day with no part chosen sits under Morning */
export const PLANNER_ROWS = DAY_PARTS;
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

/** Where a task that covered `start`–`end` ends once moved to begin at `to`: the same length, cut off at Night */
export function movedEnd(start: DayPart, end: DayPart | '' | undefined, to: DayPart): DayPart {
  const length = partsCovered(start, end).length;
  return DAY_PARTS[Math.min(DAY_PARTS.length - 1, partIndex(to) + length - 1)].value;
}

/** "Morning – Noon", "All day"; '' for a single part */
export function spanLabel(start: DayPart, end?: DayPart | ''): string {
  const covered = partsCovered(start, end);
  if (covered.length < 2) return '';
  if (covered.length === DAY_PARTS.length) return 'All day';
  const name = (p: DayPart) => DAY_PARTS[partIndex(p)].label;
  return `${name(covered[0])} – ${name(covered[covered.length - 1])}`;
}

/**
 * The day a task is planned for: the one it was given ("Planned for"), else
 * its deadline once a time of day was chosen for it — a deadline with
 * "Morning" is something to do that morning. A bare deadline plans nothing.
 */
export function plannedDay(cf: Record<string, unknown> | undefined): string {
  return dayOf(cf?.scheduledDate) || (chosenPart(cf) ? dayOf(cf?.deadline) : '');
}

/** The part of the day a clock time falls in: before noon, noon to 5 PM, after ('' for no time) */
export function partOfTime(hhmm: unknown): DayPart | '' {
  const h = typeof hhmm === 'string' && /^\d{1,2}:\d{2}/.test(hhmm) ? Number(hhmm.split(':')[0]) : NaN;
  if (!Number.isFinite(h)) return '';
  return h < 12 ? 'morning' : h < 17 ? 'noon' : 'night';
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
  /** An idea kept for later (the "Idea / Backlog" status): never listed as Unscheduled */
  backlog?: boolean;
  autoMigrate: boolean;
  /** YYYY-MM-DD or '' */
  deadline: string;
  priority: string;
  created: number;
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

/**
 * The tasks showing on each of `days`: the ones you've arranged in your order,
 * then any not placed yet (by urgency). Finished tasks stay where they are.
 */
export function tasksByDay<T extends PlannerTask>(tasks: T[], days: string[], today: string, order: PlannerOrder): Map<string, T[]> {
  const map = new Map<string, T[]>(days.map(d => [d, []]));
  for (const t of tasks) map.get(effectiveDay(t, today))?.push(t);
  for (const [day, list] of map) {
    const placed = new Map((order[day] ?? []).map((id, i) => [id, i]));
    list.sort((a, b) => {
      const pa = placed.get(a.id), pb = placed.get(b.id);
      if (pa !== undefined && pb !== undefined) return pa - pb;
      if (pa !== undefined) return -1;
      if (pb !== undefined) return 1;
      return byUrgency(a, b);
    });
  }
  return map;
}

/**
 * What isn't on a day: `overdue` — unfinished tasks whose day has passed and
 * that don't roll forward (oldest first) — and `open`, unfinished tasks with
 * no day (by urgency). Ideas kept for later (Idea / Backlog) are in neither.
 */
export function unscheduled<T extends PlannerTask>(tasks: T[], today: string): { overdue: T[]; open: T[] } {
  const overdue = tasks.filter(t => !t.done && !t.backlog && t.scheduled && t.scheduled < today && !t.autoMigrate)
    .sort((a, b) => a.scheduled.localeCompare(b.scheduled) || byUrgency(a, b));
  const open = tasks.filter(t => !t.done && !t.backlog && !t.scheduled).sort(byUrgency);
  return { overdue, open };
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

/** "Mon 12" */
export const laneLabel = (day: string): string => { const p = parts(day); return `${WEEKDAYS[p.dow]} ${p.d}`; };
/** "Thursday, October 15" */
export const longDayLabel = (day: string): string => { const p = parts(day); return `${LONG_DAYS[p.dow]}, ${LONG_MONTHS[p.m]} ${p.d}`; };
/** "Thu, Oct 15" */
export const dayLabel = (day: string): string => { const p = parts(day); return `${WEEKDAYS[p.dow]}, ${MONTHS[p.m]} ${p.d}`; };
/** "Oct 15" */
export const monthDay = (day: string): string => { const p = parts(day); return `${MONTHS[p.m]} ${p.d}`; };
