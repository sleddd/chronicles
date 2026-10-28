import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

beforeAll(() => { process.env.SECRETS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64'); });

describe('tokenCrypto binding', () => {
  it('a bound secret opens only with its own AAD', async () => {
    const { encryptToken, decryptToken, isBoundToken } = await import('../services/tokenCrypto.js');
    const sealed = encryptToken('s3cret', 'totp:1');
    expect(isBoundToken(sealed)).toBe(true);
    expect(decryptToken(sealed, 'totp:1')).toBe('s3cret');
    expect(() => decryptToken(sealed, 'totp:2')).toThrow();
    expect(() => decryptToken(sealed)).toThrow();
  });

  it('an older unbound secret opens unless the caller refuses unbound ones', async () => {
    const { encryptToken, decryptToken, isBoundToken } = await import('../services/tokenCrypto.js');
    const old = encryptToken('s3cret');
    expect(isBoundToken(old)).toBe(false);
    expect(decryptToken(old)).toBe('s3cret');
    expect(decryptToken(old, 'totp:1')).toBe('s3cret');
    expect(() => decryptToken(old, 'remember:x', { allowUnbound: false })).toThrow();
  });
});
