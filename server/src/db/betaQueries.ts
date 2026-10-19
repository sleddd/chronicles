import { BETA_DETAILS } from '@chronicles/shared';
import { prisma } from './prisma.js';

/* Beta applications and the waitlist from the public landing page. These are
   people without an account, so nothing here links to public.accounts. One row
   per email: `seat` holds a beta place; `waitlist` is an application that came
   in after the seats were taken. Readable on purpose —
   we need the email to write back — and covered by the privacy policy's
   "Beta applications and the waitlist" section. */

export type BetaStatus = 'seat' | 'waitlist';

export async function initBetaTable(): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS public.beta_signups (
      email        TEXT PRIMARY KEY,
      status       TEXT NOT NULL CHECK (status IN ('seat', 'waitlist')),
      name         TEXT,
      track_first  TEXT,
      device       TEXT,
      applied_at   TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

/**
 * Apply for a beta seat. Seats go in the order applications arrive, so the
 * count and the insert run under one lock — two applicants can't both take
 * the last seat. Someone already holding a seat keeps it (details updated);
 * anyone else gets a seat while one is open, else the waitlist.
 */
export async function applyForBeta(a: { email: string; name: string; trackFirst: string; device: string }): Promise<BetaStatus> {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(7302461)::text`;
    const existing = await tx.$queryRaw<{ status: BetaStatus }[]>`
      SELECT status FROM public.beta_signups WHERE email = ${a.email}
    `;
    let status: BetaStatus = existing[0]?.status ?? 'waitlist';
    if (status !== 'seat') {
      const taken = await tx.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM public.beta_signups WHERE status = 'seat'
      `;
      status = (taken[0]?.n ?? 0) < BETA_DETAILS.seats ? 'seat' : 'waitlist';
    }
    await tx.$executeRaw`
      INSERT INTO public.beta_signups (email, status, name, track_first, device, applied_at)
      VALUES (${a.email}, ${status}, ${a.name}, ${a.trackFirst}, ${a.device}, NOW())
      ON CONFLICT (email) DO UPDATE SET
        status = ${status}, name = ${a.name}, track_first = ${a.trackFirst}, device = ${a.device}, applied_at = NOW()
    `;
    return status;
  });
}

export interface BetaSignup {
  email: string; status: BetaStatus; name: string | null; trackFirst: string | null; device: string | null;
  appliedAt: Date | null; createdAt: Date;
}

export async function listSignups(): Promise<BetaSignup[]> {
  const rows = await prisma.$queryRaw<{
    email: string; status: BetaStatus; name: string | null; track_first: string | null; device: string | null;
    applied_at: Date | null; created_at: Date;
  }[]>`
    SELECT email, status, name, track_first, device, applied_at, created_at
    FROM public.beta_signups ORDER BY status, COALESCE(applied_at, created_at)
  `;
  return rows.map(r => ({
    email: r.email, status: r.status, name: r.name, trackFirst: r.track_first, device: r.device,
    appliedAt: r.applied_at, createdAt: r.created_at,
  }));
}

export async function removeSignup(email: string): Promise<number> {
  return prisma.$executeRaw`DELETE FROM public.beta_signups WHERE email = ${email.trim().toLowerCase()}`;
}
