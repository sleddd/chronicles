import { describe, it, expect, afterEach } from 'vitest';
import crypto from 'crypto';
import { tokenCryptoProblem, isTokenCryptoConfigured } from '../services/tokenCrypto.js';

const saved = { s: process.env.SECRETS_ENCRYPTION_KEY, c: process.env.CALENDAR_TOKEN_KEY };
const set = (s?: string, c?: string) => {
  if (s === undefined) delete process.env.SECRETS_ENCRYPTION_KEY; else process.env.SECRETS_ENCRYPTION_KEY = s;
  if (c === undefined) delete process.env.CALENDAR_TOKEN_KEY; else process.env.CALENDAR_TOKEN_KEY = c;
};

afterEach(() => set(saved.s, saved.c));

describe('tokenCryptoProblem (startup warnings)', () => {
  it('is null for base64 of 32 bytes, quotes or a trailing newline included', () => {
    const key = crypto.randomBytes(32).toString('base64');
    set(key);
    expect(tokenCryptoProblem()).toBeNull();
    expect(isTokenCryptoConfigured()).toBe(true);
    set(`"${key}"\n`);
    expect(tokenCryptoProblem()).toBeNull();
  });

  it('says when neither variable is set', () => {
    set();
    expect(tokenCryptoProblem()).toMatch(/is not set/);
  });

  it('says what a wrong-length key decodes to — and never prints it', () => {
    const key = crypto.randomBytes(24).toString('base64'); // 32 characters, 24 bytes
    set(key);
    const msg = tokenCryptoProblem()!;
    expect(msg).toMatch(/SECRETS_ENCRYPTION_KEY is set \(32 characters\) but decodes to 24 bytes, not 32/);
    expect(msg).not.toContain(key);
    expect(isTokenCryptoConfigured()).toBe(false);
  });

  it('names CALENDAR_TOKEN_KEY when that is the one read', () => {
    set(undefined, crypto.randomBytes(32).toString('hex'));
    expect(tokenCryptoProblem()).toMatch(/^CALENDAR_TOKEN_KEY is set \(64 characters\) but decodes to 48 bytes/);
  });
});
