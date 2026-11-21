import { useEffect, useMemo, useState } from 'react';
import { toDateStr } from '../utils/dateUtils.js';
import { DAILY_QUOTES, quoteAt, quotePlaceFor, quotePool, settleQuotePlace, type Quote, type QuotePlace } from '../utils/dailyQuote.js';

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

const BUILT_IN = new Set(DAILY_QUOTES.map(q => q.text));

/**
 * The place is kept in localStorage, which outlives the session and isn't
 * encrypted: the quote's text goes with it only when it is one of the app's
 * own. One of the person's quotes comes from their encrypted entries and is
 * kept in memory alone (a reload after the pool changed may then land on
 * another quote that day).
 */
function savePlace(place: QuotePlace): void {
  const { text, ...rest } = place;
  const stored = text !== undefined && BUILT_IN.has(text) ? place : rest;
  try { localStorage.setItem(PLACE_KEY, JSON.stringify(stored)); } catch { /* the quote just won't be remembered */ }
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
