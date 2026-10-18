import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { auth as authApi, ApiError } from '../services/api.js';
import { deriveAuthSecret } from '@chronicles/shared';

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
  const [encryptionData, setEncryptionData] = useState<EncryptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pending2FA, setPending2FA] = useState<Pending2FA | null>(null);

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
    const authSecret = await deriveAuthSecret(password, email);
    let result;
    try {
      result = await authApi.login({ email, authSecret });
    } catch (err) {
      // An account from before derived secrets is checked against the password
      // once; that sign-in replaces its hash, so it's never sent again
      if (!(err instanceof ApiError && err.body.legacyAuth)) throw err;
      result = await authApi.login({ email, authSecret, legacyPassword: password });
    }
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

    // Clear all persisted site data in parallel
    await Promise.allSettled([
      // Web Storage
      (async () => { localStorage.clear(); sessionStorage.clear(); })(),

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
      register,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export { ApiError };
