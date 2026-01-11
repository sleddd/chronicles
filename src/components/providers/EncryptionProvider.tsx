'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { useEntriesCache } from '@/lib/hooks/useEntriesCache';
import { useInactivityTimeout } from '@/lib/hooks/useInactivityTimeout';
import { useSecurityClear } from '@/lib/hooks/useSecurityClear';
import { LegacyKeyMigration } from '@/components/auth/LegacyKeyMigration';

// Inactivity warning toast component
function InactivityWarning({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 animate-pulse">
      <div className="bg-amber-100 border-2 border-amber-500 rounded-lg shadow-lg p-4 max-w-sm">
        <div className="flex items-start gap-3">
          <svg className="w-6 h-6 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1">
            <h4 className="font-semibold text-amber-800">Session Timeout Warning</h4>
            <p className="text-sm text-amber-700 mt-1">
              You will be logged out in 1 minute due to inactivity.
            </p>
            <button
              onClick={onDismiss}
              className="mt-2 text-sm font-medium text-amber-800 hover:text-amber-900 underline"
            >
              Stay logged in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EncryptionProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const { clearKey, isKeyReady, restoreKeyFromSession } = useEncryption();
  const { initialize: initializeCache, clearCache, isInitialized: isCacheInitialized } = useEntriesCache();
  const { clearAllSensitiveData, registerCleanup, unregisterCleanup } = useSecurityClear();
  const restorationAttempted = useRef(false);
  const cacheInitAttempted = useRef(false);
  const [showWarning, setShowWarning] = useState(false);

  // Register cache cleanup with security clear registry
  useEffect(() => {
    registerCleanup('entries-cache', clearCache);
    return () => {
      unregisterCleanup('entries-cache');
    };
  }, [registerCleanup, unregisterCleanup, clearCache]);

  // Initialize entries cache when authenticated and encryption key is ready
  useEffect(() => {
    if (status === 'authenticated' && isKeyReady && !isCacheInitialized && !cacheInitAttempted.current) {
      cacheInitAttempted.current = true;
      initializeCache();
    }
  }, [status, isKeyReady, isCacheInitialized, initializeCache]);

  // Handle inactivity timeout - clear all sensitive data and logout
  const handleTimeout = useCallback(async () => {
    setShowWarning(false);
    clearAllSensitiveData(); // Clear all registered component data
    clearKey(); // Clear encryption key
    await signOut({ redirect: true, callbackUrl: '/login' });
  }, [clearKey, clearAllSensitiveData]);

  // Handle inactivity warning
  const handleWarning = useCallback(() => {
    setShowWarning(true);
  }, []);

  // Dismiss warning (activity detected)
  const handleDismissWarning = useCallback(() => {
    setShowWarning(false);
  }, []);

  // Enable inactivity timeout only when authenticated and key is ready
  useInactivityTimeout({
    onTimeout: handleTimeout,
    onWarning: handleWarning,
    enabled: status === 'authenticated' && isKeyReady,
  });

  // Dismiss warning on any activity (the hook already resets timer)
  useEffect(() => {
    if (showWarning) {
      const dismissOnActivity = () => {
        setShowWarning(false);
      };

      const events = ['mousedown', 'keydown', 'touchstart'];
      events.forEach(event => {
        window.addEventListener(event, dismissOnActivity, { once: true });
      });

      return () => {
        events.forEach(event => {
          window.removeEventListener(event, dismissOnActivity);
        });
      };
    }
  }, [showWarning]);

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
      cacheInitAttempted.current = false;
      clearAllSensitiveData(); // Clear all registered component data (includes cache)
      clearKey();
      sessionStorage.removeItem('recent_login');
    }
  }, [status, clearKey, clearAllSensitiveData]);

  // Handle beforeunload - backup cleanup for tab/browser close
  useEffect(() => {
    const handleUnload = () => {
      clearKey();
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [clearKey]);

  return (
    <>
      {children}
      <LegacyKeyMigration />
      {showWarning && <InactivityWarning onDismiss={handleDismissWarning} />}
    </>
  );
}
