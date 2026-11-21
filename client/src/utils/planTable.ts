/* The Planning list tables (Goals, Milestones, Tasks): how a date, a
   deadline and a goal's progress read in their columns. Pure. */

import { dayNumber } from './planTimeline.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A real YYYY-MM-DD, else '' */
export const dayOrNone = (v: unknown): string => (typeof v === 'string' && DAY.test(v) ? v : '');

/** "Nov 9", with the year only when it isn't this one ("Jan 15, 2028") */
export function shortDay(day: string, today: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}${String(y) === today.slice(0, 4) ? '' : `, ${y}`}`;
}

/** "Mon, Nov 23" */
function weekdayDay(day: string, today: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${shortDay(day, today)}`;
}

/** How a deadline stands: late, soon (within a week), later, or met */
export type DueTone = 'late' | 'soon' | 'later' | 'done';

/**
 * A deadline's note beside its date: "12 days late", "today", "in 6 days",
 * "in 3 wk", "in 2 mo", or "done" once the thing is finished.
 */
export function dueNote(deadline: string, today: string, done: boolean): { text: string; tone: DueTone } {
  if (done) return { text: 'done', tone: 'done' };
  const days = dayNumber(deadline) - dayNumber(today);
  if (days < 0) return { text: `${-days} ${days === -1 ? 'day' : 'days'} late`, tone: 'late' };
  if (days === 0) return { text: 'today', tone: 'soon' };
  if (days === 1) return { text: 'tomorrow', tone: 'soon' };
  const tone: DueTone = days <= 7 ? 'soon' : 'later';
  if (days < 14) return { text: `in ${days} days`, tone };
  if (days < 56) return { text: `in ${Math.round(days / 7)} wk`, tone };
  return { text: `in ${Math.round(days / 30)} mo`, tone };
}

/** The day a task is planned for, as its column reads it: "Today", "Mon, Nov 23", or "Nov 19" once done or past */
export function plannedText(day: string, today: string, done: boolean): { text: string; today: boolean } {
  if (day === today && !done) return { text: 'Today', today: true };
  return { text: done || day < today ? shortDay(day, today) : weekdayDay(day, today), today: false };
}

/** Whether a day falls in the same month as today */
export const sameMonth = (day: string, today: string): boolean => day.slice(0, 7) === today.slice(0, 7);

/**
 * How far a goal has got, 0–100: its tasks done (those directly under it and
 * under its milestones), else its milestones done, and 100 once achieved —
 * so the percentage agrees with the "8 / 13" beside it.
 */
export function goalPercent(achieved: boolean, tasks: { done: boolean }[], milestones: { done: boolean }[]): number {
  if (achieved) return 100;
  const list = tasks.length ? tasks : milestones;
  return list.length ? Math.round((list.filter(x => x.done).length / list.length) * 100) : 0;
}
