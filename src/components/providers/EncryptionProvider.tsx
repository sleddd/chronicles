'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useEncryption } from '@/lib/hooks/useEncryption';

export function EncryptionProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const { clearKey } = useEncryption();

  // Clear encryption key when user logs out
  useEffect(() => {
    if (status === 'unauthenticated') {
      clearKey();
      sessionStorage.removeItem('recent_login');
    }
  }, [status, clearKey]);

  return <>{children}</>;
}
