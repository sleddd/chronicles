import crypto from 'crypto';
import { prisma } from './prisma.js';

/*
 * Trusted browsers: "don't ask for a code on this browser for 30 days".
 * A row lets one browser skip the authenticator code at sign-in — nothing
 * else. The password is still checked first, every time, and the key is still
 * derived from it in the browser. The browser holds a random token in an
 * HttpOnly cookie; only its SHA-256 is stored here, so a copy of the database
 * can't be replayed. Deleting the account cascades.
 */

export const TRUST_DAYS = 30;
export const MAX_TRUSTED_DEVICES = 10;

export interface TrustedDevice {
  id: number;
  label: string;
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date | null;
}

export const hashTrustToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export async function initTrustedDevicesTable(): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS public.trusted_devices (
      id           SERIAL PRIMARY KEY,
      account_id   INT NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
      token_hash   TEXT UNIQUE NOT NULL,
      label        VARCHAR(120) NOT NULL DEFAULT '',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at   TIMESTAMPTZ NOT NULL,
      last_used_at TIMESTAMPTZ
    )
  `;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS trusted_devices_account_idx ON public.trusted_devices (account_id)`;
}

/** Trust this browser: returns the token for its cookie. The oldest go once the account is at its limit. */
export async function trustDevice(accountId: number, label: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.$executeRaw`
    INSERT INTO public.trusted_devices (account_id, token_hash, label, expires_at)
    VALUES (${accountId}, ${hashTrustToken(token)}, ${label.slice(0, 120)}, NOW() + make_interval(days => ${TRUST_DAYS}::int))`;
  await prisma.$executeRaw`
    DELETE FROM public.trusted_devices WHERE account_id = ${accountId} AND id NOT IN (
      SELECT id FROM public.trusted_devices WHERE account_id = ${accountId} ORDER BY created_at DESC, id DESC LIMIT ${MAX_TRUSTED_DEVICES}
    )`;
  return token;
}

/**
 * Is this token a live trust for THIS account? Marks it used. One statement,
 * matched on the hash, the account and the expiry together — a token for
 * another account, or an expired one, is simply no match.
 */
export async function useTrustedDevice(accountId: number, token: string | undefined): Promise<boolean> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 128) return false;
  const used = await prisma.$executeRaw`
    UPDATE public.trusted_devices SET last_used_at = NOW()
    WHERE token_hash = ${hashTrustToken(token)} AND account_id = ${accountId} AND expires_at > NOW()`;
  return used === 1;
}

export async function listTrustedDevices(accountId: number, currentToken?: string): Promise<(TrustedDevice & { isCurrent: boolean })[]> {
  const rows = await prisma.$queryRaw<{ id: number; token_hash: string; label: string; created_at: Date; expires_at: Date; last_used_at: Date | null }[]>`
    SELECT id, token_hash, label, created_at, expires_at, last_used_at FROM public.trusted_devices
    WHERE account_id = ${accountId} AND expires_at > NOW() ORDER BY created_at DESC, id DESC`;
  const current = typeof currentToken === 'string' && currentToken.length <= 128 ? hashTrustToken(currentToken) : null;
  return rows.map(r => ({ id: r.id, label: r.label, createdAt: r.created_at, expiresAt: r.expires_at, lastUsedAt: r.last_used_at, isCurrent: r.token_hash === current }));
}

export async function forgetTrustedDevice(accountId: number, id: number): Promise<boolean> {
  return (await prisma.$executeRaw`DELETE FROM public.trusted_devices WHERE id = ${id} AND account_id = ${accountId}`) === 1;
}

/** This browser's own trust (pressing Sign out). */
export async function forgetTrustToken(token: string | undefined): Promise<void> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 128) return;
  await prisma.$executeRaw`DELETE FROM public.trusted_devices WHERE token_hash = ${hashTrustToken(token)}`;
}

/** Every trusted browser of the account (password change, recovery, 2FA on or off, sign out everywhere). */
export async function forgetAllTrustedDevices(accountId: number): Promise<void> {
  await prisma.$executeRaw`DELETE FROM public.trusted_devices WHERE account_id = ${accountId}`;
}

export async function purgeExpiredTrustedDevices(): Promise<number> {
  return prisma.$executeRaw`DELETE FROM public.trusted_devices WHERE expires_at <= NOW()`;
}

export async function countTrustedAccounts(): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(DISTINCT account_id) AS n FROM public.trusted_devices WHERE expires_at > NOW()`;
  return Number(rows[0]?.n ?? 0);
}
