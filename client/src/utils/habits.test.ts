import { describe, it, expect } from 'vitest';
import {
  habitFrom, parseHabitLog, firstLoggedDay, loggedOn, withCount, withoutHabit, countFrom,
  isDueOn, dayTarget, weekTarget, nextCount, weekProgress, streakWeeks, habitTotals, countSeries, dayCells,
  describeTarget, habitCsvRows, daysIn, type Habit, type HabitLog,
} from './habits.js';
import { weekOf } from './planner.js';

const TODAY = '2026-11-12'; // Thursday; its week is Nov 8 – 14
const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 7, name: 'Balance board', target: 3, period: 'week', days: [], category: '', goalId: null, active: true, ...over,
});
const logOf = (id: number, days: Record<string, number>): HabitLog =>
  Object.entries(days).reduce((log, [day, n]) => withCount(log, id, day, n), {} as HabitLog);

describe('habits', () => {
  it('reads a habit from its fields', () => {
    const h = habitFrom(7, { habitName: ' Read ', targetCount: '2', targetPeriod: 'week', days: [3, 1, 1, 9], parentGoalId: 4, isActive: false }, 'x', new Map([[4, 'Growth']]));
    expect(h).toMatchObject({ id: 7, name: 'Read', target: 2, period: 'week', days: [1, 3], goalId: 4, category: 'Growth', active: false });
    expect(habitFrom(1, undefined, 'From the text')).toMatchObject({ name: 'From the text', target: 1, period: 'day', days: [], active: true });
    expect(habitFrom(1, { habitCategory: 'Home', parentGoalId: 4 }, '', new Map([[4, 'Growth']])).category).toBe('Home');
    expect(habitFrom(1, { targetCount: 900 }, '').target).toBe(35);
  });

  it('keeps a compact log and reads it back', () => {
    let log = withCount({}, 7, '2026-11-03', 1);
    log = withCount(log, 7, '2026-11-12', 12);
    expect(log).toEqual({ '7': { '2026-11': '00100000000c' } });
    expect(loggedOn(log, 7, '2026-11-12')).toBe(12);
    expect(loggedOn(log, 7, '2026-11-04')).toBe(0);
    expect(loggedOn(log, 8, '2026-11-12')).toBe(0);
    expect(withCount(log, 7, '2026-11-12', 12)).toBe(log);
    log = withCount(log, 7, '2026-11-12', 0);
    expect(log).toEqual({ '7': { '2026-11': '001' } });
    expect(withCount(log, 7, '2026-11-03', 0)).toEqual({});
    expect(withCount({}, 7, 'nope', 1)).toEqual({});
    expect(withCount({}, 7, '2026-11-01', 99)).toEqual({ '7': { '2026-11': 'z' } });
  });

  it('finds the first day a habit was ever ticked', () => {
    expect(firstLoggedDay(logOf(7, { '2026-11-09': 1, '2026-10-30': 2, '2027-01-02': 1 }), 7)).toBe('2026-10-30');
    expect(firstLoggedDay({}, 7)).toBe('');
  });

  it('drops a deleted habit and a malformed log', () => {
    const log = logOf(7, { [TODAY]: 1 });
    expect(withoutHabit(log, 7)).toEqual({});
    expect(withoutHabit(log, 8)).toBe(log);
    expect(parseHabitLog({ '7': { '2026-11': '01', bad: '1', '2026-12': 5 }, x: {}, '9': [] })).toEqual({ '7': { '2026-11': '01' } });
    expect(parseHabitLog('no')).toEqual({});
  });

  it('knows when a habit is due and what full means', () => {
    const mwf = habit({ period: 'day', target: 2, days: [1, 3, 5] });
    expect(isDueOn(mwf, '2026-11-11')).toBe(true); // Wednesday
    expect(isDueOn(mwf, TODAY)).toBe(false);
    expect(isDueOn(habit(), TODAY)).toBe(true);
    expect(dayTarget(mwf)).toBe(2);
    expect(dayTarget(habit())).toBe(1);
    expect(weekTarget(mwf)).toBe(6);
    expect(weekTarget(habit({ period: 'day', target: 1 }))).toBe(7);
    expect(weekTarget(habit())).toBe(3);
    expect([0, 1, 2].map(n => nextCount(mwf, n))).toEqual([1, 2, 0]);
  });

  it('meets a week whichever days it took', () => {
    const count = countFrom(logOf(7, { '2026-11-08': 1, '2026-11-09': 1, '2026-11-14': 1 }));
    expect(weekProgress(habit(), weekOf(TODAY), count)).toEqual({ done: 3, target: 3, met: true });
    expect(weekProgress(habit({ target: 4 }), weekOf(TODAY), count).met).toBe(false);
  });

  it('counts a streak of met weeks, never broken by this unfinished week', () => {
    const full = (sunday: string) => ({ [sunday]: 1, [weekOf(sunday)[1]]: 1, [weekOf(sunday)[2]]: 1 });
    const two = countFrom(logOf(7, { ...full('2026-11-01'), ...full('2026-10-25'), '2026-11-09': 1 }));
    expect(streakWeeks(habit(), TODAY, two)).toBe(2);
    const three = countFrom(logOf(7, { ...full('2026-11-01'), ...full('2026-10-25'), ...full('2026-11-08') }));
    expect(streakWeeks(habit(), TODAY, three)).toBe(3);
    const gap = countFrom(logOf(7, { ...full('2026-10-25') }));
    expect(streakWeeks(habit(), TODAY, gap)).toBe(0);
  });

  it('totals a range up to today', () => {
    const count = countFrom(logOf(7, { '2026-11-02': 1, '2026-11-03': 2, '2026-11-04': 1, '2026-11-10': 1, '2026-11-20': 5 }));
    expect(habitTotals(habit(), { from: '2026-11-01', to: '2026-11-30' }, TODAY, count)).toEqual({ times: 5, days: 4, weeksMet: 1, weeks: 2 });
  });

  it('charts by day, week or month depending on the range', () => {
    const count = countFrom(logOf(7, { '2026-11-02': 1, '2026-11-03': 2, '2026-10-05': 1 }));
    const month = countSeries(habit(), { from: '2026-11-01', to: '2026-11-30' }, count);
    expect(month.unit).toBe('day');
    expect(month.values.slice(0, 3)).toEqual([0, 1, 2]);
    expect(month.labels[0]).toBe('Nov 1');
    expect(month.target).toBeUndefined();
    const quarter = countSeries(habit(), { from: '2026-09-01', to: '2026-11-30' }, count);
    expect(quarter.unit).toBe('week');
    expect(quarter.target).toBe(3);
    expect(quarter.values.reduce((a, b) => a + b, 0)).toBe(4);
    const year = countSeries(habit(), { from: '2026-01-01', to: '2026-12-31' }, count);
    expect(year.unit).toBe('month');
    expect(year.labels).toHaveLength(12);
    expect(year.values[10]).toBe(3);
    expect(countSeries(habit({ period: 'day', target: 3 }), { from: '2026-11-01', to: '2026-11-07' }, count).target).toBe(3);
  });

  it('marks each day of a range', () => {
    const daily = habit({ period: 'day', target: 2, days: [1, 2, 3, 4, 5] });
    const count = countFrom(logOf(7, { '2026-11-09': 2, '2026-11-10': 1 }));
    expect(dayCells(daily, { from: '2026-11-08', to: '2026-11-14' }, TODAY, count))
      .toEqual(['off', 'full', 'part', 'missed', 'missed', 'ahead', 'ahead']);
    // A weekly habit has no missed days
    expect(dayCells(habit(), { from: '2026-11-11', to: '2026-11-12' }, TODAY, count)).toEqual(['off', 'off']);
    expect(daysIn({ from: '2026-11-12', to: '2026-11-10' })).toEqual([]);
  });

  it('describes a target and exports rows', () => {
    const days = (d: number[]) => d.join('+');
    expect(describeTarget(habit(), days)).toBe('3 times a week');
    expect(describeTarget(habit({ period: 'day', target: 2 }), days)).toBe('Twice a day');
    expect(describeTarget(habit({ period: 'day', target: 1, days: [1, 3] }), days)).toBe('Once a day on 1+3');
    const count = countFrom(logOf(7, { '2026-11-02': 2 }));
    expect(habitCsvRows([habit()], { from: '2026-11-01', to: '2026-11-03' }, count)).toEqual([['2026-11-02', 'Balance board', '2']]);
  });
});
