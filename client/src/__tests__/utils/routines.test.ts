import { describe, it, expect } from 'vitest';
import {
  activeRoutines, amountMinutes, describeDays, doneItemsOf, routineLinkKey, runsOn,
  sessionFields, sessionMinutes, sessionTitle, slotsOn, type Routine,
} from '@/utils/routines';

const text = (html: string) => html.replace(/<[^>]+>/g, '');

const yoga: Routine = {
  id: 7, name: 'Morning yoga', exerciseType: 'yoga', minutes: 20,
  items: [
    { id: 'a', name: 'Sun salutation', amount: '5 min' },
    { id: 'b', name: 'Pigeon', amount: '10 min' },
    { id: 'c', name: 'Twists', amount: '5 min' },
  ],
  days: [1, 3, 5], times: ['07:00'], trainingCategory: 'Core stability',
};

describe('routines', () => {
  it('reads minutes from amounts', () => {
    expect(amountMinutes('5 min')).toBe(5);
    expect(amountMinutes('1 hr')).toBe(60);
    expect(amountMinutes('90 sec')).toBe(1.5);
    expect(amountMinutes('3 × 10')).toBe(0);
  });

  it('builds active routines from entries, summing item minutes when no duration is typed', () => {
    const entries = [
      { id: 1, content: '<p>Legs</p>', metadata: { _taxonomyId: 9, _customFields: { routineName: 'Legs', items: [{ id: 'x', name: 'Squats', amount: '10 min' }, { id: 'y', name: 'Lunges', amount: '5 min' }], scheduleTimes: ['18:00'] } } },
      { id: 2, content: '<p>Old</p>', metadata: { _taxonomyId: 9, _customFields: { isActive: false, scheduleTimes: ['08:00'] } } },
      { id: 3, content: '<p>Other</p>', metadata: { _taxonomyId: 4, _customFields: {} } },
    ];
    const list = activeRoutines(entries, 9, text);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 1, name: 'Legs', minutes: 15, days: [], times: ['18:00'], exerciseType: 'yoga' });
  });

  it('places routines only on their days, sorted by time', () => {
    const legs: Routine = { ...yoga, id: 8, name: 'Legs', days: [], times: ['06:30', '18:00'] };
    // 2026-10-26 is a Monday, 2026-10-27 a Tuesday
    expect(runsOn(yoga, '2026-10-26')).toBe(true);
    expect(runsOn(yoga, '2026-10-27')).toBe(false);
    expect(slotsOn([yoga, legs], '2026-10-26').map(s => `${s.routine.name} ${s.time}`))
      .toEqual(['Legs 06:30', 'Morning yoga 07:00', 'Legs 18:00']);
    expect(slotsOn([yoga, legs], '2026-10-27')).toHaveLength(2);
    expect(slotsOn([yoga], '2026-10-26')[0].key).toBe(routineLinkKey(7, '2026-10-26', '07:00'));
  });

  it('describes days', () => {
    expect(describeDays([])).toBe('Every day');
    expect(describeDays([1, 2, 3, 4, 5])).toBe('Weekdays');
    expect(describeDays([6, 0])).toBe('Weekends');
    expect(describeDays([5, 1, 3])).toBe('Mon, Wed, Fri');
  });

  it('counts a partial session by the exercises done', () => {
    expect(sessionMinutes(yoga, ['a', 'b', 'c'])).toBe(20);
    expect(sessionMinutes(yoga, ['b'])).toBe(10);
    const untimed: Routine = { ...yoga, items: yoga.items.map(i => ({ ...i, amount: '3 × 10' })) };
    expect(sessionMinutes(untimed, ['a'])).toBe(7);
  });

  it('writes the session as Exercise fields with its category and a title', () => {
    const f = sessionFields(yoga, ['a'], '2026-10-26', '07:00');
    expect(f).toMatchObject({ exerciseType: 'yoga', duration: '5', performedDate: '2026-10-26', performedTime: '07:00', routineId: 7, routineItemsDone: ['a'], trainingCategory: 'Core stability' });
    expect(sessionTitle(yoga, f)).toBe('Morning yoga · Yoga · 5 min');
  });

  it('reads the exercises done back from a session (all when it holds no list)', () => {
    expect(doneItemsOf(yoga, { routineItemsDone: ['b', 'gone'] })).toEqual(['b']);
    expect(doneItemsOf(yoga, { routineItemsDone: [] })).toEqual(['a', 'b', 'c']);
    expect(doneItemsOf(yoga, undefined)).toEqual([]);
  });
});
