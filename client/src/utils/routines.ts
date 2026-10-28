/* Exercise routines — the exercise version of the medication list. A Routine
   entry (name, exercises, days, times, Currently doing) puts a row on each
   day's checklist at each of its times. Ticking it logs an Exercise entry for
   that day, linked by metadata._routineLink = "<routineId>|<date>|<HH:MM>";
   ticking single exercises logs a partial session ("3 of 5"). So the session
   counts in Exercise, Reports and the training tracker like any other. Pure. */

import type { RoutineItem } from '../types/fields.js';
import { exerciseSummary } from './exerciseSummary.js';

export interface Routine {
  id: number;
  name: string;
  exerciseType: string;
  /** Minutes for a full session (typed, else the sum of the "N min" items) */
  minutes: number;
  items: RoutineItem[];
  days: number[];
  times: string[];
  trainingCategory: string;
  /** Currently doing (only false when read withPaused) */
  active: boolean;
}

/** One routine at one of its times on one day */
export interface RoutineSlot {
  routine: Routine;
  time: string;
  key: string;
}

/** The exercise schedule topic — "Exercise Routine"; its earlier names ("Exercise Schedule", "Routine") count too */
export const SCHEDULE_TOPIC = 'Exercise Routine';
const SCHEDULE_TOPIC_NAMES = ['exercise routine', 'exercise routines', 'exercise schedule', 'exercise schedules', 'routine', 'routines'];
export const isScheduleTopic = (name: string | undefined) => !!name && SCHEDULE_TOPIC_NAMES.includes(name.trim().toLowerCase());
/** Every schedule-type topic. An account can hold more than one (an older
 *  name beside the current one), and routines in any of them count. */
export const scheduleTopicIds = (topics: { id: number; name: string }[]) => topics.filter(t => isScheduleTopic(t.name)).map(t => t.id);
/** The topic new routines go in: the first one already holding entries, else the first */
export const scheduleTopicId = (
  topics: { id: number; name: string }[],
  entries: { metadata?: unknown }[] = [],
): number | undefined => {
  const ids = scheduleTopicIds(topics);
  const used = new Set(entries.map(e => (e.metadata as Record<string, unknown> | undefined)?._taxonomyId));
  return ids.find(id => used.has(id)) ?? ids[0];
};

/** What a new routine's form shows — and so what an untouched field means */
export const ROUTINE_DEFAULTS = { exerciseType: 'yoga', scheduleTimes: ['07:00'] };

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const routineLinkKey = (routineId: number, date: string, time: string) =>
  `${routineId}|${date}|${time.slice(0, 5).padStart(5, '0')}`;

/** Minutes in an amount: "5 min" → 5, "90 sec" → 1.5, "1 hr" → 60; else 0 */
export function amountMinutes(amount: string): number {
  const m = amount.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?|h|hr|hrs|hours?|s|sec|secs|seconds?)\b/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (m[2].startsWith('h')) return n * 60;
  if (m[2].startsWith('s')) return n / 60;
  return n;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));

/** Active routines from the store's entries (missing isActive counts as active). */
export function activeRoutines(
  entries: { id: number; content: string; metadata?: unknown }[],
  topicId: number | number[] | undefined,
  textOf: (html: string) => string,
  { withPaused = false } = {},
): Routine[] {
  const ids = new Set(topicId === undefined ? [] : Array.isArray(topicId) ? topicId : [topicId]);
  if (!ids.size) return [];
  const out: Routine[] = [];
  for (const e of entries) {
    const meta = e.metadata as Record<string, unknown> | undefined;
    if (!meta || !ids.has(meta._taxonomyId as number)) continue;
    const cf = (meta._customFields as Record<string, unknown>) ?? {};
    if (cf.isActive === false && !withPaused) continue;
    const items = Array.isArray(cf.items) ? (cf.items as RoutineItem[]).filter(i => i && str(i.name)) : [];
    const typed = parseFloat(str(cf.duration));
    const summed = Math.round(items.reduce((t, i) => t + amountMinutes(str(i.amount)), 0));
    out.push({
      id: e.id,
      name: str(cf.routineName) || textOf(e.content).trim().slice(0, 120) || 'Exercise',
      exerciseType: str(cf.exerciseType) || ROUTINE_DEFAULTS.exerciseType,
      minutes: typed > 0 ? typed : summed,
      items,
      days: Array.isArray(cf.days) ? (cf.days as number[]) : [],
      times: Array.isArray(cf.scheduleTimes) ? (cf.scheduleTimes as string[]).filter(Boolean) : ROUTINE_DEFAULTS.scheduleTimes,
      trainingCategory: str(cf.trainingCategory),
      active: cf.isActive !== false,
    });
  }
  return out;
}

/** Does the routine run on this date ("YYYY-MM-DD")? */
export function runsOn(r: Routine, date: string): boolean {
  if (r.days.length === 0) return true;
  return r.days.includes(new Date(date + 'T12:00:00').getDay());
}

/** Every routine's slots on a date, by time then name. */
export function slotsOn(routines: Routine[], date: string): RoutineSlot[] {
  const out: RoutineSlot[] = [];
  for (const r of routines) {
    if (!runsOn(r, date)) continue;
    for (const time of r.times) out.push({ routine: r, time, key: routineLinkKey(r.id, date, time) });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.routine.name.localeCompare(b.routine.name));
}

/** "Every day" · "Weekdays" · "Mon, Wed, Fri" */
export function describeDays(days: number[]): string {
  const set = [...new Set(days)].sort();
  if (set.length === 0 || set.length === 7) return 'Every day';
  if (set.join() === '1,2,3,4,5') return 'Weekdays';
  if (set.join() === '0,6') return 'Weekends';
  return set.map(d => WEEKDAYS[d]).join(', ');
}

/** Minutes for a session with only some exercises done. */
export function sessionMinutes(r: Routine, doneIds: string[]): number {
  if (r.items.length === 0 || doneIds.length >= r.items.length) return r.minutes;
  const done = r.items.filter(i => doneIds.includes(i.id));
  const timed = done.reduce((t, i) => t + amountMinutes(i.amount), 0);
  if (timed > 0) return Math.round(timed);
  return Math.round(r.minutes * done.length / r.items.length);
}

/** The Exercise entry fields for a session of the routine. */
export function sessionFields(r: Routine, doneIds: string[], date: string, time: string): Record<string, unknown> {
  const minutes = sessionMinutes(r, doneIds);
  const fields: Record<string, unknown> = {
    exerciseType: r.exerciseType,
    duration: minutes > 0 ? String(minutes) : '',
    intensity: 'medium',
    distance: '',
    distanceUnit: 'miles',
    calories: '',
    performedDate: date,
    performedTime: time.slice(0, 5),
    notes: '',
    routineId: r.id,
    routineItemsDone: r.items.length ? doneIds : [],
  };
  if (r.trainingCategory) fields.trainingCategory = r.trainingCategory;
  return fields;
}

/** "Morning yoga · Yoga · 30 min" */
export function sessionTitle(r: Routine, fields: Record<string, unknown>): string {
  return [r.name, exerciseSummary(fields)].filter(Boolean).join(' · ');
}

/** The exercises done in a logged session; every one when it holds no list. */
export function doneItemsOf(r: Routine, fields: Record<string, unknown> | undefined): string[] {
  if (!fields) return [];
  const ids = Array.isArray(fields.routineItemsDone) ? (fields.routineItemsDone as string[]) : null;
  if (!ids || ids.length === 0) return r.items.map(i => i.id);
  return ids.filter(id => r.items.some(i => i.id === id));
}
