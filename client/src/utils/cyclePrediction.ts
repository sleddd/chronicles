const DAY_MS = 86_400_000;
const DEFAULT_CYCLE_DAYS = 28;

export interface PeriodDay {
  /** YYYY-MM-DD */
  date: string;
  period: boolean;
}

export interface CyclePrediction {
  /** YYYY-MM-DD the next period is expected to start. */
  next: string;
  /** Average cycle length used (days) — 28 until two starts are logged. */
  cycleDays: number;
}

function toDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const noon = (day: string) => new Date(`${day}T12:00:00`).getTime();

/**
 * Next expected period start from logged check-in days. A start is a period
 * day whose previous logged day wasn't one; cycle length is the average gap
 * between starts (gaps of 60+ days are treated as missed logging and ignored),
 * falling back to 28 days. Null when no period day has been logged.
 */
export function predictNextPeriod(days: PeriodDay[]): CyclePrediction | null {
  const byDate = new Map<string, boolean>();
  for (const d of days) if (d.date) byDate.set(d.date, d.period);
  const sorted = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const starts: string[] = [];
  let inPeriod = false;
  for (const [date, period] of sorted) {
    if (period && !inPeriod) starts.push(date);
    inPeriod = period;
  }
  if (starts.length === 0) return null;

  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const gap = Math.round((noon(starts[i]) - noon(starts[i - 1])) / DAY_MS);
    if (gap > 0 && gap < 60) gaps.push(gap);
  }
  const cycleDays = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : DEFAULT_CYCLE_DAYS;
  return { next: toDay(noon(starts[starts.length - 1]) + cycleDays * DAY_MS), cycleDays };
}
