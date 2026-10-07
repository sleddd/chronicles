import { auth as authApi, ApiError } from './api.js';
import { base64ToUint8Array } from '@shared/crypto/encoding.js';

/**
 * "Remember me" — stay unlocked across reloads and new tabs until the browser
 * closes. What the browser keeps is only ciphertext: the master key wrapped
 * under a device secret that the server holds in memory and hands back only
 * to this browser session (HttpOnly session cookie) while the signed-in
 * session that created it is still valid. See server/src/services/rememberGrants.ts.
 *
 * Ends on: closing the browser (cookie gone), Lock, sign-out, an hour with no
 * activity in any Chronicles tab, or 12 hours at most.
 */

export const REMEMBER_STORE_KEY = 'chronicles.remember.v1';
export const ACTIVITY_STORE_KEY = 'chronicles.lastActive';
/** Remembered sessions lock after this long with no activity in any tab. */
export const REMEMBER_IDLE_MS = 60 * 60 * 1000;

export interface RememberedBlob {
  v: 1;
  wrapped: string;
  iv: string;
  expiresAt: string;
}

function read(): RememberedBlob | null {
  try {
    const raw = localStorage.getItem(REMEMBER_STORE_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as RememberedBlob;
    if (b?.v !== 1 || typeof b.wrapped !== 'string' || typeof b.iv !== 'string') return null;
    return b;
  } catch {
    return null;
  }
}

function clearLocal(): void {
  try { localStorage.removeItem(REMEMBER_STORE_KEY); } catch { /* storage unavailable */ }
}

export function lastActivity(): number {
  try { return Number(localStorage.getItem(ACTIVITY_STORE_KEY)) || 0; } catch { return 0; }
}

export function markActivity(now = Date.now()): void {
  try { localStorage.setItem(ACTIVITY_STORE_KEY, String(now)); } catch { /* storage unavailable */ }
}

/** A usable blob is stored: not past its lifetime, and used within the idle window. */
export function hasRememberedUnlock(now = Date.now()): boolean {
  const b = read();
  if (!b) return false;
  if (Date.parse(b.expiresAt) <= now || now - lastActivity() > REMEMBER_IDLE_MS) {
    clearLocal();
    return false;
  }
  return true;
}

/** Ask the server for a fresh grant; returns the 32-byte device secret (caller zeroes it). */
export async function startRemembering(): Promise<{ secret: Uint8Array; expiresAt: string }> {
  const { secret, expiresAt } = await authApi.rememberStart();
  return { secret: base64ToUint8Array(secret), expiresAt };
}

export function storeRemembered(wrapped: string, iv: string, expiresAt: string): void {
  try {
    localStorage.setItem(REMEMBER_STORE_KEY, JSON.stringify({ v: 1, wrapped, iv, expiresAt } satisfies RememberedBlob));
    markActivity();
  } catch { /* storage unavailable — just won't be remembered */ }
}

/**
 * The stored blob and its device secret, or why not: 'forget' when the grant
 * is gone for good (browser was closed, signed out, expired — the blob is
 * removed), 'retry' on a transient failure (the blob is kept).
 */
export async function fetchRemembered(): Promise<{ blob: RememberedBlob; secret: Uint8Array } | 'forget' | 'retry'> {
  const blob = read();
  if (!blob || !hasRememberedUnlock()) return 'forget';
  try {
    const { secret } = await authApi.rememberKey();
    return { blob, secret: base64ToUint8Array(secret) };
  } catch (err) {
    if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
      clearLocal();
      return 'forget';
    }
    return 'retry';
  }
}

/** Stop remembering this browser: drop the local blob and the server grant. */
export function forgetRemembered(): void {
  const had = read() !== null;
  clearLocal();
  if (had) void authApi.rememberForget().catch(() => { /* signed out already — the grant dies with the session */ });
}
