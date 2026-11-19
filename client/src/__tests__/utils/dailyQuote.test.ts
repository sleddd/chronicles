import { describe, it, expect } from 'vitest';
import { DAILY_QUOTES, dailyQuote, parseQuoteText, quotePool, quotePlaceFor, quoteAt } from '@/utils/dailyQuote';

describe('parseQuoteText', () => {
  it('reads the quote and author from what the Quotes topic writes', () => {
    expect(parseQuoteText('“You do not rise to the level of your goals.” — James Clear'))
      .toEqual({ text: 'You do not rise to the level of your goals.', author: 'James Clear' });
    expect(parseQuoteText('"The best way to predict the future is to invent it." — Alan Kay'))
      .toEqual({ text: 'The best way to predict the future is to invent it.', author: 'Alan Kay' });
  });

  it('takes a plain line with a dash, a quote alone, and nothing', () => {
    expect(parseQuoteText('Stay hungry, stay foolish - Stewart Brand')).toEqual({ text: 'Stay hungry, stay foolish', author: 'Stewart Brand' });
    expect(parseQuoteText('  Be here now. ')).toEqual({ text: 'Be here now.', author: '' });
    expect(parseQuoteText('   ')).toBeNull();
  });

  it('reads the fields summary', () => {
    expect(parseQuoteText('Quote: If you look at what you have, you’ll always have more. · Author: Oprah Winfrey'))
      .toEqual({ text: 'If you look at what you have, you’ll always have more.', author: 'Oprah Winfrey' });
    expect(parseQuoteText('Be kind · Author: Unknown')).toEqual({ text: 'Be kind', author: 'Unknown' });
  });

  it('keeps a dash inside the quote', () => {
    expect(parseQuoteText('“Well-behaved women seldom make history.” — Laurel Thatcher Ulrich'))
      .toEqual({ text: 'Well-behaved women seldom make history.', author: 'Laurel Thatcher Ulrich' });
  });
});

describe('dailyQuote', () => {
  const mine = [{ text: 'A', author: 'Me' }, { text: 'B', author: '' }];
  const day = (n: number) => new Date(2026, 0, n, 12); // day of year n

  it('mixes your quotes in with the built-in ones, the same all day', () => {
    const year = Array.from({ length: DAILY_QUOTES.length + mine.length }, (_, i) => dailyQuote(day(i + 1), mine));
    expect(new Set(year).size).toBe(year.length); // every quote once per round
    expect(year).toEqual(expect.arrayContaining(mine));
    expect(dailyQuote(new Date(2026, 0, 5, 8), mine)).toBe(dailyQuote(new Date(2026, 0, 5, 22), mine));
    // Shuffled, not your quotes first
    expect(year.slice(0, 2)).not.toEqual(mine);
  });

  it('uses only the built-in list without quotes of your own', () => {
    expect(DAILY_QUOTES).toContain(dailyQuote(day(2)));
  });
});

describe('quote rotation', () => {
  const now = new Date(2026, 10, 19, 9);

  it('mixes your quotes into the pool once each, dropping repeats', () => {
    const mine = [
      { text: 'Be here now.', author: 'Ram Dass' },
      { text: 'Be here now', author: 'Ram Dass' },
      { text: DAILY_QUOTES[0].text, author: DAILY_QUOTES[0].author },
    ];
    const pool = quotePool(now, mine);
    expect(pool).toHaveLength(DAILY_QUOTES.length + 1);
    expect(pool.filter(q => q.text.startsWith('Be here now'))).toHaveLength(1);
  });

  it('keeps the same place all day and moves one on the next day', () => {
    const saved = { day: '2026-11-19', pos: 40 };
    expect(quotePlaceFor('2026-11-19', now, saved)).toEqual(saved);
    expect(quotePlaceFor('2026-11-20', new Date(2026, 10, 20, 9), saved)).toEqual({ day: '2026-11-20', pos: 41 });
  });

  it('starts at the day of the year with nothing saved', () => {
    expect(quotePlaceFor('2026-11-19', now, null).pos).toBe(323);
  });

  it('goes round the pool both ways, so Next and Previous never run out', () => {
    const pool = quotePool(now);
    expect(quoteAt(pool, pool.length)).toBe(pool[0]);
    expect(quoteAt(pool, -1)).toBe(pool[pool.length - 1]);
  });

  it('shows a different quote on each of a run of days', () => {
    const pool = quotePool(now);
    const seen = new Set(Array.from({ length: pool.length }, (_, i) => quoteAt(pool, 323 + i).text));
    expect(seen.size).toBe(pool.length);
  });
});
