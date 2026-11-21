import { describe, it, expect } from 'vitest';
import { reminderDue, REMINDER_INTERVAL_MS, mentionsMedical } from '@/utils/chatDisclosure';

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

describe('mentionsMedical', () => {
  it('spots questions about symptoms, medications and care', () => {
    for (const t of ['I have a rash on my arm', 'Can I take Advil with this?', 'what does my blood test mean', 'Should I see a doctor about it?', 'side effects of my meds'])
      expect(mentionsMedical(t)).toBe(true);
  });
  it('leaves ordinary talk alone', () => {
    for (const t of ['What should I cook tonight?', 'Help me plan my week', 'I had a rough day at work', 'Plan a dinner with chicken'])
      expect(mentionsMedical(t)).toBe(false);
  });
});
