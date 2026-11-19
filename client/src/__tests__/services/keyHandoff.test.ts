import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { holdKey, keyHolderExists, keylessPage, requestKey } from '@/services/keyHandoff';

// An app page: the landing page and the public pages never ask for the key
beforeEach(() => { window.history.replaceState({}, '', '/dashboard'); });

const makeKey = (extractable = false) =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt']) as Promise<CryptoKey>;

describe('a new tab takes the key from one that holds it', () => {
  let release: (() => void) | undefined;
  afterEach(() => { release?.(); release = undefined; });

  it('gets the key from a tab signed in as the same person, still non-extractable and usable', async () => {
    const key = await makeKey();
    release = holdKey(() => ({ key, email: 'olivia@example.com' }));
    const got = await requestKey('olivia@example.com', 1000);
    expect(got).not.toBeNull();
    expect(got!.extractable).toBe(false);
    const iv = new Uint8Array(12);
    const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode('same key'));
    expect(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, got!, sealed))).toBe('same key');
  });

  it('sends the key on the request’s own channel, never on the one every tab listens to', async () => {
    const key = await makeKey();
    release = holdKey(() => ({ key, email: 'olivia@example.com' }));
    const eavesdropper = new BroadcastChannel('chronicles-key');
    const heard: unknown[] = [];
    eavesdropper.onmessage = e => { heard.push(e.data); };
    expect(await requestKey('olivia@example.com', 1000)).not.toBeNull();
    eavesdropper.close();
    expect(heard.some(m => (m as { type?: string }).type === 'key')).toBe(false);
  });

  it('pages that never need the key neither ask for it nor hand it out', async () => {
    expect(keylessPage('/')).toBe(true);
    expect(keylessPage('/share/abc')).toBe(true);
    expect(keylessPage('/public-shelf/tok')).toBe(true);
    expect(keylessPage('/terms')).toBe(true);
    expect(keylessPage('/dashboard')).toBe(false);
    expect(keylessPage('/login')).toBe(false);
    expect(keylessPage('/sharegarden')).toBe(false);
    const key = await makeKey();
    release = holdKey(() => ({ key, email: 'olivia@example.com' }));
    window.history.replaceState({}, '', '/public-shelf/tok');
    expect(await requestKey('olivia@example.com', 300)).toBeNull();
  });

  it('never hands a key to a tab the server says is someone else', async () => {
    const key = await makeKey();
    release = holdKey(() => ({ key, email: 'olivia@example.com' }));
    expect(await requestKey('mallory@example.com', 300)).toBeNull();
  });

  it('a tab that is still signing in (no key yet) gives none', async () => {
    release = holdKey(() => null);
    expect(await requestKey('olivia@example.com', 300)).toBeNull();
  });

  it('with no holder, nothing answers', async () => {
    expect(await requestKey('olivia@example.com', 200)).toBeNull();
  });

  it('refuses an extractable key if one were ever offered', async () => {
    const key = await makeKey(true);
    release = holdKey(() => ({ key, email: 'olivia@example.com' }));
    expect(await requestKey('olivia@example.com', 300)).toBeNull();
  });

  it('stops answering once released (the session ended)', async () => {
    const key = await makeKey();
    const stop = holdKey(() => ({ key, email: 'olivia@example.com' }));
    stop();
    expect(await requestKey('olivia@example.com', 200)).toBeNull();
  });

  it('without Web Locks (Safari was found without them), asks who is here: a holder answers, silence means nobody', async () => {
    expect(navigator.locks).toBeUndefined();
    expect(await keyHolderExists(150)).toBe(false);
    const key = await makeKey();
    release = holdKey(() => ({ key, email: 'olivia@example.com' }));
    expect(await keyHolderExists(150)).toBe(true);
  });

  it('a tab that is signing in counts as here: the browser’s session is in use', async () => {
    release = holdKey(() => null);
    expect(await keyHolderExists(150)).toBe(true);
  });

  it('with neither Web Locks nor a channel, it can’t say (and then no session is ended on a guess)', async () => {
    const BC = globalThis.BroadcastChannel;
    // @ts-expect-error removing it for the test
    delete globalThis.BroadcastChannel;
    try { expect(await keyHolderExists(50)).toBeNull(); } finally { globalThis.BroadcastChannel = BC; }
  });

  it('sees a holder through Web Locks where the browser has them', async () => {
    const held = [{ name: 'chronicles-key' }];
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { query: async () => ({ held }), request: () => new Promise(() => {}) } });
    try {
      expect(await keyHolderExists()).toBe(true);
      held.length = 0;
      expect(await keyHolderExists()).toBe(false);
    } finally {
      Reflect.deleteProperty(navigator, 'locks');
    }
  });
});
