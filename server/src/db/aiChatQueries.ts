import {
  AI_PAUSE_MS, AI_REFUSAL_DEDUPE_S, aiEnforcementLevel, aiRefusalAction,
  type AiBlockReason, type AiChatStatus, type AiRefusalApp,
} from '@chronicles/shared';
import { prisma } from './prisma.js';
import { aiUserIdFor } from '../services/aiUserId.js';

/* AI chat consent (18+ confirmed, protocol version), the block (under 18, or
   too many declined requests) and the pause after declined requests. Their own
   tables keyed by account, so the accounts table is never altered and deleting
   an account removes the rows.

   ai_refusals holds one row per request the AI declined (stop_reason
   "refusal", or the other providers' own signal), from either app: when and
   which app, never what was asked. Rows older than the 30-day window are
   dropped as new ones come in, and for every account when the server starts.
   None is added while the account is blocked, or within AI_REFUSAL_DEDUPE_S of
   the last one, so the table stays a few dozen rows an account at most. */

export type { AiChatStatus };

export async function initAiChatTable(): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS public.ai_chat_consent (
      account_id       INT PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
      consent_at       TIMESTAMPTZ,
      consent_version  INT,
      blocked          BOOLEAN NOT NULL DEFAULT FALSE,
      paused_until     TIMESTAMPTZ,
      blocked_reason   TEXT
    )
  `;
  // A table from before these columns: the catalog is read first, since even
  // ADD COLUMN IF NOT EXISTS takes an exclusive lock at every start
  const columns = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ai_chat_consent'
  `;
  const have = new Set(columns.map(c => c.column_name));
  if (!have.has('paused_until')) await prisma.$executeRaw`ALTER TABLE public.ai_chat_consent ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ`;
  if (!have.has('blocked_reason')) await prisma.$executeRaw`ALTER TABLE public.ai_chat_consent ADD COLUMN IF NOT EXISTS blocked_reason TEXT`;
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS public.ai_refusals (
      id          SERIAL PRIMARY KEY,
      account_id  INT NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
      at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      app         TEXT NOT NULL CHECK (app IN ('chronicles', 'smith'))
    )
  `;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS ai_refusals_account_at ON public.ai_refusals (account_id, at)`;
  // Past the longest window: gone for every account, not only the ones still declining
  await prisma.$executeRaw`DELETE FROM public.ai_refusals WHERE at <= NOW() - INTERVAL '30 days'`;
}

interface StatusRow {
  consent_at: Date | null;
  consent_version: number | null;
  blocked: boolean | null;
  paused_until: Date | null;
  refusals_24h: number;
  refusals_30d: number;
  now: Date;
}

export async function getAiChatStatus(accountId: number): Promise<AiChatStatus> {
  // Always one row, with or without a consent row; the database's clock decides "paused"
  const rows = await prisma.$queryRaw<StatusRow[]>`
    SELECT c.consent_at, c.consent_version, c.blocked, c.paused_until,
      (SELECT COUNT(*)::int FROM public.ai_refusals r
        WHERE r.account_id = ${accountId} AND r.at > NOW() - INTERVAL '24 hours') AS refusals_24h,
      (SELECT COUNT(*)::int FROM public.ai_refusals r
        WHERE r.account_id = ${accountId} AND r.at > NOW() - INTERVAL '30 days') AS refusals_30d,
      NOW() AS now
    FROM (SELECT 1) AS one
    LEFT JOIN public.ai_chat_consent c ON c.account_id = ${accountId}
  `;
  const r = rows[0];
  const blocked = r?.blocked ?? false;
  const refusals24h = Number(r?.refusals_24h ?? 0);
  const refusals30d = Number(r?.refusals_30d ?? 0);
  const pausedUntil = r?.paused_until ?? null;
  const level = aiEnforcementLevel({ blocked, pausedUntil, refusals24h }, r?.now ?? new Date());
  return {
    consentAt: r?.consent_at ? r.consent_at.toISOString() : null,
    consentVersion: r?.consent_version ?? null,
    blocked,
    aiUserId: aiUserIdFor(accountId),
    enforcement: {
      level,
      pausedUntil: level === 'paused' && pausedUntil ? pausedUntil.toISOString() : null,
      refusals24h,
      refusals30d,
    },
  };
}

export async function saveAiChatConsent(accountId: number, version: number): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO public.ai_chat_consent (account_id, consent_at, consent_version)
    VALUES (${accountId}, NOW(), ${version})
    ON CONFLICT (account_id) DO UPDATE SET consent_at = NOW(), consent_version = ${version}
  `;
}

export async function withdrawAiChatConsent(accountId: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE public.ai_chat_consent SET consent_at = NULL, consent_version = NULL WHERE account_id = ${accountId}
  `;
}

/**
 * Turn In-App AI off (or back on) for an account. Turning it off clears its
 * consent and notes why: `operator` (by hand, e.g. believed under 18) or
 * `refusals` (the declined-request ladder).
 */
export async function setAiChatBlocked(accountId: number, blocked: boolean, reason: AiBlockReason = 'operator'): Promise<void> {
  const why = blocked ? reason : null;
  await prisma.$executeRaw`
    INSERT INTO public.ai_chat_consent (account_id, blocked, blocked_reason) VALUES (${accountId}, ${blocked}, ${why}::text)
    ON CONFLICT (account_id) DO UPDATE SET blocked = EXCLUDED.blocked, blocked_reason = EXCLUDED.blocked_reason,
      consent_at = CASE WHEN EXCLUDED.blocked THEN NULL ELSE public.ai_chat_consent.consent_at END,
      consent_version = CASE WHEN EXCLUDED.blocked THEN NULL ELSE public.ai_chat_consent.consent_version END
  `;
}

/** Why the account is blocked, or null when it isn't. A block from before the reason was kept was made by hand. */
export async function getAiBlockReason(accountId: number): Promise<AiBlockReason | null> {
  const rows = await prisma.$queryRaw<{ blocked: boolean; blocked_reason: string | null }[]>`
    SELECT blocked, blocked_reason FROM public.ai_chat_consent WHERE account_id = ${accountId}
  `;
  if (!rows[0]?.blocked) return null;
  return rows[0].blocked_reason === 'refusals' ? 'refusals' : 'operator';
}

/** Turn In-App AI back on: not blocked, not paused, and its declined requests forgotten (the count starts again). */
export async function unblockAiChat(accountId: number): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRaw`
      INSERT INTO public.ai_chat_consent (account_id, blocked) VALUES (${accountId}, FALSE)
      ON CONFLICT (account_id) DO UPDATE SET blocked = FALSE, paused_until = NULL, blocked_reason = NULL
    `,
    prisma.$executeRaw`DELETE FROM public.ai_refusals WHERE account_id = ${accountId}`,
  ]);
}

/** Pause In-App AI for this long from now. */
export async function pauseAiChat(accountId: number, ms: number = AI_PAUSE_MS): Promise<void> {
  const seconds = Math.round(ms / 1000);
  await prisma.$executeRaw`
    INSERT INTO public.ai_chat_consent (account_id, paused_until)
    VALUES (${accountId}, NOW() + make_interval(secs => ${seconds}::float8))
    ON CONFLICT (account_id) DO UPDATE SET paused_until = EXCLUDED.paused_until
  `;
}

/**
 * One request the AI declined, then the ladder: 20 in 30 days turns In-App AI
 * off (and clears consent), else 10 in 24 hours pauses it for a day; 5 in 24
 * hours shows as 'warned' in the status. Returns the status after.
 *
 * Not counted: one within `dedupeSeconds` of the account's last (a single
 * message can make several requests, and both apps report here), and any while
 * the account is already blocked — so the endpoint can't be used to fill the
 * table, and one bad message is one count.
 */
export async function recordAiRefusal(accountId: number, app: AiRefusalApp, dedupeSeconds: number = AI_REFUSAL_DEDUPE_S): Promise<AiChatStatus> {
  const added = await prisma.$executeRaw`
    INSERT INTO public.ai_refusals (account_id, app)
    SELECT ${accountId}, ${app}
    WHERE NOT EXISTS (SELECT 1 FROM public.ai_chat_consent c WHERE c.account_id = ${accountId} AND c.blocked)
      AND NOT EXISTS (SELECT 1 FROM public.ai_refusals r WHERE r.account_id = ${accountId}
                        AND r.at > NOW() - make_interval(secs => ${dedupeSeconds}::float8))
  `;
  if (!added) return getAiChatStatus(accountId);
  // Nothing older than the longest window is ever needed
  await prisma.$executeRaw`DELETE FROM public.ai_refusals WHERE account_id = ${accountId} AND at <= NOW() - INTERVAL '30 days'`;
  const counted = await getAiChatStatus(accountId);
  const action = aiRefusalAction(counted.enforcement);
  if (action === 'block') await setAiChatBlocked(accountId, true, 'refusals');
  // A pause already running keeps its end: one more report doesn't push it out
  else if (action === 'pause' && counted.enforcement.level !== 'paused') await pauseAiChat(accountId);
  else return counted;
  return getAiChatStatus(accountId);
}
