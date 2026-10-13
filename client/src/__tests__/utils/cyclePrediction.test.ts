import { describe, it, expect } from 'vitest';
import { predictNextPeriod } from '../../utils/cyclePrediction.js';

const p = (date: string, period = true) => ({ date, period });

describe('predictNextPeriod', () => {
  it('is null when no period day is logged', () => {
    expect(predictNextPeriod([])).toBeNull();
    expect(predictNextPeriod([p('2026-10-01', false)])).toBeNull();
  });

  it('uses 28 days after a single logged start', () => {
    expect(predictNextPeriod([p('2026-10-01'), p('2026-10-02')])).toEqual({ next: '2026-10-29', cycleDays: 28 });
  });

  it('averages the gaps between starts', () => {
    const days = [
      p('2026-08-01'), p('2026-08-02'), p('2026-08-03', false),
      p('2026-08-31'), p('2026-09-01', false),
      p('2026-09-30'),
    ];
    // gaps 30 and 30 → next 30 days after Sep 30
    expect(predictNextPeriod(days)).toEqual({ next: '2026-10-30', cycleDays: 30 });
  });

  it('ignores gaps of 60+ days (missed logging)', () => {
    const days = [p('2026-01-01'), p('2026-01-02', false), p('2026-06-01'), p('2026-06-02', false), p('2026-06-27')];
    expect(predictNextPeriod(days)?.cycleDays).toBe(26);
  });

  it('counts consecutive logged period days as one start', () => {
    expect(predictNextPeriod([p('2026-10-01'), p('2026-10-02'), p('2026-10-03')])?.next).toBe('2026-10-29');
  });
});
