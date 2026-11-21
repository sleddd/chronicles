import { describe, it, expect } from 'vitest';
import {
  plannerFacts, hoursOf, hoursLabel, priorityIndex, layoutDay, timeOf, hhmm, partOf, partOfTime, effectiveDay, hasMigrated, weekOf, parsePlannerOrder, tasksByDay, unscheduled, placeIn, movedOrder,
  weekLabel, laneLabel, longDayLabel, estimateOf, estimateLabel, type PlannerTask,
} from './planner.js';

const TODAY = '2026-11-12'; // a Thursday
const task = (id: number, over: Partial<PlannerTask> = {}): PlannerTask => ({
  id, scheduled: '', done: false, autoMigrate: false, deadline: '', priority: 'none', created: id, hours: 1, ...over,
});

describe('planner', () => {
  it('reads a task’s facts from its fields', () => {
    expect(plannerFacts(3, { scheduledDate: '2026-11-13', isCompleted: true, isAutoMigrating: 1, deadline: 'x', priority: 'high' }, 9))
      .toEqual({ id: 3, created: 9, scheduled: '2026-11-13', part: 'morning', partEnd: 'morning', fromDeadline: false, done: true, backlog: false, autoMigrate: true, deadline: '', priority: 'high', hours: 1 });
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

  it('lists each day in your order, the rest landing among them by priority', () => {
    const tasks = [
      task(1, { scheduled: TODAY }), task(2, { scheduled: TODAY, priority: 'urgent' }),
      task(3, { scheduled: TODAY, deadline: '2026-11-13' }), task(4, { scheduled: TODAY }),
      task(5, { scheduled: '2026-11-13' }), task(6, { scheduled: '2026-11-01', autoMigrate: true }), task(7),
    ];
    const map = tasksByDay(tasks, weekOf(TODAY), TODAY, { [TODAY]: [4, 1] });
    // 2 is urgent, so it lands above the two you placed; the others (no priority) after them, the one with a deadline first
    expect(map.get(TODAY)!.map(t => t.id)).toEqual([2, 4, 1, 3, 6]);
    expect(map.get('2026-11-13')!.map(t => t.id)).toEqual([5]);
    expect(map.get('2026-11-08')).toEqual([]);
  });

  it('splits what is not on a day into overdue and open', () => {
    const tasks = [
      task(1), task(2, { done: true }), task(3, { scheduled: '2026-11-10' }), task(4, { scheduled: '2026-11-09' }),
      task(5, { scheduled: '2026-11-09', autoMigrate: true }), task(6, { scheduled: '2026-11-09', done: true }),
      task(7, { priority: 'high' }), task(8, { scheduled: TODAY }),
      // Ideas kept for later get a group of their own; one whose day has passed is overdue like any other
      task(9, { backlog: true }), task(10, { backlog: true, scheduled: '2026-11-09' }),
    ];
    const u = unscheduled(tasks, TODAY);
    expect(u.overdue.map(t => t.id)).toEqual([10, 4, 3]);
    expect(u.open.map(t => t.id)).toEqual([7, 1]);
    expect(u.ideas.map(t => t.id)).toEqual([9]);
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

  it('reads a task’s length in hours, in half-hour steps', () => {
    expect(hoursOf(undefined)).toBe(1);
    expect(hoursOf({ scheduledHours: 2.4 })).toBe(2.5);
    expect(hoursOf({ scheduledHours: 0.1 })).toBe(0.5);
    expect(hoursOf({ scheduledHours: 40 })).toBe(12);
    expect(hoursOf({ scheduledHours: 'x' })).toBe(1);
    expect(hoursLabel(0.5)).toBe('30 min');
    expect(hoursLabel(1)).toBe('1 h');
    expect(hoursLabel(2.5)).toBe('2 h 30');
  });

  it('lands a task by priority: before the first of a lower priority', () => {
    const list = [{ priority: 'urgent' }, { priority: 'high' }, { priority: 'low' }, { priority: 'none' }];
    expect(priorityIndex(list, 'high')).toBe(2);
    expect(priorityIndex(list, 'urgent')).toBe(1);
    expect(priorityIndex(list, 'none')).toBe(4);
    expect(priorityIndex([], 'low')).toBe(0);
  });

  it('lays a day out one task after another, around its events', () => {
    const at = layoutDay(
      [{ id: 1, hours: 1 }, { id: 2, hours: 2 }, { id: 3, hours: 0.5 }],
      [{ start: 10 * 60, end: 11 * 60 }],
      8 * 60,
    );
    expect(at.get(1)).toBe(8 * 60);        // 8:00 – 9:00
    expect(at.get(2)).toBe(11 * 60);       // wouldn't fit before the 10:00 event, so after it
    expect(at.get(3)).toBe(13 * 60);       // straight after
  });

  it('keeps a task dragged to a time there, and lays the rest out around it', () => {
    const at = layoutDay(
      [{ id: 1, hours: 1 }, { id: 2, hours: 1, at: 9 * 60 }, { id: 3, hours: 1 }],
      [],
      8 * 60,
    );
    expect(at.get(2)).toBe(9 * 60);        // its own time
    expect(at.get(1)).toBe(8 * 60);        // 8:00 – 9:00, before it
    expect(at.get(3)).toBe(10 * 60);       // after it, not over it
  });

  it('reads a task’s own time and writes minutes back as HH:MM', () => {
    expect(timeOf({ scheduledTime: '14:30' })).toBe(14 * 60 + 30);
    expect(timeOf({ scheduledTime: '' })).toBeUndefined();
    expect(timeOf({ scheduledTime: '25:00' })).toBeUndefined();
    expect(hhmm(9 * 60 + 5)).toBe('09:05');
    expect(plannerFacts(1, { scheduledDate: '2026-11-17', scheduledTime: '10:00' }, 0).at).toBe(600);
    expect(plannerFacts(1, { scheduledTime: '10:00' }, 0).at).toBeUndefined(); // no day, no time
  });
});
describe('a same-day end time sets the length', () => {
  it('4:10 to 4:15 is five minutes, to the minute', async () => {
    const { hoursOf } = await import('./planner.js');
    expect(hoursOf({ scheduledDate: '2026-11-18', scheduledTime: '16:10', deadlineTime: '16:15' }) * 60).toBeCloseTo(5);
    // An end on another day doesn't count — the task's own length (or an hour) stands
    expect(hoursOf({ scheduledDate: '2026-11-18', scheduledTime: '16:10', deadline: '2026-11-20', deadlineTime: '16:15' })).toBe(1);
  });
  it('moving or stretching keeps the end time in step', async () => {
    const { startPatch, lengthPatch } = await import('./planner.js');
    const cf = { scheduledDate: '2026-11-18', scheduledTime: '16:10', deadlineTime: '16:15' };
    expect(startPatch(cf, 9 * 60)).toMatchObject({ scheduledTime: '09:00', deadlineTime: '09:05' });
    expect(lengthPatch(cf, 1.5)).toMatchObject({ scheduledHours: 1.5, deadlineTime: '17:40' });
    // No end time: only the length changes
    expect(lengthPatch({ scheduledTime: '16:10' }, 2)).not.toHaveProperty('deadlineTime');
  });
});

describe('the month view', () => {
  it('lists whole weeks around the month, Sunday first', async () => {
    const { monthGridOf } = await import('./planner.js');
    const grid = monthGridOf('2026-11-19');
    expect(grid[0]).toBe('2026-11-01'); // Nov 1, 2026 is a Sunday
    expect(grid[grid.length - 1]).toBe('2026-12-05');
    expect(grid).toHaveLength(35);
    const oct = monthGridOf('2026-10-07');
    expect(oct[0]).toBe('2026-09-27');
    expect(oct[oct.length - 1]).toBe('2026-10-31');
  });

  it('steps a month at a time, across years, and names the month', async () => {
    const { addMonths, monthLabel } = await import('./planner.js');
    expect(addMonths('2026-12-31', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-01');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-01');
    expect(monthLabel('2026-11-19')).toBe('November 2026');
  });
});

describe('estimated time', () => {
  it('reads an estimate, ignoring anything odd', () => {
    expect(estimateOf({ estimatedMinutes: 90 })).toBe(90);
    expect(estimateOf({ estimatedMinutes: '45' })).toBe(45);
    expect(estimateOf({ estimatedMinutes: -5 })).toBeUndefined();
    expect(estimateOf({})).toBeUndefined();
  });
  it('writes it plainly', () => {
    expect(estimateLabel(15)).toBe('15 min');
    expect(estimateLabel(90)).toBe('1 h 30 min');
    expect(estimateLabel(360)).toBe('6 h');
    expect(estimateLabel(960)).toBe('2 days');
  });
  it('sizes a task on the planner until it has a length of its own', () => {
    expect(hoursOf({ estimatedMinutes: 120 })).toBe(2);
    expect(hoursOf({ estimatedMinutes: 20 })).toBe(0.5);
    expect(hoursOf({ estimatedMinutes: 120, scheduledHours: 3 })).toBe(3);
    expect(hoursOf({})).toBe(1);
  });
});
