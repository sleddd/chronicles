import { useEffect, useMemo, useState } from 'react';
import { toDateStr } from '../utils/dateUtils.js';
import { quoteAt, quotePlaceFor, quotePool, settleQuotePlace, type Quote, type QuotePlace } from '../utils/dailyQuote.js';

/*
 * The dashboard's daily quote: which quote shows today and stepping to the
 * previous / next one. Where this browser is in the year's quotes is kept per
 * browser (like the other view choices), so a new day moves one on from the
 * last quote shown.
 */

const PLACE_KEY = 'daily-quote-v1';

function loadPlace(): QuotePlace | null {
  try {
    const v = JSON.parse(localStorage.getItem(PLACE_KEY) ?? 'null') as QuotePlace | null;
    if (!v || typeof v.day !== 'string' || !Number.isFinite(v.pos)) return null;
    return { day: v.day, pos: v.pos, ...(typeof v.text === 'string' ? { text: v.text } : {}) };
  } catch { return null; }
}

function savePlace(place: QuotePlace): void {
  try { localStorage.setItem(PLACE_KEY, JSON.stringify(place)); } catch { /* the quote just won't be remembered */ }
}

export function useDailyQuote(now: Date, mine: Quote[], ready: boolean): {
  quote: Quote;
  /** How many quotes there are to step through */
  count: number;
  step: (by: number) => void;
} {
  const year = now.getFullYear();
  const today = toDateStr(now);
  // `now` ticks every minute; the pool only changes with the year or the person's own quotes
  const pool = useMemo(() => quotePool(new Date(year, 0, 1), mine), [year, mine]);
  const [place, setPlace] = useState<QuotePlace>(() => quotePlaceFor(today, now, loadPlace()));

  // A new day moves on one from where this browser left off
  useEffect(() => {
    setPlace(p => (p.day === today ? p : quotePlaceFor(today, new Date(), p)));
  }, [today]);

  // Once the person's own quotes are in: keep showing the same quote when the
  // pool changes under it (a quote added or removed reshuffles the order)
  useEffect(() => {
    if (ready) setPlace(p => settleQuotePlace(pool, p));
  }, [ready, pool, place.day, place.pos]);

  useEffect(() => { savePlace(place); }, [place]);

  const step = (by: number) => setPlace(p => {
    const pos = p.pos + by;
    return { ...p, pos, text: quoteAt(pool, pos).text };
  });

  return { quote: quoteAt(pool, place.pos), count: pool.length, step };
}
