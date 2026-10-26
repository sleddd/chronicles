import { describe, it, expect } from 'vitest';
import { describeRepeat, occurrencesBetween, repeatRuleOf } from '@/utils/recurrence';

describe('repeatRuleOf', () => {
  it('reads the rule from the fields, and null when it does not repeat', () => {
    expect(repeatRuleOf({})).toBeNull();
    expect(repeatRuleOf({ repeat: '' })).toBeNull();
    expect(repeatRuleOf({ repeat: 'weekly', repeatEvery: '2', repeatDays: [4, 2, 2, 9], repeatUntil: '2026-12-31' }))
      .toEqual({ repeat: 'weekly', every: 2, days: [2, 4], until: '2026-12-31' });
    expect(repeatRuleOf({ repeat: 'daily', repeatEvery: '0', repeatUntil: 'soon' })).toEqual({ repeat: 'daily', every: 1, days: [], until: '' });
  });
});

describe('occurrencesBetween', () => {
  // 2026-10-06 is a Tuesday
  it('gives the start day alone when it does not repeat', () => {
    expect(occurrencesBetween('2026-10-06', null, '2026-10-01', '2026-10-31')).toEqual(['2026-10-06']);
    expect(occurrencesBetween('2026-09-06', null, '2026-10-01', '2026-10-31')).toEqual([]);
  });

  it('steps daily from the start, every N days', () => {
    expect(occurrencesBetween('2026-10-06', repeatRuleOf({ repeat: 'daily', repeatEvery: 3 }), '2026-10-01', '2026-10-15'))
      .toEqual(['2026-10-06', '2026-10-09', '2026-10-12', '2026-10-15']);
  });

  it('lands weekly on the chosen weekdays, every N weeks, never before the start', () => {
    const rule = repeatRuleOf({ repeat: 'weekly', repeatDays: [2, 4] });
    expect(occurrencesBetween('2026-10-08', rule, '2026-10-01', '2026-10-21')) // starts Thu
      .toEqual(['2026-10-08', '2026-10-13', '2026-10-15', '2026-10-20']);
    const fortnight = repeatRuleOf({ repeat: 'weekly', repeatEvery: 2 }); // the start's weekday
    expect(occurrencesBetween('2026-10-06', fortnight, '2026-11-01', '2026-11-30')).toEqual(['2026-11-03', '2026-11-17']);
  });

  it('keeps the day of the month, clamped to short months, and stops at the end date', () => {
    const rule = repeatRuleOf({ repeat: 'monthly', repeatUntil: '2027-03-15' });
    expect(occurrencesBetween('2026-10-31', rule, '2026-10-01', '2027-06-30'))
      .toEqual(['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
  });

  it('repeats yearly on the same day, Feb 29 on Feb 28 in other years', () => {
    expect(occurrencesBetween('2024-02-29', repeatRuleOf({ repeat: 'yearly' }), '2025-01-01', '2028-12-31'))
      .toEqual(['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
  });
});

describe('describeRepeat', () => {
  it('says how it repeats in a sentence', () => {
    expect(describeRepeat('2026-10-06', repeatRuleOf({ repeat: 'weekly', repeatDays: [2, 4], repeatUntil: '2026-12-31' })))
      .toBe('Every Tuesday and Thursday until Dec 31, 2026');
    expect(describeRepeat('2026-10-06', repeatRuleOf({ repeat: 'weekly', repeatEvery: 2 }))).toBe('Every 2 weeks on Tuesday');
    expect(describeRepeat('2026-10-22', repeatRuleOf({ repeat: 'monthly' }))).toBe('Every month on the 22nd');
    expect(describeRepeat('2026-10-06', repeatRuleOf({ repeat: 'yearly' }))).toBe('Every year on October 6');
    expect(describeRepeat('2026-10-06', repeatRuleOf({ repeat: 'daily', repeatEvery: 2 }))).toBe('Every 2 days');
  });
});
