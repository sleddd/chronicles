'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useEncryption } from '@/lib/hooks/useEncryption';

export function PasswordReentryModal() {
  const { status } = useSession();
  const { isKeyReady } = useEncryption();
  const [hasWaited, setHasWaited] = useState(false);

  // Give EncryptionProvider time to restore key from sessionStorage before signing out
  useEffect(() => {
    if (status === 'authenticated' && !isKeyReady) {
      // Wait a short time for key restoration before signing out
      const timer = setTimeout(() => {
        setHasWaited(true);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setHasWaited(false);
    }
  }, [status, isKeyReady]);

  // Only sign out after waiting for key restoration attempt
  useEffect(() => {
    if (status === 'authenticated' && !isKeyReady && hasWaited) {
      // Sign out and redirect to login - user needs to re-authenticate
      signOut({ callbackUrl: '/login' });
    }
  }, [status, isKeyReady, hasWaited]);

  // Don't render anything - just handle the redirect
  return null;
}
