import { describe, it, expect } from 'vitest';
import { dueNote, goalPercent, plannedText, shortDay } from './planTable.js';

const TODAY = '2026-11-21';

describe('planTable', () => {
  it('reads a deadline against today', () => {
    expect(dueNote('2026-11-09', TODAY, false)).toEqual({ text: '12 days late', tone: 'late' });
    expect(dueNote('2026-11-20', TODAY, false)).toEqual({ text: '1 day late', tone: 'late' });
    expect(dueNote(TODAY, TODAY, false)).toEqual({ text: 'today', tone: 'soon' });
    expect(dueNote('2026-11-27', TODAY, false)).toEqual({ text: 'in 6 days', tone: 'soon' });
    expect(dueNote('2026-12-01', TODAY, false)).toEqual({ text: 'in 10 days', tone: 'later' });
    expect(dueNote('2026-12-15', TODAY, false)).toEqual({ text: 'in 3 wk', tone: 'later' });
    expect(dueNote('2027-02-28', TODAY, false)).toEqual({ text: 'in 3 mo', tone: 'later' });
    expect(dueNote('2026-11-09', TODAY, true)).toEqual({ text: 'done', tone: 'done' });
  });

  it('names a planned day', () => {
    expect(plannedText(TODAY, TODAY, false)).toEqual({ text: 'Today', today: true });
    expect(plannedText('2026-11-23', TODAY, false).text).toBe('Mon, Nov 23');
    expect(plannedText('2026-11-19', TODAY, true).text).toBe('Nov 19');
    expect(shortDay('2027-01-15', TODAY)).toBe('Jan 15, 2027');
  });

  it('counts a goal by its tasks, else its milestones, and 100 once achieved', () => {
    const done = { done: true };
    const open = { done: false };
    expect(goalPercent(false, [done, open, open, open], [done, open])).toBe(25);
    expect(goalPercent(false, [], [done, open])).toBe(50);
    expect(goalPercent(false, [], [])).toBe(0);
    expect(goalPercent(true, [open], [])).toBe(100);
  });
});
