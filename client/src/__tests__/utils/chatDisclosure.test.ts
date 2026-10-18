import { describe, it, expect } from 'vitest';
import { reminderDue, REMINDER_INTERVAL_MS } from '@/utils/chatDisclosure';

describe('reminderDue', () => {
  const start = 1_000_000;
  it('is not due before three hours', () => {
    expect(reminderDue(start, start)).toBe(false);
    expect(reminderDue(start, start + REMINDER_INTERVAL_MS - 1)).toBe(false);
  });
  it('is due at and after three hours', () => {
    expect(reminderDue(start, start + REMINDER_INTERVAL_MS)).toBe(true);
    expect(reminderDue(start, start + REMINDER_INTERVAL_MS * 2)).toBe(true);
  });
});
