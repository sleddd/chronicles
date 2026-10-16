import { describe, it, expect } from 'vitest';
import { webcrypto } from 'crypto';
import { deriveAuthSecret, deriveRecoveryProof, newRecoveryProof, normalizeEmail } from '../crypto/authSecret.js';
import { deriveKEK, generateSalt } from '../crypto/primitives.js';

const ITER = 1000; // keep the tests fast; production uses PBKDF2_ITERATIONS

describe('deriveAuthSecret', () => {
  it('is 64 hex chars and never contains the password', async () => {
    const secret = await deriveAuthSecret('Correct-Horse-9', 'a@b.com', ITER);
    expect(secret).toMatch(/^[a-f0-9]{64}$/);
    expect(secret).not.toContain('Correct-Horse-9');
  });

  it('is stable for the same password and email, however the email is typed', async () => {
    expect(await deriveAuthSecret('pw', ' A@B.com ', ITER)).toBe(await deriveAuthSecret('pw', 'a@b.com', ITER));
  });

  it('changes with the email and the password', async () => {
    const base = await deriveAuthSecret('pw', 'a@b.com', ITER);
    expect(await deriveAuthSecret('pw', 'c@b.com', ITER)).not.toBe(base);
    expect(await deriveAuthSecret('pw2', 'a@b.com', ITER)).not.toBe(base);
  });

  it('is not the KEK — the wrapping key comes from a different salt', async () => {
    // The KEK is non-extractable, so compare against raw PBKDF2 bits for its salt
    const salt = generateSalt();
    const kek = await deriveKEK('pw', salt, ITER);
    expect(kek.extractable).toBe(false);
    const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode('pw'), 'PBKDF2', false, ['deriveBits']);
    const kekBits = Buffer.from(await webcrypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, material, 256)).toString('hex');
    expect(await deriveAuthSecret('pw', 'a@b.com', ITER)).not.toBe(kekBits);
  });
});

describe('recovery proofs', () => {
  it('matches the PBKDF2 the server used to compute from the raw key', async () => {
    const { pbkdf2Sync } = await import('crypto');
    const salt = 'ab'.repeat(16);
    const expected = pbkdf2Sync('recovery-key-b64', Buffer.from(salt, 'hex'), 600000, 32, 'sha256').toString('hex');
    expect(await deriveRecoveryProof('recovery-key-b64', salt)).toBe(expected);
  });

  it('newRecoveryProof returns a fresh salt and the matching proof', async () => {
    const a = await newRecoveryProof('rk');
    const b = await newRecoveryProof('rk');
    expect(a.recoveryKeySalt).toMatch(/^[a-f0-9]{32}$/);
    expect(a.recoveryKeySalt).not.toBe(b.recoveryKeySalt);
    expect(await deriveRecoveryProof('rk', a.recoveryKeySalt)).toBe(a.recoveryKeyHash);
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Me@Example.COM ')).toBe('me@example.com');
  });
});
