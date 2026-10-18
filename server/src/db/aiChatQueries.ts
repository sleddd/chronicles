import { prisma } from './prisma.js';

/* AI chat consent (18+ confirmed, protocol version) and the under-18 block.
   Its own table keyed by account, so the accounts table is never altered and
   deleting an account removes the row. */

export interface AiChatStatus {
  consentAt: string | null;
  consentVersion: number | null;
  blocked: boolean;
}

export async function initAiChatTable(): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS public.ai_chat_consent (
      account_id       INT PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
      consent_at       TIMESTAMPTZ,
      consent_version  INT,
      blocked          BOOLEAN NOT NULL DEFAULT FALSE
    )
  `;
}

export async function getAiChatStatus(accountId: number): Promise<AiChatStatus> {
  const rows = await prisma.$queryRaw<{ consent_at: Date | null; consent_version: number | null; blocked: boolean }[]>`
    SELECT consent_at, consent_version, blocked FROM public.ai_chat_consent WHERE account_id = ${accountId}
  `;
  const r = rows[0];
  return {
    consentAt: r?.consent_at ? r.consent_at.toISOString() : null,
    consentVersion: r?.consent_version ?? null,
    blocked: r?.blocked ?? false,
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

/** Turn the AI chat off (or back on) for an account — also clears its consent when blocking. */
export async function setAiChatBlocked(accountId: number, blocked: boolean): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO public.ai_chat_consent (account_id, blocked) VALUES (${accountId}, ${blocked})
    ON CONFLICT (account_id) DO UPDATE SET blocked = ${blocked},
      consent_at = CASE WHEN ${blocked} THEN NULL ELSE public.ai_chat_consent.consent_at END,
      consent_version = CASE WHEN ${blocked} THEN NULL ELSE public.ai_chat_consent.consent_version END
  `;
}
