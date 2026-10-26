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

  it('leaves tasks, goals, milestones and journal entries off the calendar', () => {
    expect(calendarDayFor(entry({ deadline: '2026-10-20' }), 'Task')).toBeNull();
    expect(calendarDayFor(entry({ targetDate: '2026-10-20' }), 'Goal')).toBeNull();
    expect(calendarDayFor(entry({ targetDate: '2026-10-20' }), 'Milestone')).toBeNull();
    expect(calendarDayFor(entry({}), 'Journal')).toBeNull();
    expect(calendarDayFor(entry({}), undefined)).toBeNull();
  });
});
