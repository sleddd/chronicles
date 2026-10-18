import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useEntriesStore } from '../stores/entriesStore.js';

/**
 * Sign out of this device: drop the master key (and any "remember me" unlock),
 * clear the decrypted cache, end the session, and go to the sign-in page.
 * Shared by Settings → Sign Out and the nav's Sign out button.
 */
export function useSignOut(): () => Promise<void> {
  const { logout } = useAuth();
  const { lock } = useEncryption();
  const clearAll = useEntriesStore(s => s.clearAll);
  const navigate = useNavigate();

  return useCallback(async () => {
    lock();
    clearAll();
    await logout();
    navigate('/login');
  }, [lock, clearAll, logout, navigate]);
}
