import crypto from 'crypto';
import type { Store, IncrementResponse } from 'express-rate-limit';
import type { PrismaClient } from '@prisma/client';

// Loaded on first use, so the memory mode (tests) never needs a database
let prismaClient: Promise<PrismaClient> | null = null;
const db = () => (prismaClient ??= import('../db/prisma.js').then(m => m.prisma));

/**
 * Short-lived sign-in state that every server instance must agree on: lockout
 * counters (wrong passwords / codes), pending 2FA sign-ins, the last TOTP step
 * each account used, and the counters behind the security rate limits. In
 * Postgres by default (`public.auth_state`, UNLOGGED: a database crash empties
 * it, like a restart emptied the old in-memory maps), so the server can run as
 * several instances. SHARED_STATE=memory keeps it in this process (one
 * instance only; also what the tests use).
 *
 * Every operation is one atomic statement, so "count the attempt before the
 * slow check" holds even when parallel requests land on different instances.
 */

export interface SharedState {
  /** Count an attempt unless the key is locked (count ≥ max within the window). True = go ahead. */
  claim(bucket: string, key: string, max: number, windowMs: number): Promise<boolean>;
  /** Whether the key is locked, without counting. */
  locked(bucket: string, key: string, max: number): Promise<boolean>;
  clear(bucket: string, key: string): Promise<void>;
  /** Remember a short-lived token (kept by its hash) for an account. */
  putToken(bucket: string, token: string, accountId: number, ttlMs: number): Promise<void>;
  /** The token's account, if it exists and hasn't expired. */
  getToken(bucket: string, token: string): Promise<number | null>;
  deleteToken(bucket: string, token: string): Promise<void>;
  deleteTokensForAccount(bucket: string, accountId: number): Promise<void>;
  /** Raise a stored number if `value` is higher; true if it was (first use of a TOTP step). */
  advance(bucket: string, key: string, value: number, ttlMs: number): Promise<boolean>;
  /** A rate-limit hit: the count in the current window and when the window ends. */
  hit(bucket: string, key: string, windowMs: number): Promise<{ count: number; resetAt: Date }>;
  unhit(bucket: string, key: string): Promise<void>;
  /** Drop expired rows. */
  sweep(): Promise<void>;
}

const tokenKey = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

// ---------------------------------------------------------------------------
// In this process
// ---------------------------------------------------------------------------

interface Row { count: number; expiresAt: number; accountId?: number }

export function memoryState(): SharedState & { reset(): void } {
  const rows = new Map<string, Row>();
  const k = (bucket: string, key: string) => `${bucket}\u0000${key}`;
  const live = (bucket: string, key: string): Row | undefined => {
    const r = rows.get(k(bucket, key));
    if (r && r.expiresAt <= Date.now()) { rows.delete(k(bucket, key)); return undefined; }
    return r;
  };
  return {
    async claim(bucket, key, max, windowMs) {
      const r = live(bucket, key);
      if (!r) { rows.set(k(bucket, key), { count: 1, expiresAt: Date.now() + windowMs }); return true; }
      if (r.count >= max) return false;
      r.count++;
      return true;
    },
    async locked(bucket, key, max) { return (live(bucket, key)?.count ?? 0) >= max; },
    async clear(bucket, key) { rows.delete(k(bucket, key)); },
    async putToken(bucket, token, accountId, ttlMs) { rows.set(k(bucket, tokenKey(token)), { count: 0, accountId, expiresAt: Date.now() + ttlMs }); },
    async getToken(bucket, token) { return live(bucket, tokenKey(token))?.accountId ?? null; },
    async deleteToken(bucket, token) { rows.delete(k(bucket, tokenKey(token))); },
    async deleteTokensForAccount(bucket, accountId) {
      for (const [key, r] of rows) if (key.startsWith(`${bucket}\u0000`) && r.accountId === accountId) rows.delete(key);
    },
    async advance(bucket, key, value, ttlMs) {
      const r = live(bucket, key);
      if (r && r.count >= value) return false;
      rows.set(k(bucket, key), { count: value, expiresAt: Date.now() + ttlMs });
      return true;
    },
    async hit(bucket, key, windowMs) {
      let r = live(bucket, key);
      if (!r) { r = { count: 0, expiresAt: Date.now() + windowMs }; rows.set(k(bucket, key), r); }
      r.count++;
      return { count: r.count, resetAt: new Date(r.expiresAt) };
    },
    async unhit(bucket, key) { const r = live(bucket, key); if (r && r.count > 0) r.count--; },
    async sweep() { const now = Date.now(); for (const [key, r] of rows) if (r.expiresAt <= now) rows.delete(key); },
    reset() { rows.clear(); },
  };
}

// ---------------------------------------------------------------------------
// In Postgres (shared by every instance)
// ---------------------------------------------------------------------------

export const AUTH_STATE_TABLE_SQL = `CREATE UNLOGGED TABLE IF NOT EXISTS public.auth_state (
  bucket TEXT NOT NULL,
  key TEXT NOT NULL,
  count BIGINT NOT NULL DEFAULT 0,
  account_id INTEGER,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (bucket, key)
)`;

export function postgresState(): SharedState {
  const ms = (n: number) => `${Math.max(1, Math.round(n))} milliseconds`;
  return {
    async claim(bucket, key, max, windowMs) {
      // Past the cap the count parks at max + 1: "blocked" is then count > max
      const [row] = await (await db()).$queryRawUnsafe<{ count: bigint }[]>(
        `INSERT INTO public.auth_state (bucket, key, count, expires_at) VALUES ($1, $2, 1, now() + $4::interval)
         ON CONFLICT (bucket, key) DO UPDATE SET
           count = CASE WHEN auth_state.expires_at <= now() THEN 1 ELSE LEAST(auth_state.count + 1, $3 + 1) END,
           expires_at = CASE WHEN auth_state.expires_at <= now() THEN EXCLUDED.expires_at ELSE auth_state.expires_at END
         RETURNING count`,
        bucket, key, max, ms(windowMs)
      );
      return Number(row.count) <= max;
    },
    async locked(bucket, key, max) {
      const rows = await (await db()).$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT count FROM public.auth_state WHERE bucket = $1 AND key = $2 AND expires_at > now()`, bucket, key
      );
      return Number(rows[0]?.count ?? 0) >= max;
    },
    async clear(bucket, key) {
      await (await db()).$executeRawUnsafe(`DELETE FROM public.auth_state WHERE bucket = $1 AND key = $2`, bucket, key);
    },
    async putToken(bucket, token, accountId, ttlMs) {
      await (await db()).$executeRawUnsafe(
        `INSERT INTO public.auth_state (bucket, key, account_id, expires_at) VALUES ($1, $2, $3, now() + $4::interval)
         ON CONFLICT (bucket, key) DO UPDATE SET account_id = EXCLUDED.account_id, expires_at = EXCLUDED.expires_at`,
        bucket, tokenKey(token), accountId, ms(ttlMs)
      );
    },
    async getToken(bucket, token) {
      const rows = await (await db()).$queryRawUnsafe<{ account_id: number }[]>(
        `SELECT account_id FROM public.auth_state WHERE bucket = $1 AND key = $2 AND expires_at > now()`, bucket, tokenKey(token)
      );
      return rows[0]?.account_id ?? null;
    },
    async deleteToken(bucket, token) {
      await (await db()).$executeRawUnsafe(`DELETE FROM public.auth_state WHERE bucket = $1 AND key = $2`, bucket, tokenKey(token));
    },
    async deleteTokensForAccount(bucket, accountId) {
      await (await db()).$executeRawUnsafe(`DELETE FROM public.auth_state WHERE bucket = $1 AND account_id = $2`, bucket, accountId);
    },
    async advance(bucket, key, value, ttlMs) {
      const rows = await (await db()).$queryRawUnsafe<unknown[]>(
        `INSERT INTO public.auth_state (bucket, key, count, expires_at) VALUES ($1, $2, $3, now() + $4::interval)
         ON CONFLICT (bucket, key) DO UPDATE SET count = EXCLUDED.count, expires_at = EXCLUDED.expires_at
           WHERE auth_state.count < EXCLUDED.count OR auth_state.expires_at <= now()
         RETURNING 1`,
        bucket, key, value, ms(ttlMs)
      );
      return rows.length > 0;
    },
    async hit(bucket, key, windowMs) {
      const [row] = await (await db()).$queryRawUnsafe<{ count: bigint; expires_at: Date }[]>(
        `INSERT INTO public.auth_state (bucket, key, count, expires_at) VALUES ($1, $2, 1, now() + $3::interval)
         ON CONFLICT (bucket, key) DO UPDATE SET
           count = CASE WHEN auth_state.expires_at <= now() THEN 1 ELSE auth_state.count + 1 END,
           expires_at = CASE WHEN auth_state.expires_at <= now() THEN EXCLUDED.expires_at ELSE auth_state.expires_at END
         RETURNING count, expires_at`,
        bucket, key, ms(windowMs)
      );
      return { count: Number(row.count), resetAt: row.expires_at };
    },
    async unhit(bucket, key) {
      await (await db()).$executeRawUnsafe(
        `UPDATE public.auth_state SET count = count - 1 WHERE bucket = $1 AND key = $2 AND count > 0`, bucket, key
      );
    },
    async sweep() {
      await (await db()).$executeRawUnsafe(`DELETE FROM public.auth_state WHERE expires_at <= now()`);
    },
  };
}

// ---------------------------------------------------------------------------

export const SHARED_STATE_IN_POSTGRES = (process.env.SHARED_STATE ?? (process.env.VITEST ? 'memory' : 'postgres')) !== 'memory';

const memory = memoryState();
export const sharedState: SharedState = SHARED_STATE_IN_POSTGRES ? postgresState() : memory;

/** Tests only: forget everything (memory mode). */
export function resetSharedStateForTests(): void { memory.reset(); }

/** Startup: the table (Postgres mode). */
export async function initSharedState(): Promise<void> {
  if (!SHARED_STATE_IN_POSTGRES) return;
  await (await db()).$executeRawUnsafe(AUTH_STATE_TABLE_SQL);
  await sharedState.sweep();
}

/**
 * An express-rate-limit store on shared state, so a per-IP limit holds across
 * instances. Undefined in memory mode (the limiter's own store is used).
 */
export function sharedRateLimitStore(bucket: string): Store | undefined {
  if (!SHARED_STATE_IN_POSTGRES) return undefined;
  let windowMs = 60_000;
  return {
    localKeys: false,
    prefix: bucket,
    init(options) { windowMs = options.windowMs; },
    async increment(key): Promise<IncrementResponse> {
      const { count, resetAt } = await sharedState.hit(`rate:${bucket}`, key, windowMs);
      return { totalHits: count, resetTime: resetAt };
    },
    async decrement(key) { await sharedState.unhit(`rate:${bucket}`, key); },
    async resetKey(key) { await sharedState.clear(`rate:${bucket}`, key); },
  };
}
