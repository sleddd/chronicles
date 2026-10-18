import { prisma } from './prisma.js';
import type { CrisisRating, RiskKind } from '@chronicles/shared';

/* App analytics — kept apart from accounts on purpose. A row says only that
   something happened on a day: no account id, no IP, no time of day, no
   content, so it can never be traced back to a person. Values are allowlisted
   by CHECK constraints as well as by the route's validation. */

export async function initAnalyticsTable(): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS public.app_analytics (
      id         SERIAL PRIMARY KEY,
      day        DATE NOT NULL DEFAULT CURRENT_DATE,
      event      TEXT NOT NULL CHECK (event IN ('crisis_card_shown')),
      rating     TEXT CHECK (rating IN ('concern', 'elevated', 'urgent')),
      risk_kind  TEXT CHECK (risk_kind IN ('suicide', 'self_harm', 'eating_disorder'))
    )
  `;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS app_analytics_day_idx ON public.app_analytics (day)`;
}

/** Record that the crisis card was shown. The day is the server's, never the client's. */
export async function recordCrisisCard(rating: CrisisRating, kind: RiskKind | null): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO public.app_analytics (event, rating, risk_kind)
    VALUES ('crisis_card_shown', ${rating}, ${kind})
  `;
}

export interface CrisisCount { rating: string; riskKind: string; count: number }

/** Crisis-card counts by rating and kind between two days (inclusive) — for a report on request. */
export async function countCrisisCards(from: string, to: string): Promise<CrisisCount[]> {
  const rows = await prisma.$queryRaw<{ rating: string; risk_kind: string | null; count: bigint }[]>`
    SELECT rating, risk_kind, COUNT(*) AS count
    FROM public.app_analytics
    WHERE event = 'crisis_card_shown' AND day BETWEEN ${from}::date AND ${to}::date
    GROUP BY rating, risk_kind
    ORDER BY rating, risk_kind
  `;
  return rows.map(r => ({ rating: r.rating, riskKind: r.risk_kind ?? 'unknown', count: Number(r.count) }));
}
