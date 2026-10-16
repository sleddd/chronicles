/**
 * What the client proves to the server — never the password or recovery key.
 *
 * The master key is wrapped under PBKDF2(password, kekSalt). If the server
 * also received the password (to check it), it could unwrap the master key
 * and read everything. So sign-in sends a separate secret instead:
 *
 *   authSecret = PBKDF2-SHA256(password, "chronicles:auth:v1:" + email, 600k)
 *
 * It uses a different salt from the KEK, so knowing it doesn't give the KEK;
 * getting the password back from it costs the same 600k-iteration guessing as
 * a stolen database. The salt comes from the email so it's known before
 * sign-in, without an unauthenticated salt lookup. Changing the email changes
 * the secret, so the client sends a new one with the change.
 *
 * Recovery works the same way: the client sends PBKDF2(recoveryKey, salt),
 * never the recovery key itself, which would unwrap recoveryWrappedMK.
 */

import { PBKDF2_HASH, PBKDF2_ITERATIONS, RECOVERY_PBKDF2_ITERATIONS } from './constants.js';

/** How the server and client both spell an email before using it. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function pbkdf2Hex(secret: string, salt: Uint8Array, iterations: number): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations, hash: PBKDF2_HASH },
    material,
    256,
  );
  return toHex(bits);
}

/** The sign-in secret for this password and email (64 hex chars). */
export function deriveAuthSecret(password: string, email: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  return pbkdf2Hex(password, new TextEncoder().encode(`chronicles:auth:v1:${normalizeEmail(email)}`), iterations);
}

/** Proof of the recovery key for its salt (both hex) — what the server checks. */
export function deriveRecoveryProof(recoveryKey: string, saltHex: string): Promise<string> {
  return pbkdf2Hex(recoveryKey, fromHex(saltHex), RECOVERY_PBKDF2_ITERATIONS);
}

/** A fresh salt and proof for a new recovery key (registration, regenerate, after recovery). */
export async function newRecoveryProof(recoveryKey: string): Promise<{ recoveryKeyHash: string; recoveryKeySalt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const recoveryKeySalt = toHex(salt.buffer as ArrayBuffer);
  return { recoveryKeyHash: await deriveRecoveryProof(recoveryKey, recoveryKeySalt), recoveryKeySalt };
}
