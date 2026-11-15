import { describe, it, expect } from 'vitest';
import { passkeyUserHandle, webauthnConfig } from '../services/webauthn.js';
import { memoryState } from '../services/sharedState.js';

describe('passkey settings', () => {
  it('ties passkeys to the app’s own host, and accepts only its origins', () => {
    const c = webauthnConfig({ APP_URL: 'https://app.chronicles.example/some/path', CLIENT_URL: 'https://app.chronicles.example' });
    expect(c.rpID).toBe('app.chronicles.example');
    expect(c.origins).toEqual(['https://app.chronicles.example']);
  });

  it('WEBAUTHN_RP_ID can name a parent domain', () => {
    expect(webauthnConfig({ APP_URL: 'https://app.example.com', WEBAUTHN_RP_ID: ' example.com ' }).rpID).toBe('example.com');
  });

  it('falls back to CLIENT_URL, then to localhost for development', () => {
    expect(webauthnConfig({ CLIENT_URL: 'https://c.example' }).rpID).toBe('c.example');
    const dev = webauthnConfig({});
    expect(dev.rpID).toBe('localhost');
    expect(dev.origins).toContain('http://localhost:5173');
  });

  it('ignores an address that is not a URL', () => {
    expect(webauthnConfig({ APP_URL: 'not a url', CLIENT_URL: 'https://c.example' }).origins).toEqual(['https://c.example']);
  });

  it('the user handle is the same for an account every time, differs between accounts, and names no one', () => {
    const env = { SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') };
    const a = passkeyUserHandle(41, env);
    expect(a).toHaveLength(32);
    expect(passkeyUserHandle(41, env).equals(a)).toBe(true);
    expect(passkeyUserHandle(42, env).equals(a)).toBe(false);
    expect(a.toString('latin1')).not.toContain('41');
    // Not guessable without the server's key
    expect(passkeyUserHandle(41, { SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64') }).equals(a)).toBe(false);
  });
});

describe('spending a token', () => {
  it('gives its account once, then never again', async () => {
    const state = memoryState();
    await state.putToken('confirm:delete-account:sel', 'tok', 7, 60_000);
    expect(await state.takeToken('confirm:delete-account:sel', 'tok')).toBe(7);
    expect(await state.takeToken('confirm:delete-account:sel', 'tok')).toBeNull();
  });

  it('is only in the bucket it was put in, and gone once expired', async () => {
    const state = memoryState();
    await state.putToken('confirm:delete-account:sel', 'tok', 7, 60_000);
    expect(await state.takeToken('confirm:change-password:sel', 'tok')).toBeNull();
    expect(await state.takeToken('confirm:delete-account:other', 'tok')).toBeNull();
    expect(await state.takeToken('confirm:delete-account:sel', 'tok')).toBe(7);
    await state.putToken('b', 'old', 7, -1);
    expect(await state.takeToken('b', 'old')).toBeNull();
  });

  it('a challenge issued to nobody in particular (sign-in) is still a real token', async () => {
    const state = memoryState();
    await state.putToken('passkey_login', 'challenge', 0, 60_000);
    expect(await state.takeToken('passkey_login', 'challenge')).toBe(0);
  });
});
