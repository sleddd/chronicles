import { describe, it, expect } from 'vitest';
import type { DecryptedPost } from '@shared/crypto/types';
import { calendarDayFor } from '@/utils/calendarItems';

const entry = (cf: Record<string, unknown>): DecryptedPost => ({
  id: 1, content: '', metadata: { _customFields: cf }, isEncrypted: true,
  createdAt: new Date(2026, 9, 3, 12), updatedAt: new Date(2026, 9, 3, 12),
});

describe('calendarDayFor', () => {
  it('puts events and meetings on their start day, else the day written', () => {
    expect(calendarDayFor(entry({ startDate: '2026-10-20' }), 'Event')).toBe('2026-10-20');
    expect(calendarDayFor(entry({ startDate: '2026-10-21T09:00' }), 'Meeting')).toBe('2026-10-21');
    expect(calendarDayFor(entry({}), 'Event')).toBe('2026-10-03');
  });

  it('puts a task on the day it is planned for, and only then', () => {
    expect(calendarDayFor(entry({ scheduledDate: '2026-10-20' }), 'Task', '2026-10-10')).toBe('2026-10-20');
    expect(calendarDayFor(entry({ deadline: '2026-10-20' }), 'Task')).toBeNull();
    // An unfinished one set to move on shows under today once its day has passed
    expect(calendarDayFor(entry({ scheduledDate: '2026-10-05', isAutoMigrating: true }), 'Task', '2026-10-10')).toBe('2026-10-10');
    expect(calendarDayFor(entry({ scheduledDate: '2026-10-05', isAutoMigrating: true, isCompleted: true }), 'Task', '2026-10-10')).toBe('2026-10-05');
    expect(calendarDayFor(entry({ scheduledDate: '2026-10-05' }), 'Task', '2026-10-10')).toBe('2026-10-05');
  });

  it('leaves goals, milestones and journal entries off the calendar', () => {
    expect(calendarDayFor(entry({ targetDate: '2026-10-20' }), 'Goal')).toBeNull();
    expect(calendarDayFor(entry({ targetDate: '2026-10-20' }), 'Milestone')).toBeNull();
    expect(calendarDayFor(entry({}), 'Journal')).toBeNull();
    expect(calendarDayFor(entry({}), undefined)).toBeNull();
  });
});
