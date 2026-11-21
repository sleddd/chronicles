import { describe, it, expect } from 'vitest';
import { eventCells, clockTime } from '@/utils/eventRow';

describe('event rows on a topic page', () => {
  it('formats times', () => {
    expect(clockTime('19:30')).toBe('7:30 PM');
    expect(clockTime('00:05')).toBe('12:05 AM');
    expect(clockTime('12:00')).toBe('12:00 PM');
    expect(clockTime('soon')).toBe('');
  });
  it('starts, ends the same day, and venue', () => {
    expect(eventCells({ startDate: '2026-11-23', startTime: '19:00', endDate: '2026-11-23', endTime: '21:00', location: 'Town hall' }, '2026-11-21'))
      .toEqual({ starts: 'Nov 23 · 7:00 PM', ends: '9:00 PM', venue: 'Town hall' });
  });
  it('ends another day, all day, and nothing set', () => {
    expect(eventCells({ startDate: '2026-12-30', startTime: '20:00', endDate: '2027-01-01', endTime: '01:00' }, '2026-11-21'))
      .toEqual({ starts: 'Dec 30 · 8:00 PM', ends: 'Jan 1, 2027 · 1:00 AM', venue: '' });
    expect(eventCells({ startDate: '2026-11-25', allDay: true, startTime: '09:00' }, '2026-11-21').starts).toBe('Nov 25 · All day');
    expect(eventCells(undefined, '2026-11-21')).toEqual({ starts: '', ends: '', venue: '' });
  });
});
