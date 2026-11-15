import { useCallback } from 'react';
import { useEncryption, type KeySource } from '../contexts/EncryptionContext.js';
import { auth as authApi, type PasskeyInfo } from '../services/api.js';
import { createPasskey, suggestedPasskeyName } from '../services/passkeys.js';

/**
 * Make a passkey on this device and store it with its wrap of the master key.
 *
 * `source` opens the key for the new wrap (the typed password, or a passkey
 * the account already has) and `confirmToken` is the single-use confirmation
 * that came with it — both are checked before anything is made on the device.
 * A passkey the server then refuses is dropped from the device where browsers
 * allow, and its secret is zeroed whatever happens.
 *
 * Shared by Settings → Security → Passkeys and the sign-up step.
 */
export function useAddPasskey(): (source: KeySource, confirmToken: string, name: string) => Promise<PasskeyInfo[]> {
  const { verifyKeySource, passkeyWrapWith } = useEncryption();
  return useCallback(async (source, confirmToken, name) => {
    await verifyKeySource(source);
    const { options } = await authApi.passkeyRegisterOptions();
    const made = await createPasskey(options);
    try {
      const wrap = await passkeyWrapWith(source, made.prf, made.credentialId);
      const { passkeys } = await authApi.passkeyRegister({ response: made.response, ...wrap, name: name.trim() || suggestedPasskeyName(), confirmToken });
      return passkeys;
    } catch (err) {
      made.forget();
      throw err;
    } finally {
      made.prf.fill(0);
    }
  }, [verifyKeySource, passkeyWrapWith]);
}
