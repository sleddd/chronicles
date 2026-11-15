import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext.js';
import { useEncryption } from '../contexts/EncryptionContext.js';

/**
 * Before any sign-in (password, passkey, sign-up, recovery): drop whatever
 * this tab still holds in memory for the last person — their master key and
 * every decrypted entry, topic and setting — and tell the other tabs who is
 * signing in, so one showing someone else lets go too.
 *
 * What the browser has STORED (the encrypted journal cache, sealed drafts,
 * preferences) is not touched here. Once the new key is open it decides: kept
 * when it is the same person coming back, wiped before anything loads when it
 * is anyone else (`claimBrowserFor`, services/browserData.ts) — so a new
 * account still never starts on top of someone else's data.
 *
 * Pass the email when it's known (a passkey sign-in learns it from the server).
 */
export function useFreshSignIn(): (email?: string | null) => Promise<void> {
  const { beginSignIn } = useAuth();
  const { clearKey, claimKeyHolder } = useEncryption();
  return useCallback(async (email: string | null = null) => {
    clearKey();
    // From here another tab must not take the browser's session for nobody's
    claimKeyHolder();
    await beginSignIn(email);
  }, [clearKey, claimKeyHolder, beginSignIn]);
}
