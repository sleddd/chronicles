import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext.js';
import { useEncryption } from '../contexts/EncryptionContext.js';

/**
 * Before any sign-in (password, sign-up, recovery): drop whatever this browser
 * still holds for the last person — their master key and Remember me unlock,
 * every decrypted entry, topic and setting, and the browser's stored copies —
 * so a new account can never start on top of someone else's data, even when
 * they never signed out (a closed tab, an expired session).
 */
export function useFreshSignIn(): () => Promise<void> {
  const { resetLocal } = useAuth();
  const { lock } = useEncryption();
  return useCallback(async () => {
    lock();
    await resetLocal();
  }, [lock, resetLocal]);
}
