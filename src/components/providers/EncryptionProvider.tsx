'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { LegacyKeyMigration } from '@/components/auth/LegacyKeyMigration';

export function EncryptionProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const { clearKey, isKeyReady, restoreKeyFromSession } = useEncryption();
  const restorationAttempted = useRef(false);

  // Restore encryption key from sessionStorage when authenticated but key not ready
  useEffect(() => {
    if (status === 'authenticated' && !isKeyReady && !restorationAttempted.current) {
      restorationAttempted.current = true;
      restoreKeyFromSession().then((restored) => {
        if (!restored) {
          console.log('[EncryptionProvider] No key in sessionStorage to restore');
        }
      });
    }
  }, [status, isKeyReady, restoreKeyFromSession]);

  // Reset restoration flag when user logs out
  useEffect(() => {
    if (status === 'unauthenticated') {
      restorationAttempted.current = false;
      clearKey();
      sessionStorage.removeItem('recent_login');
    }
  }, [status, clearKey]);

  return (
    <>
      {children}
      <LegacyKeyMigration />
    </>
  );
}
