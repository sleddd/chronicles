import { prisma } from './prisma.js';
import type { CrisisRating, RiskKind } from '@chronicles/shared';

/* App analytics — kept apart from accounts on purpose. A row says only that
   something happened on a day: no account id, no IP, no time of day, no
   content, so it can never be traced back to a person. Values are allowlisted
   by CHECK constraints as well as by the route's validation. */

/* Kept as one counter per day, event, rating and kind rather than a row per
   event: each row in a log keeps its own transaction id (xmin) and its place
   in the table, both in the order written — enough, beside request logs or
   another table's xmin, to line an event up with a person's other requests.
   A counter only says how many by the day. */
export async function initAnalyticsTable(): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS public.app_analytics_daily (
      day        DATE NOT NULL,
      event      TEXT NOT NULL CHECK (event IN ('crisis_card_shown', 'minor_detected')),
      rating     TEXT NOT NULL DEFAULT '' CHECK (rating IN ('', 'concern', 'elevated', 'urgent')),
      risk_kind  TEXT NOT NULL DEFAULT '' CHECK (risk_kind IN ('', 'suicide', 'self_harm', 'eating_disorder')),
      n          INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, event, rating, risk_kind)
    )
  `;
  // The older per-event log: fold it into the counters and drop it, rows and all
  const old = await prisma.$queryRaw<{ ok: number }[]>`
    SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_analytics'
  `;
  if (old.length > 0) {
    await prisma.$transaction([
      prisma.$executeRaw`
        INSERT INTO public.app_analytics_daily (day, event, rating, risk_kind, n)
        SELECT day, event, COALESCE(rating, ''), COALESCE(risk_kind, ''), COUNT(*)::int
        FROM public.app_analytics GROUP BY 1, 2, 3, 4
        ON CONFLICT (day, event, rating, risk_kind) DO UPDATE SET n = public.app_analytics_daily.n + EXCLUDED.n
      `,
      prisma.$executeRaw`DROP TABLE public.app_analytics`,
    ]);
  }
}

async function count(event: string, rating: string, kind: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO public.app_analytics_daily (day, event, rating, risk_kind, n)
    VALUES (CURRENT_DATE, ${event}, ${rating}, ${kind}, 1)
    ON CONFLICT (day, event, rating, risk_kind) DO UPDATE SET n = public.app_analytics_daily.n + 1
  `;
}

/** Record that the crisis card was shown. The day is the server's, never the client's. */
export async function recordCrisisCard(rating: CrisisRating, kind: RiskKind | null): Promise<void> {
  await count('crisis_card_shown', rating, kind ?? '');
}

/** Record that the AI chat paused because the writer seemed to be under 18 (no rating, kind or content). */
export async function recordMinorDetected(): Promise<void> {
  await count('minor_detected', '', '');
}

/** Times the chat paused for a likely minor between two days (inclusive). */
export async function countMinorDetected(from: string, to: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COALESCE(SUM(n), 0) AS count FROM public.app_analytics_daily
    WHERE event = 'minor_detected' AND day BETWEEN ${from}::date AND ${to}::date
  `;
  return Number(rows[0]?.count ?? 0);
}

export interface CrisisCount { rating: string; riskKind: string; count: number }

/** Crisis-card counts by rating and kind between two days (inclusive) — for a report on request. */
export async function countCrisisCards(from: string, to: string): Promise<CrisisCount[]> {
  const rows = await prisma.$queryRaw<{ rating: string; risk_kind: string | null; count: bigint }[]>`
    SELECT rating, NULLIF(risk_kind, '') AS risk_kind, SUM(n) AS count
    FROM public.app_analytics_daily
    WHERE event = 'crisis_card_shown' AND day BETWEEN ${from}::date AND ${to}::date
    GROUP BY rating, risk_kind
    ORDER BY rating, risk_kind
  `;
  return rows.map(r => ({ rating: r.rating, riskKind: r.risk_kind ?? 'unknown', count: Number(r.count) }));
}
