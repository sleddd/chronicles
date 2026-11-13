import { describe, it, expect } from 'vitest';
import {
  addDays, addMonths, timelineWindow, defaultStart, fractionOf, timelineTicks, windowLabel,
  barDates, barSpan, dragDays, draggedDates, openBarDays, shortDay, dayOf,
} from './planTimeline.js';

describe('planTimeline', () => {
  it('steps days and months', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-08', 7)).toBe('2026-03-15'); // across a clock change
    expect(addMonths('2026-11-12', 0)).toBe('2026-11-01');
    expect(addMonths('2026-11-12', 3)).toBe('2027-02-01');
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01');
  });

  it('builds whole-month windows', () => {
    const w = timelineWindow('quarter', '2026-10-17');
    expect(w).toEqual({ from: '2026-10-01', to: '2027-01-01', days: 92 });
    expect(timelineWindow('year', '2026-01-01').days).toBe(365);
    expect(defaultStart('quarter', '2026-11-12')).toBe('2026-11-01');
    expect(defaultStart('year', '2026-11-12')).toBe('2026-10-01');
    expect(defaultStart('years5', '2026-11-12')).toBe('2026-01-01');
  });

  it('places days as a fraction of the window', () => {
    const w = timelineWindow('quarter', '2026-10-01');
    expect(fractionOf('2026-10-01', w)).toBe(0);
    expect(fractionOf('2027-01-01', w)).toBe(1);
    expect(fractionOf('2026-09-30', w)).toBeLessThan(0);
  });

  it('labels a column per month, half years on five years', () => {
    const q = timelineTicks('quarter', timelineWindow('quarter', '2026-11-01'));
    expect(q.map(t => t.label)).toEqual(['Nov 2026', 'Dec', 'Jan 2027']);
    expect(q[2].year).toBe(true);
    expect(q.reduce((n, t) => n + t.width, 0)).toBeCloseTo(1);
    expect(timelineTicks('years5', timelineWindow('years5', '2026-01-01'))).toHaveLength(10);
  });

  it('names the window', () => {
    expect(windowLabel(timelineWindow('quarter', '2026-10-01'))).toBe('Oct – Dec 2026');
    expect(windowLabel(timelineWindow('quarter', '2026-11-01'))).toBe('Nov 2026 – Jan 2027');
  });

  it('reads a bar’s dates from the fields', () => {
    expect(barDates({ startOn: '2026-10-05', targetDate: '2026-12-01' }, '2026-09-01')).toEqual({ start: '2026-10-05', end: '2026-12-01' });
    expect(barDates({ targetDate: '2026-12-01' }, '2026-09-01')).toEqual({ start: '2026-09-01', end: '2026-12-01' });
    expect(barDates({ targetDate: '2026-08-01' }, '2026-09-01')).toEqual({ start: '2026-08-01', end: '2026-08-01' });
    expect(barDates({ startOn: 'soon', targetDate: 7 }, '2026-09-01')).toEqual({ start: '2026-09-01', end: '' });
    expect(dayOf('2026-02-31')).toBe('');
  });

  it('clips a bar to the window', () => {
    const w = timelineWindow('quarter', '2026-10-01');
    expect(barSpan({ start: '2026-10-01', end: '2026-12-31' }, w)).toEqual({ left: 0, width: 1, cutLeft: false, cutRight: false, open: false });
    const cut = barSpan({ start: '2026-09-01', end: '2027-02-01' }, w)!;
    expect(cut).toMatchObject({ left: 0, width: 1, cutLeft: true, cutRight: true });
    expect(barSpan({ start: '2026-01-01', end: '2026-09-30' }, w)).toBeNull();
    expect(barSpan({ start: '2027-01-01', end: '2027-02-01' }, w)).toBeNull();
    const open = barSpan({ start: '2026-10-01', end: '' }, w)!;
    expect(open.open).toBe(true);
    expect(open.width).toBeCloseTo(openBarDays(w) / w.days);
  });

  it('turns a drag into days and dates', () => {
    const w = timelineWindow('quarter', '2026-10-01');
    expect(dragDays(100, 920, w)).toBe(10);
    expect(dragDays(5, 0, w)).toBe(0);
    const d = { start: '2026-10-10', end: '2026-10-20' };
    expect(draggedDates(d, 0, 'move', w)).toBe(d);
    expect(draggedDates(d, 5, 'move', w)).toEqual({ start: '2026-10-15', end: '2026-10-25' });
    expect(draggedDates(d, 30, 'start', w)).toEqual({ start: '2026-10-20', end: '2026-10-20' });
    expect(draggedDates(d, -30, 'end', w)).toEqual({ start: '2026-10-10', end: '2026-10-10' });
    expect(draggedDates(d, 3, 'end', w)).toEqual({ start: '2026-10-10', end: '2026-10-23' });
    const open = { start: '2026-10-10', end: '' };
    expect(draggedDates(open, 5, 'move', w)).toEqual({ start: '2026-10-15', end: '' });
    expect(draggedDates(open, 7, 'end', w).end).toBe(addDays('2026-10-10', openBarDays(w) - 1 + 7));
  });

  it('formats a short day', () => {
    expect(shortDay('2026-03-14', '2026-11-12')).toBe('Mar 14');
    expect(shortDay('2027-03-04', '2026-11-12')).toBe('Mar 4, 2027');
    expect(shortDay('', '2026-11-12')).toBe('');
  });

  it('shows one month a week at a time', () => {
    const w = timelineWindow('month', defaultStart('month', '2026-11-12'));
    expect(w).toEqual({ from: '2026-11-01', to: '2026-12-01', days: 30 });
    expect(windowLabel(w)).toBe('November 2026');
    expect(timelineTicks('month', w).map(t => t.label)).toEqual(['Nov 1', '8', '15', '22', '29']);
    const last = timelineTicks('month', w).at(-1)!;
    expect(last.left + last.width).toBeCloseTo(1);
  });
});
