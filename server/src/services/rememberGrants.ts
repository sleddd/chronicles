import crypto from 'crypto';
import type { PrismaClient } from '@prisma/client';

// Loaded on first use, so the memory mode (tests) never needs a database
let prismaClient: Promise<PrismaClient> | null = null;
const db = () => (prismaClient ??= import('../db/prisma.js').then(m => m.prisma));
import { encryptToken, decryptToken, isTokenCryptoConfigured, tokenCryptoProblem } from './tokenCrypto.js';
import { SHARED_STATE_IN_POSTGRES } from './sharedState.js';

/**
 * "Remember me" grants — the server's half of staying unlocked across page
 * loads until the browser closes.
 *
 * The browser keeps the master key wrapped under a 32-byte device secret
 * (ciphertext only, in localStorage). The server keeps that secret — never in
 * logs — keyed by the SHA-256 of a random grant id carried in an HttpOnly,
 * SameSite=Strict *session* cookie (no Expires, so the browser drops it when
 * it closes). Unwrapping therefore needs all of: the local blob, the session
 * cookie, and a valid signed-in session that created the grant. Each grant
 * also has an absolute lifetime, so a browser that restores session cookies
 * can't keep it alive.
 *
 * Where the secret is kept: with SECRETS_ENCRYPTION_KEY set (and shared state
 * in Postgres, the default), in `public.remember_grants`, **sealed** with that
 * key (AES-GCM, services/tokenCrypto.ts) so every instance can serve it and a
 * copy of the database alone can't open it. Without the key, in this
 * process's memory only — then Remember me works on one instance, and a
 * restart forgets it.
 */

export const REMEMBER_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

interface GrantStore {
  put(hash: string, g: { secret: Buffer; selector: string; accountId: number; expiresAt: number }): Promise<void>;
  get(hash: string): Promise<{ secret: Buffer; selector: string; accountId: number; expiresAt: number } | null>;
  delete(hash: string): Promise<void>;
  deleteForSession(selector: string): Promise<void>;
  deleteForAccount(accountId: number, exceptSelector?: string): Promise<void>;
  clear(): Promise<void>;
}

interface Grant {
  secret: Buffer;
  selector: string;
  accountId: number;
  expiresAt: number;
}

function memoryGrants(): GrantStore {
  const grants = new Map<string, Grant>();
  const drop = (k: string) => { grants.get(k)?.secret.fill(0); grants.delete(k); };
  return {
    async put(hash, g) {
      const now = Date.now();
      for (const [k, x] of grants) if (x.expiresAt <= now) drop(k);
      grants.set(hash, { ...g, secret: Buffer.from(g.secret) });
    },
    async get(hash) { const g = grants.get(hash); return g ? { ...g, secret: Buffer.from(g.secret) } : null; },
    async delete(hash) { drop(hash); },
    async deleteForSession(selector) { for (const [k, g] of grants) if (g.selector === selector) drop(k); },
    async deleteForAccount(accountId, exceptSelector) {
      for (const [k, g] of grants) if (g.accountId === accountId && g.selector !== exceptSelector) drop(k);
    },
    async clear() { grants.clear(); },
  };
}

export const REMEMBER_GRANTS_TABLE_SQL = `CREATE UNLOGGED TABLE IF NOT EXISTS public.remember_grants (
  grant_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  selector VARCHAR(12) NOT NULL,
  sealed_secret TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
)`;

function postgresGrants(): GrantStore {
  return {
    async put(hash, g) {
      await (await db()).$executeRawUnsafe(`DELETE FROM public.remember_grants WHERE expires_at <= now()`);
      await (await db()).$executeRawUnsafe(
        `INSERT INTO public.remember_grants (grant_hash, account_id, selector, sealed_secret, expires_at) VALUES ($1, $2, $3, $4, $5)`,
        hash, g.accountId, g.selector, encryptToken(g.secret.toString('base64')), new Date(g.expiresAt)
      );
    },
    async get(hash) {
      const rows = await (await db()).$queryRawUnsafe<{ account_id: number; selector: string; sealed_secret: string; expires_at: Date }[]>(
        `SELECT account_id, selector, sealed_secret, expires_at FROM public.remember_grants WHERE grant_hash = $1`, hash
      );
      const r = rows[0];
      if (!r) return null;
      let secret: Buffer;
      try { secret = Buffer.from(decryptToken(r.sealed_secret), 'base64'); } catch { return null; }
      return { secret, selector: r.selector, accountId: r.account_id, expiresAt: r.expires_at.getTime() };
    },
    async delete(hash) { await (await db()).$executeRawUnsafe(`DELETE FROM public.remember_grants WHERE grant_hash = $1`, hash); },
    async deleteForSession(selector) { await (await db()).$executeRawUnsafe(`DELETE FROM public.remember_grants WHERE selector = $1`, selector); },
    async deleteForAccount(accountId, exceptSelector) {
      await (await db()).$executeRawUnsafe(
        `DELETE FROM public.remember_grants WHERE account_id = $1 AND ($2::text IS NULL OR selector <> $2)`, accountId, exceptSelector ?? null
      );
    },
    async clear() { await (await db()).$executeRawUnsafe(`DELETE FROM public.remember_grants`); },
  };
}

export const REMEMBER_GRANTS_SHARED = SHARED_STATE_IN_POSTGRES && isTokenCryptoConfigured();
const store: GrantStore = REMEMBER_GRANTS_SHARED ? postgresGrants() : memoryGrants();

/** Startup: the table (shared mode), or say why Remember me stays on one instance. */
export async function initRememberGrants(): Promise<void> {
  if (REMEMBER_GRANTS_SHARED) { await (await db()).$executeRawUnsafe(REMEMBER_GRANTS_TABLE_SQL); return; }
  if (SHARED_STATE_IN_POSTGRES) {
    console.warn(`Remember me grants are kept in memory (${tokenCryptoProblem() ?? 'shared state is off'}): it works on one server instance only, and a restart forgets it`);
  }
}

const hashId = (id: string) => crypto.createHash('sha256').update(id).digest('hex');

/** Create a grant for this signed-in session. Returns the cookie value and the device secret. */
export async function createGrant(accountId: number, selector: string, now = Date.now()): Promise<{ grantId: string; secret: Buffer; expiresAt: number }> {
  // One live grant per session: re-enabling replaces the old one
  await store.deleteForSession(selector);
  const grantId = crypto.randomBytes(32).toString('base64url');
  const secret = crypto.randomBytes(32);
  const expiresAt = now + REMEMBER_MAX_AGE_MS;
  await store.put(hashId(grantId), { secret, selector, accountId, expiresAt });
  return { grantId, secret, expiresAt };
}

/** The device secret for a grant — only for the same account and session that created it. */
export async function readGrant(grantId: string | undefined, accountId: number, selector: string, now = Date.now()): Promise<{ secret: Buffer; expiresAt: number } | null> {
  if (!grantId || grantId.length > 128) return null;
  const key = hashId(grantId);
  const g = await store.get(key);
  if (!g) return null;
  if (g.expiresAt <= now) { g.secret.fill(0); await store.delete(key); return null; }
  const sameSession = g.accountId === accountId
    && g.selector.length === selector.length
    && crypto.timingSafeEqual(Buffer.from(g.selector), Buffer.from(selector));
  if (!sameSession) { g.secret.fill(0); return null; }
  return { secret: g.secret, expiresAt: g.expiresAt };
}

export async function revokeGrant(grantId: string | undefined): Promise<void> {
  if (!grantId) return;
  await store.delete(hashId(grantId));
}

export async function revokeGrantsForSession(selector: string): Promise<void> {
  await store.deleteForSession(selector);
}

export async function revokeGrantsForAccount(accountId: number, exceptSelector?: string): Promise<void> {
  await store.deleteForAccount(accountId, exceptSelector);
}

/** Test helper. */
export async function _clearGrants(): Promise<void> { await store.clear(); }
