import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const api = vi.hoisted(() => ({
  passkeyLoginOptions: vi.fn(),
  passkeyLogin: vi.fn(),
  confirmOptions: vi.fn(),
  confirmVerify: vi.fn(),
}));
vi.mock('@/services/api', () => ({ auth: api }));

import {
  PasskeyCancelled, PasskeyCannotUnlock, confirmWithPasskey, createPasskey, keepOnlyPasskeys, knownPasskeys, passkeysAvailable, rememberPasskey, signInWithPasskey, suggestedPasskeyName,
} from '@/services/passkeys';

const SECRET = new Uint8Array(32).fill(5);
const bytes = (n: number, fill = 1) => new Uint8Array(n).fill(fill).buffer;

/** What a browser hands back from navigator.credentials.get */
const assertionCred = (prf: unknown) => ({
  id: 'Y3JlZA',
  rawId: bytes(4),
  response: { clientDataJSON: bytes(8), authenticatorData: bytes(37), signature: bytes(70), userHandle: bytes(32) },
  getClientExtensionResults: () => ({ prf }),
});
const createdCred = (prf: unknown) => ({
  id: 'bmV3',
  rawId: bytes(4, 9),
  response: { clientDataJSON: bytes(8), attestationObject: bytes(120), getTransports: () => ['internal'] },
  getClientExtensionResults: () => ({ prf }),
});

const get = vi.fn();
const create = vi.fn();
const OPTIONS = { challenge: 'Y2hhbGxlbmdl', rpId: 'chronicles.test', userVerification: 'required' as const };
const CREATION = {
  challenge: 'Y2hhbGxlbmdl', rp: { id: 'chronicles.test', name: 'Chronicles' },
  user: { id: 'dXNlcg', name: 'o@example.com', displayName: 'olivia' }, pubKeyCredParams: [{ type: 'public-key' as const, alg: -7 }],
};

beforeEach(() => {
  localStorage.clear();
  get.mockReset(); create.mockReset();
  Object.values(api).forEach(f => f.mockReset());
  Object.defineProperty(navigator, 'credentials', { configurable: true, value: { get, create } });
  vi.stubGlobal('PublicKeyCredential', class {});
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('the browser’s own passkey call', () => {
  it('is used in place of the page’s copy, which a password manager may have replaced', async () => {
    const native = vi.fn().mockResolvedValue(assertionCred({ results: { first: SECRET.buffer } }));
    const frameWindow = vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get')
      .mockReturnValue({ CredentialsContainer: { prototype: { get: native } } } as unknown as Window);
    api.passkeyLoginOptions.mockResolvedValue({ options: OPTIONS });
    api.passkeyLogin.mockResolvedValue({ user: {}, passkey: {} });
    get.mockRejectedValue(new Error('a password manager’s shim'));
    try {
      await signInWithPasskey();
      expect(native).toHaveBeenCalledTimes(1);
      expect(native.mock.contexts[0]).toBe(navigator.credentials);
      expect(get).not.toHaveBeenCalled();
      expect(document.querySelector('iframe')).toBeNull();

      // The browser's own refusal is final: the page's copy is not tried after it
      native.mockRejectedValue(new DOMException('no', 'NotAllowedError'));
      await expect(signInWithPasskey()).rejects.toBeInstanceOf(PasskeyCancelled);
      expect(get).not.toHaveBeenCalled();
    } finally {
      frameWindow.mockRestore();
    }
  });
});

describe('signing in with a passkey', () => {
  it('asks for the PRF secret, a verified user, and no particular passkey', async () => {
    api.passkeyLoginOptions.mockResolvedValue({ options: OPTIONS });
    api.passkeyLogin.mockResolvedValue({ user: { email: 'o@example.com', username: 'o', totpEnabled: false }, passkey: { credentialId: 'Y3JlZA', wrappedMK: 'w', wrapIv: 'i' } });
    get.mockResolvedValue(assertionCred({ results: { first: SECRET.buffer } }));

    const result = await signInWithPasskey();

    const asked = get.mock.calls[0][0].publicKey;
    expect(asked.userVerification).toBe('required');
    expect(asked.rpId).toBe('chronicles.test');
    expect(asked.allowCredentials).toBeUndefined();
    expect(new Uint8Array(asked.extensions.prf.eval.first).byteLength).toBe(32);
    expect(Array.from(result.prf)).toEqual(Array.from(SECRET));
    expect(result.wrap.credentialId).toBe('Y3JlZA');
  });

  it('asks for the passkeys that worked here before, so a password manager has nothing to answer with', async () => {
    api.passkeyLoginOptions.mockResolvedValue({ options: OPTIONS });
    api.passkeyLogin.mockResolvedValue({ user: {}, passkey: {} });
    get.mockResolvedValue(assertionCred({ results: { first: SECRET.buffer } }));

    await signInWithPasskey();
    expect(knownPasskeys()).toEqual(['Y3JlZA']);

    await signInWithPasskey();
    const asked = get.mock.calls[1][0].publicKey.allowCredentials;
    expect(asked).toHaveLength(1);
    expect(Array.from(new Uint8Array(asked[0].id))).toEqual(Array.from(new TextEncoder().encode('cred')));

    // "Use a different passkey": whichever one the person picks
    await signInWithPasskey({ any: true });
    expect(get.mock.calls[2][0].publicKey.allowCredentials).toBeUndefined();
  });

  it('a passkey that gave no secret, or that the server never stored, is not remembered', async () => {
    api.passkeyLoginOptions.mockResolvedValue({ options: OPTIONS });
    get.mockResolvedValue(assertionCred(undefined));
    await expect(signInWithPasskey()).rejects.toBeInstanceOf(PasskeyCannotUnlock);
    expect(knownPasskeys()).toEqual([]);

    rememberPasskey('Y3JlZA');
    get.mockResolvedValue(assertionCred({ results: { first: SECRET.buffer } }));
    api.passkeyLogin.mockRejectedValue(Object.assign(new Error('not on your account'), { body: { unknownCredential: true } }));
    await expect(signInWithPasskey()).rejects.toThrow('not on your account');
    expect(knownPasskeys()).toEqual([]);
  });

  it('forgets passkeys the account no longer has', () => {
    rememberPasskey('YQ'); rememberPasskey('Yg');
    keepOnlyPasskeys(['Yg', 'Yw']);
    expect(knownPasskeys()).toEqual(['Yg']);
  });

  it('reads a secret handed back as a view or as a buffer from elsewhere', async () => {
    api.passkeyLoginOptions.mockResolvedValue({ options: OPTIONS });
    api.passkeyLogin.mockResolvedValue({ user: {}, passkey: {} });
    get.mockResolvedValue(assertionCred({ results: { first: new DataView(SECRET.buffer.slice(0)) } }));
    expect(Array.from((await signInWithPasskey({ any: true })).prf)).toEqual(Array.from(SECRET));
  });

  it('never sends the PRF secret, or any extension result, to the server', async () => {
    api.passkeyLoginOptions.mockResolvedValue({ options: OPTIONS });
    api.passkeyLogin.mockResolvedValue({ user: {}, passkey: {} });
    get.mockResolvedValue(assertionCred({ results: { first: SECRET.buffer } }));
    await signInWithPasskey();
    const sent = api.passkeyLogin.mock.calls[0][0];
    expect(sent.clientExtensionResults).toBeUndefined();
    expect(Object.keys(sent).sort()).toEqual(['id', 'rawId', 'response', 'type']);
    // 32 bytes of 0x05 as base64 / base64url would start "BQUF"
    expect(JSON.stringify(sent)).not.toContain('BQUFBQUF');
  });

  it('a passkey that gives no secret can’t open the journal: nothing is sent', async () => {
    api.passkeyLoginOptions.mockResolvedValue({ options: OPTIONS });
    get.mockResolvedValue(assertionCred(undefined));
    await expect(signInWithPasskey()).rejects.toBeInstanceOf(PasskeyCannotUnlock);
    expect(api.passkeyLogin).not.toHaveBeenCalled();
  });

  it('closing the sheet is a cancel, not an error', async () => {
    api.passkeyLoginOptions.mockResolvedValue({ options: OPTIONS });
    get.mockRejectedValue(new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError'));
    await expect(signInWithPasskey()).rejects.toBeInstanceOf(PasskeyCancelled);
  });

  it('zeroes the secret when the server refuses the sign-in', async () => {
    api.passkeyLoginOptions.mockResolvedValue({ options: OPTIONS });
    const given = new Uint8Array(32).fill(5);
    get.mockResolvedValue(assertionCred({ results: { first: given } }));
    let seen: Uint8Array | undefined;
    api.passkeyLogin.mockImplementation(async () => { throw new Error('That passkey didn’t work.'); });
    const spy = vi.spyOn(Uint8Array.prototype, 'fill');
    await expect(signInWithPasskey()).rejects.toThrow('didn’t work');
    seen = spy.mock.instances.find(i => (i as Uint8Array).byteLength === 32) as Uint8Array | undefined;
    spy.mockRestore();
    expect(seen && Array.from(seen).every(b => b === 0)).toBe(true);
  });
});

describe('confirming an action with a passkey', () => {
  it('asks for a challenge for THAT action and hands back its single-use token and wrap', async () => {
    api.confirmOptions.mockResolvedValue({ options: { ...OPTIONS, allowCredentials: [{ id: 'Y3JlZA', type: 'public-key' }] } });
    api.confirmVerify.mockResolvedValue({ confirmToken: 't'.repeat(64), passkey: { credentialId: 'Y3JlZA', wrappedMK: 'w', wrapIv: 'i' } });
    get.mockResolvedValue(assertionCred({ results: { first: SECRET.buffer } }));
    const c = await confirmWithPasskey('change-password');
    expect(api.confirmOptions).toHaveBeenCalledWith('change-password');
    expect(api.confirmVerify.mock.calls[0][0]).toBe('change-password');
    expect(get.mock.calls[0][0].publicKey.allowCredentials).toHaveLength(1);
    expect(c.confirmToken).toBe('t'.repeat(64));
    expect(c.prf.byteLength).toBe(32);
  });
});

describe('making a passkey', () => {
  it('uses the secret given at creation when there is one', async () => {
    create.mockResolvedValue(createdCred({ enabled: true, results: { first: SECRET.buffer } }));
    const made = await createPasskey(CREATION);
    expect(get).not.toHaveBeenCalled();
    expect(Array.from(made.prf)).toEqual(Array.from(SECRET));
    expect(made.credentialId).toBe('bmV3');
    expect((made.response as { clientExtensionResults?: unknown }).clientExtensionResults).toBeUndefined();
    expect((made.response as { response: { transports: string[] } }).response.transports).toEqual(['internal']);
  });

  it('asks once more for the secret when the authenticator only says it is supported', async () => {
    create.mockResolvedValue(createdCred({ enabled: true }));
    get.mockResolvedValue(assertionCred({ results: { first: SECRET.buffer } }));
    const made = await createPasskey(CREATION);
    const second = get.mock.calls[0][0].publicKey;
    // Only for the secret: this one passkey, on this site, with a challenge made here
    expect(second.allowCredentials).toHaveLength(1);
    expect(second.rpId).toBe('chronicles.test');
    expect(second.challenge.byteLength).toBe(32);
    expect(Array.from(made.prf)).toEqual(Array.from(SECRET));
  });

  it('refuses at once, with no second prompt, when nothing answers about PRF (a password manager made it)', async () => {
    create.mockResolvedValue(createdCred(undefined));
    await expect(createPasskey(CREATION)).rejects.toThrow('password manager');
    expect(get).not.toHaveBeenCalled();
  });

  it('refuses an authenticator with no PRF: it could sign in but never open the journal', async () => {
    create.mockResolvedValue(createdCred({ enabled: false }));
    await expect(createPasskey(CREATION)).rejects.toBeInstanceOf(PasskeyCannotUnlock);
    expect(get).not.toHaveBeenCalled();
  });

  it('refuses when the second touch still gives no secret', async () => {
    create.mockResolvedValue(createdCred({}));
    get.mockResolvedValue(assertionCred({}));
    await expect(createPasskey(CREATION)).rejects.toBeInstanceOf(PasskeyCannotUnlock);
  });

  it('requires a discoverable, user-verified passkey as the server asked', async () => {
    create.mockResolvedValue(createdCred({ results: { first: SECRET.buffer } }));
    await createPasskey({ ...CREATION, authenticatorSelection: { residentKey: 'required', userVerification: 'required' } });
    expect(create.mock.calls[0][0].publicKey.authenticatorSelection).toEqual({ residentKey: 'required', userVerification: 'required' });
  });
});

describe('whether the button shows', () => {
  it('not without passkeys in the browser, and not when it says it has no PRF', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined);
    expect(await passkeysAvailable()).toBe(false);
    vi.stubGlobal('PublicKeyCredential', class { static getClientCapabilities = async () => ({ 'extension:prf': false }); });
    expect(await passkeysAvailable()).toBe(false);
  });

  it('when it says it has PRF, or can’t say', async () => {
    vi.stubGlobal('PublicKeyCredential', class { static getClientCapabilities = async () => ({ 'extension:prf': true }); });
    expect(await passkeysAvailable()).toBe(true);
    vi.stubGlobal('PublicKeyCredential', class {});
    expect(await passkeysAvailable()).toBe(true);
  });

  it('suggests a name from the browser and system', () => {
    expect(suggestedPasskeyName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15')).toBe('Safari on macOS');
    expect(suggestedPasskeyName('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36')).toBe('Chrome on Android');
    expect(suggestedPasskeyName('')).toBe('Browser');
  });
});
