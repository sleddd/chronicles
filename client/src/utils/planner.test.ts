import { describe, it, expect } from 'vitest';
import {
  plannerFacts, partOf, partOfTime, effectiveDay, hasMigrated, weekOf, parsePlannerOrder, tasksByDay, unscheduled, placeIn, movedOrder,
  weekLabel, laneLabel, longDayLabel, type PlannerTask,
} from './planner.js';

const TODAY = '2026-11-12'; // a Thursday
const task = (id: number, over: Partial<PlannerTask> = {}): PlannerTask => ({
  id, scheduled: '', done: false, autoMigrate: false, deadline: '', priority: 'none', created: id, ...over,
});

describe('planner', () => {
  it('reads a task’s facts from its fields', () => {
    expect(plannerFacts(3, { scheduledDate: '2026-11-13', isCompleted: true, isAutoMigrating: 1, deadline: 'x', priority: 'high' }, 9))
      .toEqual({ id: 3, created: 9, scheduled: '2026-11-13', part: 'morning', done: true, backlog: false, autoMigrate: true, deadline: '', priority: 'high' });
    expect(plannerFacts(1, undefined, 0).scheduled).toBe('');
    expect(plannerFacts(1, { scheduledDate: '2026-11-13', scheduledPart: 'noon' }, 0).part).toBe('noon');
    // No day, no part of it; with a day and no (or an unknown) part it sits under Morning
    expect(plannerFacts(1, { scheduledPart: 'noon' }, 0).part).toBe('');
    expect(partOf({ scheduledPart: 'dawn' })).toBe('morning');
    expect(partOf({})).toBe('morning');
    expect(['07:30', '12:00', '16:59', '17:00', '', 'x'].map(partOfTime)).toEqual(['morning', 'noon', 'noon', 'night', '', '']);
    expect(plannerFacts(1, { isBacklog: true }, 0).backlog).toBe(true);
    // Started or finished wins over the backlog flag
    expect(plannerFacts(1, { isBacklog: true, isInProgress: true }, 0).backlog).toBe(false);
  });

  it('rolls an unfinished auto-migrating task to today', () => {
    expect(effectiveDay(task(1, { scheduled: '2026-11-10', autoMigrate: true }), TODAY)).toBe(TODAY);
    expect(hasMigrated(task(1, { scheduled: '2026-11-10', autoMigrate: true }), TODAY)).toBe(true);
    expect(effectiveDay(task(1, { scheduled: '2026-11-10' }), TODAY)).toBe('2026-11-10');
    expect(effectiveDay(task(1, { scheduled: '2026-11-10', autoMigrate: true, done: true }), TODAY)).toBe('2026-11-10');
    expect(effectiveDay(task(1, { scheduled: '2026-11-20', autoMigrate: true }), TODAY)).toBe('2026-11-20');
    expect(effectiveDay(task(1), TODAY)).toBe('');
  });

  it('gives the Sunday to Saturday week', () => {
    expect(weekOf(TODAY)).toEqual(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']);
    expect(weekOf('2026-11-08')[0]).toBe('2026-11-08');
    expect(weekLabel(weekOf(TODAY))).toBe('Nov 8 – 14');
    expect(weekLabel(weekOf('2026-10-30'))).toBe('Oct 25 – 31');
    expect(weekLabel(weekOf('2026-11-30'))).toBe('Nov 29 – Dec 5');
    expect(laneLabel(TODAY)).toBe('Thu 12');
    expect(longDayLabel(TODAY)).toBe('Thursday, November 12');
  });

  it('keeps only a well-formed saved order', () => {
    expect(parsePlannerOrder(null)).toEqual({});
    expect(parsePlannerOrder({ '2026-11-12': [1, 'x', 2], nope: [3], '2026-11-13': [] })).toEqual({ '2026-11-12': [1, 2] });
  });

  it('lists each day in your order, then the rest by urgency', () => {
    const tasks = [
      task(1, { scheduled: TODAY }), task(2, { scheduled: TODAY, priority: 'urgent' }),
      task(3, { scheduled: TODAY, deadline: '2026-11-13' }), task(4, { scheduled: TODAY }),
      task(5, { scheduled: '2026-11-13' }), task(6, { scheduled: '2026-11-01', autoMigrate: true }), task(7),
    ];
    const map = tasksByDay(tasks, weekOf(TODAY), TODAY, { [TODAY]: [4, 1] });
    expect(map.get(TODAY)!.map(t => t.id)).toEqual([4, 1, 3, 2, 6]);
    expect(map.get('2026-11-13')!.map(t => t.id)).toEqual([5]);
    expect(map.get('2026-11-08')).toEqual([]);
  });

  it('splits what is not on a day into overdue and open', () => {
    const tasks = [
      task(1), task(2, { done: true }), task(3, { scheduled: '2026-11-10' }), task(4, { scheduled: '2026-11-09' }),
      task(5, { scheduled: '2026-11-09', autoMigrate: true }), task(6, { scheduled: '2026-11-09', done: true }),
      task(7, { priority: 'high' }), task(8, { scheduled: TODAY }),
      // Ideas kept for later are left out, with or without a day
      task(9, { backlog: true }), task(10, { backlog: true, scheduled: '2026-11-09' }),
    ];
    const u = unscheduled(tasks, TODAY);
    expect(u.overdue.map(t => t.id)).toEqual([4, 3]);
    expect(u.open.map(t => t.id)).toEqual([7, 1]);
  });

  it('places a card where it was dropped', () => {
    expect(placeIn([1, 2, 3], 9, 2)).toEqual([1, 9, 2, 3]);
    expect(placeIn([1, 2, 3], 9, null)).toEqual([1, 2, 3, 9]);
    expect(placeIn([1, 2, 3], 1, 3)).toEqual([2, 3, 1]);
    expect(placeIn([1, 2, 3], 3, 1)).toEqual([3, 1, 2]);
    expect(placeIn([1, 2, 3], 2, 2)).toEqual([1, 2, 3]);
    expect(placeIn([1, 2, 3], 1, null)).toEqual([2, 3, 1]);
  });

  it('moves a task between days and forgets old days', () => {
    const order = { '2026-11-11': [1, 2], [TODAY]: [3], '2026-08-01': [8] };
    expect(movedOrder(order, 2, TODAY, [3, 4], 3, TODAY)).toEqual({ '2026-11-11': [1], [TODAY]: [2, 3, 4] });
    expect(movedOrder(order, 3, '', [], null, TODAY)).toEqual({ '2026-11-11': [1, 2] });
  });
});
