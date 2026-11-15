import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useEntriesStore } from '../stores/entriesStore.js';

/**
 * Sign out of this browser — the person pressed it: drop the master key, end
 * the session, end this browser's trust (it will be asked for a 2FA code
 * again), wipe everything the browser stores, and go to the sign-in page.
 * Shared by Settings → Sign Out and the nav's Sign out.
 */
export function useSignOut(): () => Promise<void> {
  const { logout } = useAuth();
  const { clearKey } = useEncryption();
  const clearAll = useEntriesStore(s => s.clearAll);
  const navigate = useNavigate();

  return useCallback(async () => {
    clearKey();
    clearAll();
    await logout();
    navigate('/login');
  }, [clearKey, clearAll, logout, navigate]);
}

/**
 * The session ends by itself (15 minutes away): the key and everything
 * decrypted leave this tab and the session ends on the server, but what the
 * browser stores stays — the encrypted journal cache, sealed drafts, and this
 * browser's trust — for the same person's next sign-in.
 */
export function useEndSession(): (signInNote: string) => Promise<void> {
  const { endSession } = useAuth();
  const { clearKey } = useEncryption();
  const navigate = useNavigate();

  return useCallback(async (signInNote: string) => {
    clearKey();
    await endSession();
    navigate('/login', { replace: true, state: { signInNote } });
  }, [clearKey, endSession, navigate]);
}
