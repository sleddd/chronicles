/* The Planning roadmap: goals and milestones as bars on a timeline. A bar runs
   from its start date (`startOn`, else the day the entry was made) to its
   target date; with no target date it is "open" — a short dashed bar. The
   window is whole months and everything is placed as a fraction of it (0–1),
   so the track can be any width. Dates are YYYY-MM-DD. Pure. */

export type TimelineScale = 'month' | 'quarter' | 'year' | 'years5';

export const TIMELINE_SCALES: { value: TimelineScale; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
  { value: 'years5', label: '5 years' },
];

export const SCALE_MONTHS: Record<TimelineScale, number> = { month: 1, quarter: 3, year: 12, years5: 60 };
/** How far ‹ › move the window, in months */
export const SCALE_STEP: Record<TimelineScale, number> = { month: 1, quarter: 1, year: 3, years5: 12 };

const DAY = 86_400_000;
/* A real calendar day: the text must survive a round trip (Feb 31 rolls over to March) */
const isDay = (s: unknown): s is string => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
};

/** A valid YYYY-MM-DD from a field value, else '' */
export const dayOf = (v: unknown): string => (typeof v === 'string' && isDay(v.slice(0, 10)) ? v.slice(0, 10) : '');

/** Days since 1970-01-01 (UTC, so no daylight-saving drift) */
export const dayNumber = (day: string): number => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY);
const fromNumber = (n: number): string => new Date(n * DAY).toISOString().slice(0, 10);

export const addDays = (day: string, n: number): string => fromNumber(dayNumber(day) + n);

/** The first of the month `n` months from `day`'s month */
export function addMonths(day: string, n: number): string {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7)) - 1 + n;
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

export interface TimelineWindow { from: string; /** exclusive */ to: string; days: number }

/** The window starting at the month holding `start` */
export function timelineWindow(scale: TimelineScale, start: string): TimelineWindow {
  const from = addMonths(start, 0);
  const to = addMonths(from, SCALE_MONTHS[scale]);
  return { from, to, days: dayNumber(to) - dayNumber(from) };
}

/** Where the window opens: this month for a month or a quarter, a month back for a year, January for five years */
export function defaultStart(scale: TimelineScale, today: string): string {
  if (scale === 'month' || scale === 'quarter') return addMonths(today, 0);
  if (scale === 'year') return addMonths(today, -1);
  return `${today.slice(0, 4)}-01-01`;
}

/** A day's place across the window: 0 at its start, 1 at its end (outside = below 0 / above 1) */
export const fractionOf = (day: string, w: TimelineWindow): number => (dayNumber(day) - dayNumber(w.from)) / w.days;

const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface TimelineTick { day: string; left: number; width: number; label: string; /** A year starts here */ year: boolean }

/** One column per month (per half year on the five-year scale), labelled "Oct" — "Jan 2027" where a year starts or the window opens.
 *  A month's window has a column a week from the 1st: "Nov 1", "8", "15", "22", "29" */
export function timelineTicks(scale: TimelineScale, w: TimelineWindow): TimelineTick[] {
  if (scale === 'month') {
    const month = MONTHS[Number(w.from.slice(5, 7)) - 1];
    const weeks: TimelineTick[] = [];
    for (let i = 0; i < w.days; i += 7) {
      const day = addDays(w.from, i);
      const next = i + 7 < w.days ? addDays(w.from, i + 7) : w.to;
      weeks.push({ day, left: fractionOf(day, w), width: fractionOf(next, w) - fractionOf(day, w),
        label: i === 0 ? `${month} 1` : String(Number(day.slice(8, 10))), year: false });
    }
    return weeks;
  }
  const step = scale === 'years5' ? 6 : 1;
  const ticks: TimelineTick[] = [];
  for (let i = 0; i < SCALE_MONTHS[scale]; i += step) {
    const day = addMonths(w.from, i);
    const next = addMonths(w.from, i + step);
    const month = Number(day.slice(5, 7)) - 1;
    const year = month === 0;
    ticks.push({
      day, left: fractionOf(day, w), width: fractionOf(next, w) - fractionOf(day, w),
      label: year || i === 0 ? `${MONTHS[month]} ${day.slice(0, 4)}` : MONTHS[month], year,
    });
  }
  return ticks;
}

/** "November 2026" / "Oct – Dec 2026" / "Nov 2026 – Oct 2027" */
export function windowLabel(w: TimelineWindow): string {
  const last = addDays(w.to, -1);
  if (w.from.slice(0, 7) === last.slice(0, 7)) return `${FULL_MONTHS[Number(w.from.slice(5, 7)) - 1]} ${w.from.slice(0, 4)}`;
  const a = `${MONTHS[Number(w.from.slice(5, 7)) - 1]}`;
  const b = `${MONTHS[Number(last.slice(5, 7)) - 1]} ${last.slice(0, 4)}`;
  return w.from.slice(0, 4) === last.slice(0, 4) ? `${a} – ${b}` : `${a} ${w.from.slice(0, 4)} – ${b}`;
}

export interface BarDates { start: string; /** '' = no target date (an open bar) */ end: string }

/** A bar's dates from an entry's fields: start = `startOn`, else the day created; never after its end */
export function barDates(cf: Record<string, unknown> | undefined, createdDay: string): BarDates {
  const end = dayOf(cf?.targetDate);
  let start = dayOf(cf?.startOn) || createdDay;
  if (end && start > end) start = end;
  return { start, end };
}

/** How long an open bar is drawn: about a sixteenth of the window, two weeks at least (four days on a month) */
export const openBarDays = (w: TimelineWindow): number => Math.max(w.days <= 31 ? 4 : 14, Math.round(w.days / 16));

export interface BarSpan { left: number; width: number; /** Runs past the window's start / end */ cutLeft: boolean; cutRight: boolean; open: boolean }

/** The part of a bar inside the window (its end day included), or null when none of it is */
export function barSpan(dates: BarDates, w: TimelineWindow): BarSpan | null {
  const open = !dates.end;
  const a = fractionOf(dates.start, w);
  const b = open ? a + openBarDays(w) / w.days : fractionOf(addDays(dates.end, 1), w);
  if (b <= 0 || a >= 1) return null;
  const left = Math.max(0, a);
  const right = Math.min(1, b);
  return { left, width: right - left, cutLeft: a < 0, cutRight: b > 1, open };
}

export type DragMode = 'move' | 'start' | 'end';

/** Days moved for a drag of `dx` pixels on a track `trackWidth` wide */
export const dragDays = (dx: number, trackWidth: number, w: TimelineWindow): number =>
  (trackWidth > 0 ? Math.round((dx / trackWidth) * w.days) : 0);

/**
 * A bar's dates after dragging it `delta` days: 'move' shifts both, 'start' /
 * 'end' one side (never past the other). Dragging an open bar's end gives it a
 * target date; moving an open bar keeps it open.
 */
export function draggedDates(dates: BarDates, delta: number, mode: DragMode, w: TimelineWindow): BarDates {
  if (!delta) return dates;
  if (mode === 'move') return { start: addDays(dates.start, delta), end: dates.end ? addDays(dates.end, delta) : '' };
  if (mode === 'start') {
    const start = addDays(dates.start, delta);
    return { start: dates.end && start > dates.end ? dates.end : start, end: dates.end };
  }
  const from = dates.end || addDays(dates.start, openBarDays(w) - 1);
  const end = addDays(from, delta);
  return { start: dates.start, end: end < dates.start ? dates.start : end };
}

/** "Mar 14" — with the year when it isn't `today`'s */
export function shortDay(day: string, today: string): string {
  if (!day) return '';
  const label = `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
  return day.slice(0, 4) === today.slice(0, 4) ? label : `${label}, ${day.slice(0, 4)}`;
}
