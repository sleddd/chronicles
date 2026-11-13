/* Habits: something done again and again toward a target — "3 times a week",
   "twice a day". A habit is an entry in the Habit topic (its name, target,
   the days it's due, a goal category, the goal it serves); check-ins are a
   count per day in the sealed setting `habitLog`, never entries, so ticking
   one can't collide with a habit open in the editor. Exercise routines are
   not habits: they stay on the exercise schedule.
   A week is Sunday to Saturday and is "met" once its count reaches the week's
   target, whichever days that took (a missed day doesn't break it). Pure. */

import { addDays, dayNumber, dayOf } from './planTimeline.js';
import { weekOf } from './planner.js';

export const HABIT_TOPIC = 'Habit';
export const HABIT_ICON = 'calendar-check';
export const isHabitTopic = (name: string | undefined) => ['habit', 'habits'].includes((name ?? '').trim().toLowerCase());

export type HabitPeriod = 'day' | 'week';

export interface Habit {
  id: number;
  name: string;
  /** How many times each `period` */
  target: number;
  period: HabitPeriod;
  /** Weekdays it's due (0 = Sunday); none = any day */
  days: number[];
  category: string;
  goalId: number | null;
  active: boolean;
}

export const HABIT_DEFAULTS = { targetCount: 1, targetPeriod: 'day' as HabitPeriod, days: [] as number[], isActive: true };

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const clampTarget = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 1 ? Math.min(n, 35) : 1; };
const weekdays = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : []);

/** A habit from a Habit entry's fields (`category` falls back to its goal's) */
export function habitFrom(id: number, cf: Record<string, unknown> | undefined, fallbackName: string, goalCategory?: Map<number, string>): Habit {
  const goalId = typeof cf?.parentGoalId === 'number' && cf.parentGoalId > 0 ? cf.parentGoalId : null;
  return {
    id, name: str(cf?.habitName) || fallbackName || 'Habit',
    target: clampTarget(cf?.targetCount), period: cf?.targetPeriod === 'week' ? 'week' : 'day',
    days: weekdays(cf?.days), category: str(cf?.habitCategory) || (goalId ? goalCategory?.get(goalId) ?? '' : ''),
    goalId, active: cf?.isActive !== false,
  };
}

/* ── The log: habit id → month → one base-36 count per day of the month ── */

export type HabitLog = Record<string, Record<string, string>>;

const MAX_COUNT = 35;
const digit = (n: number) => Math.max(0, Math.min(MAX_COUNT, Math.round(n))).toString(36);
const valueOf = (c: string | undefined) => { const n = c ? parseInt(c, 36) : 0; return Number.isFinite(n) ? n : 0; };

/** The saved log, well-formed (it is user data from the server) */
export function parseHabitLog(raw: unknown): HabitLog {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: HabitLog = {};
  for (const [id, months] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d+$/.test(id) || !months || typeof months !== 'object' || Array.isArray(months)) continue;
    const kept: Record<string, string> = {};
    for (const [month, days] of Object.entries(months as Record<string, unknown>)) {
      if (/^\d{4}-\d{2}$/.test(month) && typeof days === 'string' && /^[0-9a-z]{1,31}$/.test(days)) kept[month] = days;
    }
    if (Object.keys(kept).length) out[id] = kept;
  }
  return out;
}

/** How many times a habit was checked in on a day */
export function loggedOn(log: HabitLog, habitId: number, day: string): number {
  return valueOf(log[String(habitId)]?.[day.slice(0, 7)]?.[Number(day.slice(8, 10)) - 1]);
}

/** The log with that day's count set (0 clears it; empty months and habits are dropped) */
export function withCount(log: HabitLog, habitId: number, day: string, count: number): HabitLog {
  if (dayOf(day) !== day || loggedOn(log, habitId, day) === Math.max(0, Math.min(MAX_COUNT, Math.round(count)))) return log;
  const id = String(habitId);
  const month = day.slice(0, 7);
  const at = Number(day.slice(8, 10)) - 1;
  const chars = (log[id]?.[month] ?? '').padEnd(at + 1, '0').split('');
  chars[at] = digit(count);
  const days = chars.join('').replace(/0+$/, '');
  const months = { ...(log[id] ?? {}) };
  if (days) months[month] = days; else delete months[month];
  const next = { ...log };
  if (Object.keys(months).length) next[id] = months; else delete next[id];
  return next;
}

/** The first day a habit was ever checked in, '' when never */
export function firstLoggedDay(log: HabitLog, habitId: number): string {
  const months = log[String(habitId)];
  if (!months) return '';
  for (const month of Object.keys(months).sort()) {
    const at = months[month].split('').findIndex(c => valueOf(c) > 0);
    if (at !== -1) return `${month}-${String(at + 1).padStart(2, '0')}`;
  }
  return '';
}

/** The log without a habit (it was deleted) */
export function withoutHabit(log: HabitLog, habitId: number): HabitLog {
  if (!(String(habitId) in log)) return log;
  const { [String(habitId)]: _gone, ...rest } = log;
  return rest;
}

/** How many times a habit was done on a day */
export type CountOn = (habit: Habit, day: string) => number;

export const countFrom = (log: HabitLog): CountOn => (habit, day) => loggedOn(log, habit.id, day);

/* ── Targets and progress ── */

const dow = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

export const isDueOn = (h: Habit, day: string): boolean => h.days.length === 0 || h.days.includes(dow(day));

/** What a full day is: the daily target, or once for a weekly habit */
export const dayTarget = (h: Habit): number => (h.period === 'day' ? h.target : 1);

/** What a full week is */
export const weekTarget = (h: Habit): number => (h.period === 'week' ? h.target : h.target * (h.days.length || 7));

/** The count after a tap on a day's cell: one more until the day is full, then back to none */
export const nextCount = (h: Habit, current: number): number => (current >= dayTarget(h) ? 0 : current + 1);

export interface WeekProgress { done: number; target: number; met: boolean }

export function weekProgress(h: Habit, days: string[], count: CountOn): WeekProgress {
  const done = days.reduce((n, d) => n + count(h, d), 0);
  const target = weekTarget(h);
  return { done, target, met: done >= target };
}

/**
 * Weeks in a row that met the target, counting back from last week — plus
 * this week once it has (an unfinished week never breaks a streak).
 */
export function streakWeeks(h: Habit, today: string, count: CountOn, limit = 104): number {
  const thisWeek = weekOf(today);
  let streak = weekProgress(h, thisWeek, count).met ? 1 : 0;
  for (let i = 1; i <= limit; i++) {
    if (!weekProgress(h, weekOf(addDays(thisWeek[0], -7 * i)), count).met) break;
    streak++;
  }
  return streak;
}

export interface DayRange { from: string; to: string }

/** Every day from `from` to `to` (inclusive, a year and a bit at most) */
export function daysIn(range: DayRange, max = 400): string[] {
  const n = Math.min(max, dayNumber(range.to) - dayNumber(range.from) + 1);
  return n > 0 ? Array.from({ length: n }, (_, i) => addDays(range.from, i)) : [];
}

export interface HabitTotals { times: number; days: number; weeksMet: number; weeks: number }

/** Over a range (up to `today`): times done, days with any, and whole weeks that met the target */
export function habitTotals(h: Habit, range: DayRange, today: string, count: CountOn): HabitTotals {
  const days = daysIn({ from: range.from, to: range.to < today ? range.to : today });
  let times = 0, active = 0;
  for (const d of days) { const n = count(h, d); times += n; if (n > 0) active++; }
  const starts = [...new Set(days.map(d => weekOf(d)[0]))];
  const weeksMet = starts.filter(s => weekProgress(h, weekOf(s), count).met).length;
  return { times, days: active, weeksMet, weeks: starts.length };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (day: string) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;

export interface CountSeries {
  unit: 'day' | 'week' | 'month';
  labels: string[];
  values: number[];
  /** The target per bar, when one applies to the unit */
  target?: number;
}

/** Counts over a range as bars: by day up to five weeks, by week up to half a year, else by month */
export function countSeries(h: Habit, range: DayRange, count: CountOn): CountSeries {
  const days = daysIn(range);
  if (days.length <= 35) {
    return { unit: 'day', labels: days.map(label), values: days.map(d => count(h, d)), target: h.period === 'day' && h.target > 1 ? h.target : undefined };
  }
  const by = (keyOf: (d: string) => string, name: (key: string) => string) => {
    const keys: string[] = [];
    const sums = new Map<string, number>();
    for (const d of days) {
      const k = keyOf(d);
      if (!sums.has(k)) keys.push(k);
      sums.set(k, (sums.get(k) ?? 0) + count(h, d));
    }
    return { labels: keys.map(name), values: keys.map(k => sums.get(k) ?? 0) };
  };
  if (days.length <= 190) return { unit: 'week', ...by(d => weekOf(d)[0], label), target: weekTarget(h) };
  return { unit: 'month', ...by(d => d.slice(0, 7), k => MONTHS[Number(k.slice(5, 7)) - 1]) };
}

export type DayCell = 'full' | 'part' | 'missed' | 'off' | 'ahead';

/** One cell per day of a range: done in full, in part, due but not done, not due, or still to come */
export function dayCells(h: Habit, range: DayRange, today: string, count: CountOn): DayCell[] {
  return daysIn(range).map(d => {
    if (d > today) return 'ahead';
    const n = count(h, d);
    if (n >= dayTarget(h)) return 'full';
    if (n > 0) return 'part';
    return isDueOn(h, d) && h.period === 'day' ? 'missed' : 'off';
  });
}

/** "3 times a week" / "Twice a day" / "Once a day on Mon, Wed" */
export function describeTarget(h: Habit, describeDays: (days: number[]) => string): string {
  const times = h.target === 1 ? 'Once' : h.target === 2 ? 'Twice' : `${h.target} times`;
  const on = h.days.length > 0 && h.days.length < 7 ? ` on ${describeDays(h.days)}` : '';
  return `${times} a ${h.period}${on}`;
}

/** CSV rows (date, habit, times) for every day with a check-in in the range */
export function habitCsvRows(habits: Habit[], range: DayRange, count: CountOn): string[][] {
  const rows: string[][] = [];
  for (const d of daysIn(range)) for (const h of habits) { const n = count(h, d); if (n > 0) rows.push([d, h.name, String(n)]); }
  return rows;
}
