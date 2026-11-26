import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { aiUserIdFor, aiUserIdKey } from '../../services/aiUserId.js';

// The anonymous id every Anthropic request carries as metadata.user_id

const env = (vars: Record<string, string>) => vars as NodeJS.ProcessEnv;
const OWN = env({ AI_USER_ID_SECRET: 'test-ai-user-secret', SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') });

describe('aiUserIdFor', () => {
  it('is the first 32 hex characters of HMAC-SHA256(AI_USER_ID_SECRET, "chronicles-ai-user:" + account id)', () => {
    const expected = crypto.createHmac('sha256', 'test-ai-user-secret').update('chronicles-ai-user:42').digest('hex').slice(0, 32);
    expect(aiUserIdFor(42, OWN)).toBe(expected);
  });

  it('is 32 hex characters and the same every time', () => {
    const id = aiUserIdFor(42, OWN);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(aiUserIdFor(42, OWN)).toBe(id);
  });

  it('differs per account and never contains the account id itself', () => {
    const ids = new Set([1, 2, 3, 42, 1000].map(n => aiUserIdFor(n, OWN)));
    expect(ids.size).toBe(5);
    expect(aiUserIdFor(42, OWN)).not.toBe('42');
    expect(aiUserIdFor(42, OWN)).not.toBe(String(42).padStart(32, '0'));
  });

  it('changes when the secret changes', () => {
    expect(aiUserIdFor(42, env({ AI_USER_ID_SECRET: 'another' }))).not.toBe(aiUserIdFor(42, OWN));
  });

  it('without AI_USER_ID_SECRET, derives its key from the server secret, then DATABASE_URL — never the secret itself', () => {
    const serverKey = Buffer.alloc(32, 7).toString('base64');
    const fromServer = aiUserIdKey(env({ SECRETS_ENCRYPTION_KEY: serverKey, DATABASE_URL: 'postgresql://x' }));
    expect(fromServer.equals(crypto.createHmac('sha256', Buffer.from(serverKey, 'base64')).update('chronicles:ai-user-id').digest())).toBe(true);
    expect(fromServer.equals(Buffer.from(serverKey, 'base64'))).toBe(false);
    // The older alias works the same
    expect(aiUserIdKey(env({ CALENDAR_TOKEN_KEY: serverKey })).equals(fromServer)).toBe(true);
    const fromDb = aiUserIdKey(env({ DATABASE_URL: 'postgresql://x' }));
    expect(fromDb.equals(crypto.createHmac('sha256', 'postgresql://x').update('chronicles:ai-user-id').digest())).toBe(true);
    expect(aiUserIdFor(42, env({ DATABASE_URL: 'postgresql://x' }))).toMatch(/^[0-9a-f]{32}$/);
  });

  it('with no secret at all, refuses rather than fall back to the account id', () => {
    expect(() => aiUserIdFor(42, env({}))).toThrow(/AI_USER_ID_SECRET/);
  });
});
