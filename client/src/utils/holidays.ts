/**
 * US holidays for the calendar, worked out in the browser — no lookup, nothing sent
 * anywhere. Federal holidays plus the widely kept observances, on their actual dates
 * (no "observed on Monday" shifting). Pure.
 */

export interface Holiday {
  /** YYYY-MM-DD */
  date: string;
  name: string;
  /** A US federal holiday (the others are common observances) */
  federal: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

/** The nth (1-based) given weekday (0 = Sunday) of a month (1-based) */
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  const first = new Date(year, month - 1, 1).getDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}

/** The last given weekday (0 = Sunday) of a month (1-based) */
function lastWeekday(year: number, month: number, weekday: number): number {
  const lastDay = new Date(year, month, 0);
  return lastDay.getDate() - ((lastDay.getDay() - weekday + 7) % 7);
}

/** Easter Sunday (Gregorian; the anonymous "Meeus / Jones / Butcher" computus) as [month, day] */
export function easterSunday(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

/** One year's holidays, in date order */
export function usHolidays(year: number): Holiday[] {
  const [easterMonth, easterDay] = easterSunday(year);
  const list: Holiday[] = [
    { date: iso(year, 1, 1), name: 'New Year’s Day', federal: true },
    { date: iso(year, 1, nthWeekday(year, 1, 1, 3)), name: 'Martin Luther King Jr. Day', federal: true },
    { date: iso(year, 2, 14), name: 'Valentine’s Day', federal: false },
    { date: iso(year, 2, nthWeekday(year, 2, 1, 3)), name: 'Presidents’ Day', federal: true },
    { date: iso(year, 3, 17), name: 'St. Patrick’s Day', federal: false },
    { date: iso(year, easterMonth, easterDay), name: 'Easter', federal: false },
    { date: iso(year, 5, nthWeekday(year, 5, 0, 2)), name: 'Mother’s Day', federal: false },
    { date: iso(year, 5, lastWeekday(year, 5, 1)), name: 'Memorial Day', federal: true },
    { date: iso(year, 6, nthWeekday(year, 6, 0, 3)), name: 'Father’s Day', federal: false },
    { date: iso(year, 6, 19), name: 'Juneteenth', federal: true },
    { date: iso(year, 7, 4), name: 'Independence Day', federal: true },
    { date: iso(year, 9, nthWeekday(year, 9, 1, 1)), name: 'Labor Day', federal: true },
    { date: iso(year, 10, nthWeekday(year, 10, 1, 2)), name: 'Indigenous Peoples’ Day / Columbus Day', federal: true },
    { date: iso(year, 10, 31), name: 'Halloween', federal: false },
    { date: iso(year, 11, 11), name: 'Veterans Day', federal: true },
    { date: iso(year, 11, nthWeekday(year, 11, 4, 4)), name: 'Thanksgiving', federal: true },
    { date: iso(year, 12, 24), name: 'Christmas Eve', federal: false },
    { date: iso(year, 12, 25), name: 'Christmas Day', federal: true },
    { date: iso(year, 12, 31), name: 'New Year’s Eve', federal: false },
  ];
  return list.sort((x, y) => x.date.localeCompare(y.date));
}

/** Holidays from `start` to `end` (YYYY-MM-DD, inclusive), by day */
export function holidaysBetween(start: string, end: string): Map<string, Holiday[]> {
  const map = new Map<string, Holiday[]>();
  const from = Number(start.slice(0, 4));
  const to = Number(end.slice(0, 4));
  if (!Number.isFinite(from) || !Number.isFinite(to)) return map;
  for (let year = from; year <= to; year++) {
    for (const h of usHolidays(year)) {
      if (h.date < start || h.date > end) continue;
      map.set(h.date, [...(map.get(h.date) ?? []), h]);
    }
  }
  return map;
}
