/* Repeating events and meetings: a rule kept in the entry's fields (repeat,
   repeatEvery, repeatDays, repeatUntil) and the days it lands on. Daily and
   weekly step from the start date; weekly lands on the chosen weekdays (the
   start's weekday when none are chosen); monthly keeps the start's day of the
   month (the 31st becomes the last day of shorter months); yearly the same
   month and day (Feb 29 becomes Feb 28). Until is inclusive; blank = forever.
   Pure. */

export type RepeatKind = '' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RepeatRule {
  repeat: Exclude<RepeatKind, ''>;
  /** Every N days / weeks / months / years (1 or more) */
  every: number;
  /** Weekly: 0 = Sunday … 6 = Saturday */
  days: number[];
  /** Last day it may land on (YYYY-MM-DD), '' = no end */
  until: string;
}

export const REPEAT_OPTIONS: { value: RepeatKind; label: string }[] = [
  { value: '', label: 'Never' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const UNIT: Record<RepeatRule['repeat'], [string, string]> = {
  daily: ['day', 'days'], weekly: ['week', 'weeks'], monthly: ['month', 'months'], yearly: ['year', 'years'],
};

/** An entry's repeat rule, or null when it doesn't repeat */
export function repeatRuleOf(cf: Record<string, unknown>): RepeatRule | null {
  const repeat = cf.repeat;
  if (repeat !== 'daily' && repeat !== 'weekly' && repeat !== 'monthly' && repeat !== 'yearly') return null;
  const every = Math.max(1, Math.min(99, Math.floor(Number(cf.repeatEvery) || 1)));
  const days = Array.isArray(cf.repeatDays)
    ? [...new Set((cf.repeatDays as unknown[]).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : [];
  const until = typeof cf.repeatUntil === 'string' && DAY_RE.test(cf.repeatUntil) ? cf.repeatUntil : '';
  return { repeat, every, days, until };
}

const toDate = (d: string) => new Date(`${d}T12:00:00`);
const toStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: string, n: number) => { const x = toDate(d); x.setDate(x.getDate() + n); return toStr(x); };
const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
/** The given day of a month, clamped to the month's last day */
const dayOfMonth = (y: number, m: number, day: number) => toStr(new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()), 12));

/**
 * The days in [from, to] (inclusive) a repeating entry starting on `start`
 * lands on, oldest first; never before the start or after the rule's end.
 */
export function occurrencesBetween(start: string, rule: RepeatRule | null, from: string, to: string, limit = 1000): string[] {
  if (!DAY_RE.test(start)) return [];
  const last = rule?.until && rule.until < to ? rule.until : to;
  const first = start > from ? start : from;
  if (!rule) return start >= from && start <= to ? [start] : [];
  if (first > last) return [];
  const out: string[] = [];
  const push = (d: string) => { if (d >= first && d <= last && out.length < limit) out.push(d); };

  if (rule.repeat === 'daily') {
    const skip = Math.max(0, Math.ceil(daysBetween(start, first) / rule.every));
    for (let d = addDays(start, skip * rule.every); d <= last && out.length < limit; d = addDays(d, rule.every)) push(d);
  } else if (rule.repeat === 'weekly') {
    const days = rule.days.length ? rule.days : [toDate(start).getDay()];
    const weekOf = (d: string) => addDays(d, -toDate(d).getDay()); // that week's Sunday
    const startWeek = weekOf(start);
    const weeks = Math.max(0, Math.floor(daysBetween(startWeek, weekOf(first)) / 7 / rule.every));
    for (let w = addDays(startWeek, weeks * 7 * rule.every); w <= last && out.length < limit; w = addDays(w, 7 * rule.every)) {
      for (const day of days) push(addDays(w, day));
    }
  } else if (rule.repeat === 'monthly') {
    const s = toDate(start);
    const f = toDate(first);
    let i = Math.max(0, Math.floor(((f.getFullYear() - s.getFullYear()) * 12 + f.getMonth() - s.getMonth()) / rule.every) - 1) * rule.every;
    for (;; i += rule.every) {
      const d = dayOfMonth(s.getFullYear(), s.getMonth() + i, s.getDate());
      if (d > last || out.length >= limit) break;
      push(d);
    }
  } else {
    const s = toDate(start);
    let y = Math.max(0, Math.floor((toDate(first).getFullYear() - s.getFullYear()) / rule.every) - 1) * rule.every;
    for (;; y += rule.every) {
      const d = dayOfMonth(s.getFullYear() + y, s.getMonth(), s.getDate());
      if (d > last || out.length >= limit) break;
      push(d);
    }
  }
  return out;
}

/** "Every Tuesday and Thursday until Dec 31, 2026", "Every 2 weeks on Monday", "Every month on the 15th" */
export function describeRepeat(start: string, rule: RepeatRule | null): string {
  if (!rule || !DAY_RE.test(start)) return '';
  const [one, many] = UNIT[rule.repeat];
  const every = rule.every === 1 ? `Every ${one}` : `Every ${rule.every} ${many}`;
  const s = toDate(start);
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  let text: string;
  if (rule.repeat === 'weekly') {
    const names = (rule.days.length ? rule.days : [s.getDay()]).map(d => WEEKDAYS[d]);
    text = rule.every === 1 ? `Every ${list(names)}` : `${every} on ${list(names)}`;
  } else if (rule.repeat === 'monthly') {
    const n = s.getDate();
    const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
    text = `${every} on the ${n}${suffix}`;
  } else if (rule.repeat === 'yearly') {
    text = `${every} on ${s.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
  } else {
    text = every;
  }
  return rule.until ? `${text} until ${toDate(rule.until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : text;
}
