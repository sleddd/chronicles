import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { auth as authApi, ApiError } from '../services/api.js';
import { deriveAuthSecret } from '@chronicles/shared';
import { announceLocalReset, announceSigningIn, onRemoteReset } from '../services/signOutBroadcast.js';
import { setEgressAccount } from '../services/deviceConsent.js';
import { wipeBrowserData } from '../services/browserData.js';
import { signInWithPasskey, type PasskeySignIn, type PasskeyPending2FA } from '../services/passkeys.js';
import type { PasskeyWrap } from '../services/api.js';

/** Set when sign-out couldn't reach the server: the session cookie may still be good, so the
 *  next load ends it before trusting /me (never signs the last person back in) */
const PENDING_SIGN_OUT = 'chronicles.pending-sign-out';

const tryServerLogout = async (forgetBrowser = false): Promise<boolean> => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await authApi.logout(forgetBrowser); return true; } catch { /* once more, then give up */ }
  }
  return false;
};

/** A sign-in succeeded: the server ended whatever session this browser's cookie held
 *  (revokeBrowserSession) and set a new one, so nothing is left to sign out. Left set,
 *  the flag would end this NEW session at the next page load */
const clearPendingSignOut = (): void => {
  try { localStorage.removeItem(PENDING_SIGN_OUT); } catch { /* storage blocked */ }
};

interface User {
  email: string;
  username: string;
  totpEnabled: boolean;
  /** Features this account sees while they're tried out (the server's PREVIEW_ACCOUNT_IDS) */
  previews?: string[];
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
  /** Started with a passkey: the code finishes it with that passkey's wrap */
  viaPasskey?: boolean;
}

/** What the code screen gets back: the password wrap (null when the server sent none — no key to
 *  open), or, for a passkey sign-in, that passkey's wrap */
export type TwoFAResult = { encryption: EncryptionData | null; passkey?: undefined } | { passkey: PasskeyWrap; encryption?: undefined };

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  pending2FA: Pending2FA | null;
  /** Password sign-in. The key wrap it returns is handed straight to the unlock — it is not kept here. */
  login: (email: string, password: string) => Promise<EncryptionData | null>;
  /** `trustBrowser`: don't ask this browser for a code for 30 days */
  submitTotpCode: (code: string, trustBrowser?: boolean) => Promise<TwoFAResult>;
  /** Sign in with a passkey: one touch. Returns its wrap and the secret that opens it — or,
   *  with 2FA on, a pending sign-in (the code screen shows) and the secret to hold until the code is in */
  loginWithPasskey: (opts?: { any?: boolean }) => Promise<PasskeySignIn | PasskeyPending2FA>;
  /** Leave the 2FA code screen and go back to the sign-in form */
  cancel2FA: () => void;
  /** Recovery signed this browser in (the server set its session): this tab now shows that person */
  adoptSession: (user: User) => void;
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
  /** The person pressed Sign out: end the session, end this browser's trust, wipe everything it holds */
  logout: () => Promise<void>;
  /** The session ends by itself (idle, a reload with no other tab): ended on the
   *  server, memory cleared — what the browser stores stays for the same
   *  person's next sign-in */
  endSession: () => Promise<void>;
  /** Forget who is signed in, in this tab only: the browser's session is left alone (another tab is using it) */
  dropUser: () => void;
  /** Wipe everything this browser holds for whoever was signed in (memory, storage,
   *  caches) without calling the server */
  resetLocal: () => Promise<void>;
  /** Clear what this tab holds in memory before a sign-in, telling other tabs who is signing in */
  beginSignIn: (email: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // The off-device switches are recorded per account in this browser under a
  // master-key tag (set on unlock, deviceConsent.ts); signed out, there is none
  useEffect(() => {
    if (!user?.email) setEgressAccount(null);
  }, [user?.email]);
  const [isLoading, setIsLoading] = useState(true);
  const [pending2FA, setPending2FA] = useState<Pending2FA | null>(null);

  // Check if we have a valid session on mount — unless the last sign-out didn't reach
  // the server: then end that session first and start signed out
  useEffect(() => {
    let pending = false;
    try { pending = localStorage.getItem(PENDING_SIGN_OUT) === '1'; } catch { /* storage blocked */ }
    if (pending) {
      void tryServerLogout().then(ok => {
        if (ok) clearPendingSignOut();
        setIsLoading(false);
      });
      return;
    }
    fetch('/api/auth/me', {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
    })
      .then(res => {
        if (!res.ok) throw new Error('Not authenticated');
        return res.json();
      })
      .then(data => {
        // Who is signed in — never the key wrap: that comes only with a checked
        // password or passkey. With no key in this tab, the encryption provider
        // takes it from another tab or ends this session (EncryptionContext)
        setUser(data.user);
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
    clearPendingSignOut();
    setUser(result.user);
    return result.encryption;
  }, []);

  const submitTotpCode = useCallback(async (code: string, trustBrowser = false): Promise<TwoFAResult> => {
    if (!pending2FA) throw new Error('No pending 2FA session');
    const result = await authApi.submit2FA({ pendingToken: pending2FA.pendingToken, code, ...(trustBrowser ? { trustBrowser: true } : {}) });
    setPending2FA(null);
    // A passkey sign-in learns whose account it is only now: a tab showing anyone else lets go
    if (pending2FA.viaPasskey) announceSigningIn(result.user.email);
    clearPendingSignOut();
    setUser(result.user);
    if (result.passkey) return { passkey: result.passkey };
    return { encryption: result.encryption ?? null };
  }, [pending2FA]);

  const loginWithPasskey = useCallback(async (opts?: { any?: boolean }): Promise<PasskeySignIn | PasskeyPending2FA> => {
    const result = await signInWithPasskey(opts);
    if (result.requires2FA) {
      // The touch stood in for the password; the code screen finishes it
      setPending2FA({ pendingToken: result.pendingToken, viaPasskey: true });
      return result;
    }
    // The browser's session is this person's now: a tab showing anyone else lets go
    announceSigningIn(result.user.email);
    clearPendingSignOut();
    setUser(result.user);
    return result;
  }, []);

  const cancel2FA = useCallback(() => setPending2FA(null), []);
  const adoptSession = useCallback((signedIn: User) => { clearPendingSignOut(); setUser(signedIn); }, []);

  const register = useCallback(async (data: Parameters<typeof authApi.register>[0]) => {
    const result = await authApi.register(data);
    clearPendingSignOut();
    setUser({ ...result.user, totpEnabled: false });
  }, []);

  /** What this tab holds in memory for the signed-in person: auth state and the decrypted stores */
  const clearMemory = useCallback(async () => {
    setUser(null);
    setPending2FA(null);
    // The public shelf on its own, first: a failure in the steps below used to
    // skip it, and the next person kept the last one's shelf as "yours"
    try {
      const { usePublicShelfStore } = await import('../stores/publicShelfStore.js');
      usePublicShelfStore.getState().reset();
    } catch { /* not loaded */ }
    try {
      const { useEntriesStore } = await import('../stores/entriesStore.js');
      const { useUIStore } = await import('../stores/uiStore.js');
      const { resetCalendarSyncSession } = await import('../services/calendarSync.js');
      const { setAiConfig } = await import('../services/aiAssistant.js');
      const { setImageStorageConfig, setImageStorageDraft, clearImageCache } = await import('../services/imageStorage.js');
      // The AI and image-bucket settings (even their sealed copies and unsaved drafts) were the last person's
      setAiConfig(null, null);
      clearImageCache();
      setImageStorageConfig(null, null);
      setImageStorageDraft(null);
      useEntriesStore.getState().clearAll();
      useUIStore.getState().clearSearch();
      useUIStore.getState().clearPrivateState();
      resetCalendarSyncSession();
      // The app-wide copies of the last person's sealed settings
      (await import('../hooks/useEncryptedSetting.js')).clearEncryptedSettings();
    } catch {
      // Non-critical — stores may not be loaded
    }
  }, []);

  // Another tab signed out (or is starting a fresh sign-in): this tab's copy of
  // the last person goes too, rather than staying on screen. The encryption
  // provider drops the master key on the same signal.
  const userEmail = user?.email ?? null;
  useEffect(() => onRemoteReset(() => { void clearMemory(); }, () => userEmail), [clearMemory, userEmail]);

  /** Everything this browser holds for the signed-in person, gone — the session itself is the server's */
  const resetLocal = useCallback(async () => {
    announceLocalReset();
    await clearMemory();
    await wipeBrowserData();
  }, [clearMemory]);

  const logout = useCallback(async () => {
    // End the session on the server; if that can't be reached, remember to end it on the next load
    const ended = await tryServerLogout(true);
    await resetLocal();
    if (!ended) { try { localStorage.setItem(PENDING_SIGN_OUT, '1'); } catch { /* storage blocked */ } }
  }, [resetLocal]);

  const endSession = useCallback(async () => {
    const ended = await tryServerLogout();
    await clearMemory();
    // What was typed into searches and filters came from decrypted data
    try { sessionStorage.clear(); } catch { /* storage blocked */ }
    if (!ended) { try { localStorage.setItem(PENDING_SIGN_OUT, '1'); } catch { /* storage blocked */ } }
  }, [clearMemory]);

  const dropUser = useCallback(() => { void clearMemory(); }, [clearMemory]);

  const beginSignIn = useCallback(async (email: string | null) => {
    if (email) announceSigningIn(email);
    await clearMemory();
    try { sessionStorage.clear(); } catch { /* storage blocked */ }
  }, [clearMemory]);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: user !== null,
      isLoading,
      pending2FA,
      login,
      submitTotpCode,
      loginWithPasskey,
      cancel2FA,
      adoptSession,
      register,
      logout,
      endSession,
      dropUser,
      resetLocal,
      beginSignIn,
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
