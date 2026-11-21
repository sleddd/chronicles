import { shortDay } from './planTable.js';

/*
 * An event's or meeting's columns on its topic page (views/TopicDetailView): when it starts,
 * when it ends and where. Pure.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(\d{1,2}):(\d{2})$/;

/** "19:30" → "7:30 PM" ('' when it isn't a time) */
export function clockTime(t: unknown): string {
  const m = typeof t === 'string' ? TIME.exec(t.trim()) : null;
  if (!m) return '';
  const h = Number(m[1]);
  if (h > 23) return '';
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * Starts: "Nov 23 · 7:00 PM" ("· All day" for an all-day one); Ends: just the time when it ends
 * the day it starts, else its day and time; Venue: its place. '' where there's nothing to show.
 */
export function eventCells(cf: Record<string, unknown> | undefined, today: string): { starts: string; ends: string; venue: string } {
  const f = cf ?? {};
  const allDay = f.allDay === true;
  const startDay = DAY.test(str(f.startDate)) ? str(f.startDate) : '';
  const endDay = DAY.test(str(f.endDate)) ? str(f.endDate) : '';
  const startTime = allDay ? '' : clockTime(f.startTime);
  const endTime = allDay ? '' : clockTime(f.endTime);
  const starts = startDay
    ? [shortDay(startDay, today), allDay ? 'All day' : startTime].filter(Boolean).join(' · ')
    : startTime;
  const sameDay = !endDay || endDay === startDay;
  const ends = sameDay ? endTime : [shortDay(endDay, today), endTime].filter(Boolean).join(' · ');
  return { starts, ends, venue: str(f.location) };
}
