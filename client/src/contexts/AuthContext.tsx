import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { auth as authApi, ApiError } from '../services/api.js';
import { deriveAuthSecret } from '@chronicles/shared';
import { clearEntryCache } from '../services/entryCache.js';
import { setEgressAccount, EGRESS_STORE } from '../services/deviceConsent.js';
import { SEEN_MARKERS_STORE } from '../services/sealedFormats.js';

/** Kept through sign-out: they hold no data, and dropping them would weaken what they guard. */
const KEPT_ON_SIGN_OUT = [EGRESS_STORE, SEEN_MARKERS_STORE];

interface User {
  email: string;
  username: string;
  totpEnabled: boolean;
}

interface EncryptionData {
  encryptionEnabled: boolean;
  kekSalt: string | null;
  encryptedMasterKey: string | null;
  kekWrapIv: string | null;
  kekIterations: number;
  recoveryWrappedMK: string | null;
  recoveryWrapIv: string | null;
}

interface Pending2FA {
  pendingToken: string;
}

interface AuthContextValue {
  user: User | null;
  encryptionData: EncryptionData | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  pending2FA: Pending2FA | null;
  login: (email: string, password: string) => Promise<EncryptionData | null>;
  submitTotpCode: (code: string) => Promise<EncryptionData>;
  /** Leave the 2FA code screen and go back to the sign-in form */
  cancel2FA: () => void;
  /** Replace the cached key data (after the master key was re-wrapped) */
  updateEncryptionData: (patch: Partial<EncryptionData>) => void;
  register: (data: {
    email: string;
    username: string;
    authSecret: string;
    encryptedMasterKey: string;
    kekSalt: string;
    kekWrapIv: string;
    recoveryWrappedMK: string;
    recoveryWrapIv: string;
    recoveryKeyHash: string;
    recoveryKeySalt: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // The off-device switches are recorded per account in this browser, under a
  // hash of the email (deviceConsent.ts)
  useEffect(() => {
    const email = user?.email?.trim().toLowerCase();
    if (!email) { setEgressAccount(null); return; }
    let live = true;
    void crypto.subtle.digest('SHA-256', new TextEncoder().encode(email)).then(d => {
      if (live) setEgressAccount(Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join(''));
    });
    return () => { live = false; };
  }, [user?.email]);
  const [encryptionData, setEncryptionData] = useState<EncryptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pending2FA, setPending2FA] = useState<Pending2FA | null>(null);

  const updateEncryptionData = useCallback((patch: Partial<EncryptionData>) => {
    setEncryptionData(prev => (prev ? { ...prev, ...patch } : prev));
  }, []);

  // Check if we have a valid session on mount
  useEffect(() => {
    fetch('/api/auth/me', {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
    })
      .then(res => {
        if (!res.ok) throw new Error('Not authenticated');
        return res.json();
      })
      .then(data => {
        setUser(data.user);
        setEncryptionData(data.encryption);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<EncryptionData | null> => {
    // Only the derived secret is sent — never the password, whatever the server answers
    const authSecret = await deriveAuthSecret(password, email);
    const result = await authApi.login({ email, authSecret });
    if (result.requires2FA) {
      setPending2FA({ pendingToken: result.pendingToken });
      return null;
    }
    setUser(result.user);
    setEncryptionData(result.encryption);
    return result.encryption;
  }, []);

  const submitTotpCode = useCallback(async (code: string): Promise<EncryptionData> => {
    if (!pending2FA) throw new Error('No pending 2FA session');
    const result = await authApi.submit2FA({ pendingToken: pending2FA.pendingToken, code });
    setPending2FA(null);
    setUser(result.user);
    setEncryptionData(result.encryption);
    return result.encryption;
  }, [pending2FA]);

  const cancel2FA = useCallback(() => setPending2FA(null), []);

  const register = useCallback(async (data: Parameters<typeof authApi.register>[0]) => {
    const result = await authApi.register(data);
    setUser({ ...result.user, totpEnabled: false });
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if server logout fails, clear client state
    }
    setUser(null);
    setEncryptionData(null);

    // The browser's copy of the journal (ciphertext) goes first: its open
    // connection would otherwise block deleting the database below
    await clearEntryCache().catch(() => {});

    // Clear all persisted site data in parallel
    await Promise.allSettled([
      // Web Storage
      (async () => {
        const kept = KEPT_ON_SIGN_OUT.map(k => [k, localStorage.getItem(k)] as const);
        localStorage.clear();
        sessionStorage.clear();
        for (const [k, v] of kept) if (v !== null) localStorage.setItem(k, v);
      })(),

      // Cache Storage (PWA / service worker caches)
      (async () => {
        if (!('caches' in window)) return;
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      })(),

      // IndexedDB — enumerate and delete every database
      (async () => {
        if (!('indexedDB' in window)) return;
        const dbs = await indexedDB.databases?.() ?? [];
        await Promise.all(dbs.map(db => new Promise<void>((res, rej) => {
          if (!db.name) return res();
          const req = indexedDB.deleteDatabase(db.name);
          req.onsuccess = () => res();
          req.onerror   = () => rej(req.error);
          req.onblocked = () => res(); // don't hang if another tab has it open
        })));
      })(),

      // Unregister service workers so stale caches don't linger
      (async () => {
        if (!('serviceWorker' in navigator)) return;
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      })(),

      // Non-HttpOnly cookies (session cookie is cleared server-side above)
      (async () => {
        document.cookie.split(';').forEach(c => {
          const name = c.split('=')[0].trim();
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        });
      })(),
    ]);

    // Clear in-memory stores
    try {
      const { useEntriesStore } = await import('../stores/entriesStore.js');
      const { useUIStore } = await import('../stores/uiStore.js');
      const { resetCalendarSyncSession } = await import('../services/calendarSync.js');
      useEntriesStore.getState().clearAll();
      useUIStore.getState().clearSearch();
      resetCalendarSyncSession();
    } catch {
      // Non-critical — stores may not be loaded
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      encryptionData,
      isAuthenticated: user !== null,
      isLoading,
      pending2FA,
      login,
      submitTotpCode,
      cancel2FA,
      updateEncryptionData,
      register,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

/** useAuth, or null outside an AuthProvider (the encryption provider uses it when present). */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export { ApiError };
