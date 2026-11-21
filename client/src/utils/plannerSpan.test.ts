import { describe, it, expect } from 'vitest';
import { plannerFacts, plannedDay, partEndOf, partsCovered, tasksByDay, unscheduled } from './planner.js';
import { calendarDayFor } from './calendarItems.js';

const TODAY = '2026-11-12';

describe('a deadline with a time of day puts a task on the planner', () => {
  it('shows on its deadline, in the part chosen', () => {
    const cf = { deadline: '2026-11-14', scheduledPart: 'noon' };
    expect(plannedDay(cf)).toBe('2026-11-14');
    const t = plannerFacts(1, cf, 0);
    expect(t).toMatchObject({ scheduled: '2026-11-14', part: 'noon', partEnd: 'noon', fromDeadline: true });
    expect(tasksByDay([t], ['2026-11-14'], TODAY, {}).get('2026-11-14')?.map(x => x.id)).toEqual([1]);
    expect(unscheduled([t], TODAY).open).toEqual([]);
  });

  it('a bare deadline plans nothing: the task stays in Unscheduled', () => {
    const t = plannerFacts(1, { deadline: '2026-11-14' }, 0);
    expect(t).toMatchObject({ scheduled: '', part: '', fromDeadline: false });
    expect(unscheduled([t], TODAY).open.map(x => x.id)).toEqual([1]);
    // a time of day that isn't one of the three counts as none
    expect(plannedDay({ deadline: '2026-11-14', scheduledPart: 'later' })).toBe('');
  });

  it('a planned day wins over the deadline', () => {
    const t = plannerFacts(1, { deadline: '2026-11-14', scheduledDate: '2026-11-13', scheduledPart: 'night' }, 0);
    expect(t).toMatchObject({ scheduled: '2026-11-13', part: 'night', fromDeadline: false });
  });

  it('the calendar puts it on the same day', () => {
    const entry = { id: 1, content: '', createdAt: new Date('2026-11-01'), updatedAt: new Date(), isEncrypted: true, metadata: { _customFields: { deadline: '2026-11-14', scheduledPart: 'morning' } } };
    expect(calendarDayFor(entry as never, 'Task', TODAY)).toBe('2026-11-14');
    const bare = { ...entry, metadata: { _customFields: { deadline: '2026-11-14' } } };
    expect(calendarDayFor(bare as never, 'Task', TODAY)).toBeNull();
  });
});

describe('a task stretched over more of the day', () => {
  it('covers from its part through its end', () => {
    expect(partsCovered('morning', 'night')).toEqual(['morning', 'noon', 'night']);
    expect(partsCovered('noon', 'night')).toEqual(['noon', 'night']);
    expect(partsCovered('noon')).toEqual(['noon']);
    // an end before its start is no stretch at all
    expect(partsCovered('night', 'morning')).toEqual(['night']);
    expect(partEndOf({ scheduledPart: 'night', scheduledPartEnd: 'morning' })).toBe('night');
    expect(partEndOf({ scheduledPart: 'morning', scheduledPartEnd: 'noon' })).toBe('noon');
    expect(partEndOf({ scheduledPart: 'morning', scheduledPartEnd: 'whenever' })).toBe('morning');
  });
});
