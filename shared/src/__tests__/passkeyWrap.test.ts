import { describe, it, expect } from 'vitest';
import { encryptionService } from '../crypto/encryptionService.js';
import { derivePasskeyKek, passkeyPrfInput, generateMasterKey, encrypt, decrypt } from '../crypto/primitives.js';
import {
  changePasswordSchema, deleteAccountSchema, disable2FASchema, passkeyLoginSchema, passkeyNameSchema, passkeyRegisterSchema,
  confirmOptionsSchema, twoFALoginSchema,
} from '../validation/schemas.js';

const prf = (fill: number) => new Uint8Array(32).fill(fill);

describe('passkey wrap of the master key', () => {
  it('opens with the same passkey secret, into a key that cannot be exported', async () => {
    const master = await generateMasterKey();
    const sealed = await encrypt(master, 'dear diary');
    const { wrappedMK, wrapIv } = await encryptionService.wrapForPasskey(master, prf(1), 'cred-a');

    const opened = await encryptionService.unwrapWithPasskey(prf(1), wrappedMK, wrapIv, 'cred-a');
    expect(opened.extractable).toBe(false);
    expect(opened.usages.sort()).toEqual(['decrypt', 'encrypt']);
    expect(await decrypt(opened, sealed.ciphertext, sealed.iv)).toBe('dear diary');
    await expect(crypto.subtle.exportKey('raw', opened)).rejects.toThrow();
  });

  it('is a wrapped 32-byte key: 64 base64 characters, a 12-byte IV', async () => {
    const { wrappedMK, wrapIv } = await encryptionService.wrapForPasskey(await generateMasterKey(), prf(1), 'cred-a');
    expect(wrappedMK).toMatch(/^[A-Za-z0-9+/]{64}$/);
    expect(wrapIv).toMatch(/^[A-Za-z0-9+/]{16}$/);
  });

  it('does not open with another passkey’s secret', async () => {
    const { wrappedMK, wrapIv } = await encryptionService.wrapForPasskey(await generateMasterKey(), prf(1), 'cred-a');
    await expect(encryptionService.unwrapWithPasskey(prf(2), wrappedMK, wrapIv, 'cred-a')).rejects.toThrow();
  });

  it('is bound to its passkey: filed under another credential it does not open, even with the right secret', async () => {
    const { wrappedMK, wrapIv } = await encryptionService.wrapForPasskey(await generateMasterKey(), prf(1), 'cred-a');
    await expect(encryptionService.unwrapWithPasskey(prf(1), wrappedMK, wrapIv, 'cred-b')).rejects.toThrow();
  });

  it('is bound to its purpose: a password wrap never opens as a passkey wrap, nor the reverse', async () => {
    const setup = await encryptionService.setupEncryption('Correct-horse-9-battery');
    // The password wrap, tried as a passkey wrap
    await expect(encryptionService.unwrapWithPasskey(prf(1), setup.wrappedMK, setup.wrapIv, 'cred-a')).rejects.toThrow();
    // A passkey wrap, tried as the password wrap
    const extractable = await encryptionService.extractableFromPassword('Correct-horse-9-battery', setup.salt, setup.wrappedMK, setup.wrapIv, 600000);
    const { wrappedMK, wrapIv } = await encryptionService.wrapForPasskey(extractable, prf(1), 'cred-a');
    await expect(encryptionService.unwrapMasterKey('Correct-horse-9-battery', setup.salt, wrappedMK, wrapIv, 600000)).rejects.toThrow();
  }, 30_000);

  it('the password and a passkey open the same key', async () => {
    const setup = await encryptionService.setupEncryption('Correct-horse-9-battery');
    const sealed = await encrypt(setup.masterKey, 'same key');
    const extractable = await encryptionService.extractableFromPassword('Correct-horse-9-battery', setup.salt, setup.wrappedMK, setup.wrapIv, 600000);
    expect(extractable.extractable).toBe(true);
    const { wrappedMK, wrapIv } = await encryptionService.wrapForPasskey(extractable, prf(9), 'cred-a');
    const viaPasskey = await encryptionService.unwrapWithPasskey(prf(9), wrappedMK, wrapIv, 'cred-a');
    expect(await decrypt(viaPasskey, sealed.ciphertext, sealed.iv)).toBe('same key');

    // A passkey touch can make the next wrap too (confirming a password change with a passkey)
    const again = await encryptionService.extractableFromPasskey(prf(9), wrappedMK, wrapIv, 'cred-a');
    const rewrapped = await encryptionService.rewrapMasterKey(again, 'Another-horse-7-staple');
    const viaNewPassword = await encryptionService.unwrapMasterKey('Another-horse-7-staple', rewrapped.salt, rewrapped.wrappedMK, rewrapped.wrapIv, 600000);
    expect(await decrypt(viaNewPassword, sealed.ciphertext, sealed.iv)).toBe('same key');
  }, 60_000);

  it('takes only a 32-byte secret, and derives a key that only wraps', async () => {
    await expect(derivePasskeyKek(new Uint8Array(16))).rejects.toThrow('32 bytes');
    const kek = await derivePasskeyKek(prf(3));
    expect(kek.extractable).toBe(false);
    expect(kek.usages.sort()).toEqual(['unwrapKey', 'wrapKey']);
  });

  it('asks every passkey for the same fixed 32 bytes', async () => {
    const a = await passkeyPrfInput();
    const b = await passkeyPrfInput();
    expect(a.byteLength).toBe(32);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('confirmation: the password, or a passkey token — exactly one', () => {
  const SECRET = 'a'.repeat(64);
  const TOKEN = 'b'.repeat(64);
  const change = { newAuthSecret: SECRET, newEncryptedMasterKey: 'A'.repeat(64), newKekSalt: 'AAAAAAAAAAAAAAAAAAAAAA==', newKekWrapIv: 'B'.repeat(16) };

  it('accepts either, refuses both and neither', () => {
    expect(changePasswordSchema.safeParse({ ...change, currentAuthSecret: SECRET }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...change, confirmToken: TOKEN }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...change, currentAuthSecret: SECRET, confirmToken: TOKEN }).success).toBe(false);
    expect(changePasswordSchema.safeParse(change).success).toBe(false);
    expect(deleteAccountSchema.safeParse({}).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ confirmToken: TOKEN }).success).toBe(true);
  });

  it('turning 2FA off with the password still needs a code; with a passkey token it does not', () => {
    expect(disable2FASchema.safeParse({ authSecret: SECRET }).success).toBe(false);
    expect(disable2FASchema.safeParse({ authSecret: SECRET, code: '123456' }).success).toBe(true);
    expect(disable2FASchema.safeParse({ confirmToken: TOKEN }).success).toBe(true);
  });

  it('a token must look like one', () => {
    expect(changePasswordSchema.safeParse({ ...change, confirmToken: 'short' }).success).toBe(false);
  });

  it('only known actions can be confirmed', () => {
    expect(confirmOptionsSchema.safeParse({ action: 'delete-account' }).success).toBe(true);
    expect(confirmOptionsSchema.safeParse({ action: 'change-email' }).success).toBe(false);
    expect(confirmOptionsSchema.safeParse({ action: 'delete-account', extra: 1 }).success).toBe(false);
  });
});

describe('passkey request shapes', () => {
  const assertion = {
    id: 'abc_-', rawId: 'abc_-', type: 'public-key',
    response: { clientDataJSON: 'e30', authenticatorData: 'AAAA', signature: 'AAAA' },
  };

  it('drops whatever the browser says about extensions: the PRF secret must never be kept', () => {
    const parsed = passkeyLoginSchema.parse({ response: { ...assertion, clientExtensionResults: { prf: { results: { first: 'c2VjcmV0' } } } } });
    expect(parsed.response.clientExtensionResults).toEqual({});
    expect(JSON.stringify(parsed)).not.toContain('c2VjcmV0');
  });

  it('refuses anything that is not base64url, and oversized fields', () => {
    expect(passkeyLoginSchema.safeParse({ response: { ...assertion, id: 'has space' } }).success).toBe(false);
    expect(passkeyLoginSchema.safeParse({ response: { ...assertion, response: { ...assertion.response, signature: 'A'.repeat(3000) } } }).success).toBe(false);
    expect(passkeyLoginSchema.safeParse({ response: assertion, email: 'x@y.z' }).success).toBe(false);
  });

  it('a passkey’s wrap must be a wrapped key and its name one clean line', () => {
    const base = {
      response: { id: 'a', rawId: 'a', type: 'public-key', response: { clientDataJSON: 'e30', attestationObject: 'AAAA' } },
      wrapIv: 'B'.repeat(16), name: 'MacBook', currentAuthSecret: 'a'.repeat(64),
    };
    expect(passkeyRegisterSchema.safeParse({ ...base, wrappedMK: 'A'.repeat(64) }).success).toBe(true);
    expect(passkeyRegisterSchema.safeParse({ ...base, wrappedMK: 'A'.repeat(63) }).success).toBe(false);
    expect(passkeyRegisterSchema.safeParse({ ...base, wrappedMK: 'A'.repeat(64), wrapIv: 'short' }).success).toBe(false);
    expect(passkeyNameSchema.safeParse('  Phone  ').data).toBe('Phone');
    expect(passkeyNameSchema.safeParse('a\nb').success).toBe(false);
    expect(passkeyNameSchema.safeParse('').success).toBe(false);
    expect(passkeyNameSchema.safeParse('x'.repeat(61)).success).toBe(false);
  });

  it('the 2FA sign-in takes the trust box as a boolean only', () => {
    expect(twoFALoginSchema.safeParse({ pendingToken: 't', code: '123456', trustBrowser: true }).success).toBe(true);
    expect(twoFALoginSchema.safeParse({ pendingToken: 't', code: '123456', trustBrowser: 'yes' }).success).toBe(false);
  });
});
