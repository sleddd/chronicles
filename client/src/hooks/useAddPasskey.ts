import { useCallback, useRef } from 'react';
import { useEncryption, type KeySource } from '../contexts/EncryptionContext.js';
import { auth as authApi, type PasskeyInfo } from '../services/api.js';
import { PasskeyCancelled, PasskeyCannotUnlock, createPasskey, rememberPasskey, suggestedPasskeyName } from '../services/passkeys.js';

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
export function useAddPasskey(): (source: KeySource, confirmToken: string, name: string, onSecondTouch?: () => void) => Promise<PasskeyInfo[]> {
  const { verifyKeySource, passkeyWrapWith } = useEncryption();
  return useCallback(async (source, confirmToken, name, onSecondTouch) => {
    await verifyKeySource(source);
    const { options } = await authApi.passkeyRegisterOptions();
    const made = await createPasskey(options, onSecondTouch);
    try {
      const wrap = await passkeyWrapWith(source, made.prf, made.credentialId);
      const { passkeys } = await authApi.passkeyRegister({ response: made.response, ...wrap, name: name.trim() || suggestedPasskeyName(), confirmToken });
      // It works here: sign-in asks for it by name from now on
      rememberPasskey(made.credentialId);
      return passkeys;
    } catch (err) {
      made.forget();
      throw err;
    } finally {
      made.prf.fill(0);
    }
  }, [verifyKeySource, passkeyWrapWith]);
}

type PasswordSource = KeySource & { kind: 'password'; confirmToken: string };
/** A confirmation is good for five minutes on the server: reuse it for a little less */
const CONFIRMATION_KEPT_MS = 4 * 60 * 1000;

/**
 * The password confirmation for adding a passkey, kept across tries.
 *
 * Making the passkey can fail on the device before the server is ever asked to
 * store it: the sheet was closed, or a password manager saved a passkey that
 * can't open the journal. The confirmation is still unspent then, so the next
 * try reuses it. Without this every retry re-checked the password (five tries
 * in fifteen minutes) and needed a fresh 2FA code, and someone whose password
 * manager kept taking the passkey ran out of tries before they could add one.
 *
 * `failed(err)` says whether the confirmation survives that failure; anything
 * that reached the server (or wasn't a device-side failure) drops it.
 */
export function usePasskeyAddConfirmation(): {
  confirm: (password: string, email: string, code?: string) => Promise<PasswordSource>;
  failed: (err: unknown) => void;
  drop: () => void;
} {
  const { passwordSource } = useEncryption();
  const held = useRef<{ source: PasswordSource; at: number } | null>(null);
  const drop = useCallback(() => { held.current = null; }, []);
  const confirm = useCallback(async (password: string, email: string, code?: string) => {
    if (held.current && Date.now() - held.current.at < CONFIRMATION_KEPT_MS) return held.current.source;
    const source = await passwordSource(password, email, 'passkey-add', code);
    held.current = { source, at: Date.now() };
    return source;
  }, [passwordSource]);
  const failed = useCallback((err: unknown) => {
    if (!(err instanceof PasskeyCancelled) && !(err instanceof PasskeyCannotUnlock)) held.current = null;
  }, []);
  return { confirm, failed, drop };
}
