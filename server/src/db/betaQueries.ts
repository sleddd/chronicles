import { BETA_DETAILS } from '@chronicles/shared';
import { prisma } from './prisma.js';

/* Beta applications and the waitlist from the public landing page. These are
   people without an account, so nothing here links to public.accounts. One row
   per email: `seat` holds a beta place; `waitlist` is an application that came
   in after the seats were taken; `invited` is someone approved who never
   applied. `approved_at` is the owner's say-so to create an account: sign-up
   accepts an approved email straight away (no restart), alongside the
   REGISTRATION_WHITELIST env list. Readable on purpose —
   we need the email to write back — and covered by the privacy policy's
   "Beta applications and the waitlist" section. */

export type BetaStatus = 'seat' | 'waitlist' | 'invited';

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
  // Added after launch: approvals, and the 'invited' status for people approved without applying
  await prisma.$executeRaw`ALTER TABLE public.beta_signups ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`;
  await prisma.$executeRaw`ALTER TABLE public.beta_signups DROP CONSTRAINT IF EXISTS beta_signups_status_check`;
  await prisma.$executeRaw`
    ALTER TABLE public.beta_signups ADD CONSTRAINT beta_signups_status_check
    CHECK (status IN ('seat', 'waitlist', 'invited'))
  `;
}

/** May this email create an account? (approved by the owner) */
export async function isApproved(email: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ ok: number }[]>`
    SELECT 1 AS ok FROM public.beta_signups WHERE email = ${email} AND approved_at IS NOT NULL
  `;
  return rows.length > 0;
}

/** Approve an email to sign up. Someone who never applied is added as `invited`. */
export async function approve(email: string): Promise<'approved' | 'invited'> {
  const e = email.trim().toLowerCase();
  const updated = await prisma.$executeRaw`
    UPDATE public.beta_signups SET approved_at = COALESCE(approved_at, NOW()) WHERE email = ${e}
  `;
  if (updated) return 'approved';
  await prisma.$executeRaw`
    INSERT INTO public.beta_signups (email, status, approved_at) VALUES (${e}, 'invited', NOW())
  `;
  return 'invited';
}

/** Take an approval back (an account already created is not affected). Returns false if the email isn't listed. */
export async function unapprove(email: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  // Someone only invited goes entirely; an applicant keeps their application
  const removed = await prisma.$executeRaw`DELETE FROM public.beta_signups WHERE email = ${e} AND status = 'invited'`;
  const cleared = await prisma.$executeRaw`UPDATE public.beta_signups SET approved_at = NULL WHERE email = ${e}`;
  return removed + cleared > 0;
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
    if (status === 'invited') status = 'seat';
    else if (status !== 'seat') {
      const taken = await tx.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM public.beta_signups WHERE status = 'seat'
      `;
      status = (taken[0]?.n ?? 0) < BETA_DETAILS.seats ? 'seat' : 'waitlist';
    }
    await tx.$executeRaw`
      INSERT INTO public.beta_signups (email, status, name, track_first, device, applied_at)
      VALUES (${a.email}, ${status}, ${a.name}, ${a.trackFirst}, ${a.device}, NOW())
      ON CONFLICT (email) DO UPDATE SET
        status = ${status},
        -- The first application's details stay: anyone can post any email,
        -- so a later one may only fill in a row that never applied (invited)
        name = CASE WHEN public.beta_signups.applied_at IS NULL THEN ${a.name} ELSE public.beta_signups.name END,
        track_first = CASE WHEN public.beta_signups.applied_at IS NULL THEN ${a.trackFirst} ELSE public.beta_signups.track_first END,
        device = CASE WHEN public.beta_signups.applied_at IS NULL THEN ${a.device} ELSE public.beta_signups.device END,
        applied_at = COALESCE(public.beta_signups.applied_at, NOW())
    `;
    return status;
  });
}

// Control characters (escape sequences that could rewrite the operator's
// terminal, C1 controls) and bidi overrides (which reorder what's shown)
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

/** Applicant-typed text made safe to print in a terminal (npm run beta). */
export const printable = (v: string): string => v.replace(UNSAFE_CHARS, '');

export interface BetaSignup {
  email: string; status: BetaStatus; name: string | null; trackFirst: string | null; device: string | null;
  appliedAt: Date | null; createdAt: Date; approvedAt: Date | null; signedUp: boolean;
}

export async function listSignups(): Promise<BetaSignup[]> {
  const rows = await prisma.$queryRaw<{
    email: string; status: BetaStatus; name: string | null; track_first: string | null; device: string | null;
    applied_at: Date | null; created_at: Date; approved_at: Date | null; signed_up: boolean;
  }[]>`
    SELECT b.email, b.status, b.name, b.track_first, b.device, b.applied_at, b.created_at, b.approved_at,
           EXISTS (SELECT 1 FROM public.accounts a WHERE a.email = b.email) AS signed_up
    FROM public.beta_signups b ORDER BY b.status, COALESCE(b.applied_at, b.created_at)
  `;
  return rows.map(r => ({
    email: r.email, status: r.status, name: r.name, trackFirst: r.track_first, device: r.device,
    appliedAt: r.applied_at, createdAt: r.created_at, approvedAt: r.approved_at, signedUp: r.signed_up,
  }));
}

export async function removeSignup(email: string): Promise<number> {
  return prisma.$executeRaw`DELETE FROM public.beta_signups WHERE email = ${email.trim().toLowerCase()}`;
}
