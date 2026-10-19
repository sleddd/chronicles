import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

beforeAll(() => {
  process.env.SECRETS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
});

describe('tokenCrypto', () => {
  it('refuses a truncated auth tag', async () => {
    const { encryptToken, decryptToken } = await import('../services/tokenCrypto.js');
    const sealed = encryptToken('refresh-token');
    expect(decryptToken(sealed)).toBe('refresh-token');
    const [iv, ct, tag] = sealed.split(':');
    const short = `${iv}:${ct}:${Buffer.from(tag, 'base64').subarray(0, 4).toString('base64')}`;
    expect(() => decryptToken(short)).toThrow();
  });
});

describe('notice link', () => {
  it('only an https:// link is ever shown', async () => {
    const { safeLink } = await import('../utils/safeLink.js');
    expect(safeLink('https://example.com/notice')).toBe('https://example.com/notice');
    for (const bad of ['javascript:alert(1)', 'http://example.com', 'data:text/html,x', 'not a url', '']) {
      expect(safeLink(bad)).toBeNull();
    }
    expect(safeLink(null)).toBeNull();
  });
});
