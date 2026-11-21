import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDailyQuote } from '@/hooks/useDailyQuote';
import { DAILY_QUOTES } from '@/utils/dailyQuote';

// localStorage outlives the session and isn't encrypted: a quote from the
// person's own entries must never be written there
describe('useDailyQuote storage', () => {
  beforeEach(() => localStorage.clear());

  it('never stores the text of one of your own quotes', () => {
    const mine = [{ text: 'A private line from my own journal', author: 'Me' }];
    // Only my quote plus the built-ins: step through every place, so mine is shown at some point
    const { result } = renderHook(() => useDailyQuote(new Date(2026, 10, 21), mine, true));
    for (let i = 0; i < result.current.count; i++) {
      act(() => result.current.step(1));
      expect(localStorage.getItem('daily-quote-v1') ?? '').not.toContain('private line');
    }
  });

  it('still remembers a built-in quote', () => {
    renderHook(() => useDailyQuote(new Date(2026, 10, 21), [], true));
    const stored = JSON.parse(localStorage.getItem('daily-quote-v1') ?? '{}') as { text?: string };
    expect(DAILY_QUOTES.some(q => q.text === stored.text)).toBe(true);
  });
});
