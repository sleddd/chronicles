'use client';

import { useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useEncryption } from '@/lib/hooks/useEncryption';

export function PasswordReentryModal() {
  const { status } = useSession();
  const { isKeyReady } = useEncryption();

  // When authenticated but key is not ready, sign out and redirect to login
  useEffect(() => {
    if (status === 'authenticated' && !isKeyReady) {
      // Sign out and redirect to login - user needs to re-authenticate
      signOut({ callbackUrl: '/login' });
    }
  }, [status, isKeyReady]);

  // Don't render anything - just handle the redirect
  return null;
}
