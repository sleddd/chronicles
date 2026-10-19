import { prisma } from './prisma.js';

/* Which accounts have their master key wrapped in the current format (AES-GCM
   with purpose AAD). Accounts from before the AAD change still unwrap through a
   no-AAD fallback; the browser re-wraps on the next password unlock and the
   server marks it here. Once every account is marked, the fallback in
   shared/src/crypto/primitives.ts (unwrapKeyDetailed) can be removed.
   New accounts are marked at registration. */

export async function initKeyWrapTable(): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS public.key_wrap_status (
      account_id  INT PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
      aad_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function markKeyWrapCurrent(accountId: number): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO public.key_wrap_status (account_id) VALUES (${accountId}) ON CONFLICT (account_id) DO NOTHING
  `;
}

/** Accounts not yet known to be on the current wrap format. */
export async function countUnmarkedKeyWraps(): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS count FROM public.accounts a
    WHERE NOT EXISTS (SELECT 1 FROM public.key_wrap_status k WHERE k.account_id = a.id)
  `;
  return Number(rows[0]?.count ?? 0);
}
