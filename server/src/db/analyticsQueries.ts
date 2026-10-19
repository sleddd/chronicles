import { prisma } from './prisma.js';
import type { CrisisRating, RiskKind } from '@chronicles/shared';

/* App analytics — kept apart from accounts on purpose. A row says only that
   something happened on a day: no account id, no IP, no time of day, no
   content, so it can never be traced back to a person. Values are allowlisted
   by CHECK constraints as well as by the route's validation. */

export async function initAnalyticsTable(): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS public.app_analytics (
      day        DATE NOT NULL DEFAULT CURRENT_DATE,
      event      TEXT NOT NULL,
      rating     TEXT CHECK (rating IN ('concern', 'elevated', 'urgent')),
      risk_kind  TEXT CHECK (risk_kind IN ('suicide', 'self_harm', 'eating_disorder'))
    )
  `;
  // No row id: a sequential one kept the order rows were written in, which
  // with request logs could tie a row back to a person
  await prisma.$executeRaw`ALTER TABLE public.app_analytics DROP COLUMN IF EXISTS id`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS app_analytics_day_idx ON public.app_analytics (day)`;
  // The allowed events, (re)applied so tables made before an event was added accept it
  await prisma.$executeRaw`ALTER TABLE public.app_analytics DROP CONSTRAINT IF EXISTS app_analytics_event_check`;
  await prisma.$executeRaw`
    ALTER TABLE public.app_analytics ADD CONSTRAINT app_analytics_event_check
    CHECK (event IN ('crisis_card_shown', 'minor_detected'))
  `;
}

/** Record that the crisis card was shown. The day is the server's, never the client's. */
export async function recordCrisisCard(rating: CrisisRating, kind: RiskKind | null): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO public.app_analytics (event, rating, risk_kind)
    VALUES ('crisis_card_shown', ${rating}, ${kind})
  `;
}

/** Record that the AI chat paused because the writer seemed to be under 18 (no rating, kind or content). */
export async function recordMinorDetected(): Promise<void> {
  await prisma.$executeRaw`INSERT INTO public.app_analytics (event) VALUES ('minor_detected')`;
}

/** Times the chat paused for a likely minor between two days (inclusive). */
export async function countMinorDetected(from: string, to: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS count FROM public.app_analytics
    WHERE event = 'minor_detected' AND day BETWEEN ${from}::date AND ${to}::date
  `;
  return Number(rows[0]?.count ?? 0);
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
