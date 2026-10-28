import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { encryptionService } from '@shared/crypto/encryptionService.js';
import { toNonExtractable } from '@shared/crypto/primitives.js';
import { clearEntryTitleCache } from '../utils/entryTitle.js';
import { setEgressAccount } from '../services/deviceConsent.js';
import { PBKDF2_ITERATIONS } from '@shared/crypto/constants.js';
import type { EncryptedPostData, DecryptedPost, EncryptedPost, SetupEncryptionResult } from '@shared/crypto/types.js';
import { clearImageCache, rederiveImageStorageConfig } from '../services/imageStorage.js';
import { clearAiConfig, rederiveAiConfig } from '../services/aiAssistant.js';
import { clearRecordCipher, installRecordCipher } from '../services/recordCipher.js';
import { clearFinanceCache } from '../stores/financeStore.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { olderEntriesAllowed, reserveEntryId, clearReservedEntryIds } from '../services/entryReseal.js';
import { clearSealMarkers, clearIssuedTopicIds } from '../services/api.js';
import { useUIStore } from '../stores/uiStore.js';
import {
  REMEMBER_IDLE_MS, REMEMBER_STORE_KEY, fetchRemembered, forgetRemembered,
  hasRememberedUnlock, lastActivity, markActivity, startRemembering, storeRemembered,
} from '../services/rememberDevice.js';

export interface EncryptionParams {
  kekSalt: string;
  encryptedMasterKey: string;
  kekWrapIv: string;
  kekIterations: number;
}

interface EncryptionContextValue {
  isUnlocked: boolean;
  /** True while a remembered unlock is being restored on page load (don't prompt for the password yet). */
  isRestoring: boolean;
  /** This browser is remembered — stays unlocked across reloads and tabs until it closes. */
  isRemembered: boolean;
  unlock: (password: string, kekSalt: string, encryptedMasterKey: string, kekWrapIv: string, kekIterations: number, remember?: boolean) => Promise<void>;
  lock: () => void;
  /** Stop remembering this browser but stay unlocked in this tab. */
  forgetBrowser: () => void;
  setupEncryption: (password: string) => Promise<SetupEncryptionResult>;
  /** Encrypt an existing entry, bound to its id */
  encryptPost: (id: number, content: string, metadata: Record<string, unknown>) => Promise<EncryptedPostData>;
  /** Encrypt a new entry: reserves its id first; pass `id` to entries.create */
  encryptNewPost: (content: string, metadata: Record<string, unknown>) => Promise<EncryptedPostData & { id: number }>;
  decryptPost: (post: EncryptedPost) => Promise<DecryptedPost>;
  decryptPosts: (posts: EncryptedPost[]) => Promise<DecryptedPost[]>;
  /** Optional `aad` binds the ciphertext to what it is (a setting's key, an image's object key) */
  encryptBytes: (data: ArrayBuffer, aad?: string) => Promise<{ ciphertext: ArrayBuffer; iv: string }>;
  decryptBytes: (ciphertext: ArrayBuffer, iv: string, aad?: string) => Promise<ArrayBuffer>;
  /** Encrypt one Finance record (AAD bound to kind + id). */
  encryptRecord: (kind: string, id: string, record: unknown) => Promise<{ payload: string; iv: string }>;
  decryptRecord: <T = unknown>(kind: string, id: string, payload: string, iv: string) => Promise<T>;
  rewrapMasterKey: (newPassword: string, currentPassword?: string, params?: EncryptionParams) => Promise<{ salt: string; wrappedMK: string; wrapIv: string }>;
  /** Generate a new recovery key wrapping using the current password to re-derive the extractable master key. */
  generateRecoveryKey: (currentPassword: string, externalParams?: EncryptionParams) => Promise<{ recoveryKey: string; recoveryWrappedMK: string; recoveryWrapIv: string }>;
  /** Atomic recovery: unwrap with recovery key + rewrap with new password + generate new recovery key in one step. */
  recoverAndRewrap: (recoveryKey: string, recoveryWrappedMK: string, recoveryWrapIv: string, newPassword: string) => Promise<{
    salt: string; wrappedMK: string; wrapIv: string;
    newRecoveryKey: string; newRecoveryWrappedMK: string; newRecoveryWrapIv: string;
  }>;
}

const EncryptionContext = createContext<EncryptionContextValue | null>(null);

export function EncryptionProvider({ children }: { children: ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isRestoring, setIsRestoring] = useState(() => hasRememberedUnlock());
  const [isRemembered, setIsRemembered] = useState(false);
  const rememberedRef = useRef(false);
  // CryptoKey stored in ref — non-extractable, lives only in memory
  const masterKeyRef = useRef<CryptoKey | null>(null);
  // Stored encryption params for re-derivation during password change
  const encryptionParamsRef = useRef<EncryptionParams | null>(null);
  /** Install an unlocked master key and restore the in-memory secrets that depend on it. */
  const install = useCallback(async (key: CryptoKey) => {
    // Before anything reads the off-device switches (the startup settings load
    // once isUnlocked flips): their records are kept under this tag
    setEgressAccount(await encryptionService.accountTag(key, 'egress'));
    masterKeyRef.current = key;
    // Restore the in-memory R2 credentials (cleared on lock) from their
    // master-key-encrypted blob so image display/cleanup keeps working
    void rederiveImageStorageConfig((ct, iv, aad) => encryptionService.decryptFile(key, ct, iv, aad));
    void rederiveAiConfig((ct, iv, aad) => encryptionService.decryptFile(key, ct, iv, aad));
    // Topic names and dose records are sealed by the API layer itself
    installRecordCipher(encryptionService, key);
    setIsUnlocked(true);
  }, []);

  const unlock = useCallback(async (
    password: string,
    kekSalt: string,
    encryptedMasterKey: string,
    kekWrapIv: string,
    kekIterations: number,
    remember = false,
  ) => {
    // Reject iterations below the security minimum to prevent downgrade attacks
    if (kekIterations < PBKDF2_ITERATIONS) {
      throw new Error(`PBKDF2 iterations ${kekIterations} below minimum ${PBKDF2_ITERATIONS}`);
    }
    let key: CryptoKey | null = null;
    if (remember) {
      // Opt-in: also keep a wrapped copy this browser can reopen until it closes.
      // If the server can't start a grant, fall back to a normal unlock.
      let grant: Awaited<ReturnType<typeof startRemembering>> | null = null;
      try { grant = await startRemembering(); } catch (err) { console.warn('Remember me unavailable:', err); }
      if (grant) {
        try {
          const r = await encryptionService.unwrapMasterKeyForDevice(
            password, kekSalt, encryptedMasterKey, kekWrapIv, kekIterations, grant.secret,
          );
          storeRemembered(r.deviceWrapped, r.deviceIv, grant.expiresAt);
          key = r.masterKey;
        } finally {
          grant.secret.fill(0);
        }
      }
    }
    if (!key) {
      // Not remembering — make sure no earlier remembered copy lingers
      forgetRemembered();
      key = await encryptionService.unwrapMasterKey(password, kekSalt, encryptedMasterKey, kekWrapIv, kekIterations);
    }
    rememberedRef.current = remember && hasRememberedUnlock();
    setIsRemembered(rememberedRef.current);
    encryptionParamsRef.current = { kekSalt, encryptedMasterKey, kekWrapIv, kekIterations };
    await install(key);
  }, [install]);

  /** Clear all in-memory key material and decrypted secrets (this tab only). */
  const lockLocal = useCallback(() => {
    masterKeyRef.current = null;
    encryptionParamsRef.current = null;
    rememberedRef.current = false;
    setIsRemembered(false);
    // Revoke decrypted image object URLs — they hold plaintext image bytes
    clearImageCache();
    // Drop the decrypted AI provider credentials too
    clearAiConfig();
    clearRecordCipher();
    // And the decrypted Finance records
    clearFinanceCache();
    // And every decrypted entry, topic and private setting held in the stores:
    // after an auto-lock nothing readable stays in memory; unlocking reloads
    useEntriesStore.getState().clearAll();
    useUIStore.getState().clearPrivateState();
    clearReservedEntryIds();
    clearIssuedTopicIds();
    clearSealMarkers();
    // Entry list titles are cached keyed by the decrypted entry HTML
    clearEntryTitleCache();
    setEgressAccount(null);
    setIsUnlocked(false);
  }, []);

  const forgetBrowser = useCallback(() => {
    forgetRemembered();
    rememberedRef.current = false;
    setIsRemembered(false);
  }, []);

  /** Lock everywhere: this tab, the remembered copy, and (via storage events) other tabs. */
  const lock = useCallback(() => {
    forgetRemembered();
    lockLocal();
  }, [lockLocal]);

  const setupEncryption = useCallback(async (password: string): Promise<SetupEncryptionResult> => {
    const result = await encryptionService.setupEncryption(password);
    // A full install, like an unlock: without the record cipher a new account
    // couldn't seal (or seed) its topics until the next unlock
    await install(result.masterKey);
    return result;
  }, [install]);

  const getKey = () => {
    if (!masterKeyRef.current) throw new Error('Encryption not unlocked');
    return masterKeyRef.current;
  };

  // An entry's creation time is sealed in its metadata (`_createdAt`), so the
  // server — whose created_at is readable — can't re-date it; a save that
  // rebuilds the metadata keeps the one the entry already has
  const encryptPost = useCallback(async (id: number, content: string, metadata: Record<string, unknown>) => {
    let meta = metadata;
    if (typeof meta._createdAt !== 'string') {
      const existing = useEntriesStore.getState().decryptedEntries.find(e => e.id === id);
      const sealed = existing?.metadata?._createdAt;
      const at = typeof sealed === 'string' ? sealed : existing ? new Date(existing.createdAt).toISOString() : null;
      if (at) meta = { ...metadata, _createdAt: at };
    }
    return encryptionService.encryptPost(getKey(), id, content, meta);
  }, []);

  const encryptNewPost = useCallback(async (content: string, metadata: Record<string, unknown>) => {
    const key = getKey();
    const id = await reserveEntryId();
    const meta = typeof metadata._createdAt === 'string' ? metadata : { ...metadata, _createdAt: new Date().toISOString() };
    return { ...(await encryptionService.encryptPost(key, id, content, meta)), id };
  }, []);

  // Older entry formats open only until the account is past the move to v3
  // (see services/entryReseal.ts)
  const decryptPost = useCallback(async (post: EncryptedPost) => {
    return encryptionService.decryptPost(getKey(), post, { allowOlder: olderEntriesAllowed() });
  }, []);

  const decryptPosts = useCallback(async (posts: EncryptedPost[]) => {
    return encryptionService.decryptPosts(getKey(), posts, { allowOlder: olderEntriesAllowed() });
  }, []);

  const encryptBytes = useCallback(async (data: ArrayBuffer, aad?: string) => {
    return encryptionService.encryptFile(getKey(), data, aad);
  }, []);

  const decryptBytes = useCallback(async (ciphertext: ArrayBuffer, iv: string, aad?: string) => {
    return encryptionService.decryptFile(getKey(), ciphertext, iv, aad);
  }, []);

  const encryptRecord = useCallback(async (kind: string, id: string, record: unknown) => {
    return encryptionService.encryptRecord(getKey(), kind, id, record);
  }, []);

  const decryptRecord = useCallback(async <T,>(kind: string, id: string, payload: string, iv: string) => {
    return encryptionService.decryptRecord<T>(getKey(), kind, id, payload, iv);
  }, []) as EncryptionContextValue['decryptRecord'];

  const rewrapMasterKey = useCallback(async (newPassword: string, currentPassword?: string, externalParams?: EncryptionParams) => {
    const storedParams = encryptionParamsRef.current || externalParams;
    if (currentPassword && storedParams) {
      // Change-password flow: re-derive extractable key from stored params
      const params = storedParams;
      const result = await encryptionService.rewrapFromParams(
        currentPassword,
        params.kekSalt,
        params.encryptedMasterKey,
        params.kekWrapIv,
        params.kekIterations,
        newPassword
      );
      // Update stored params with new values
      encryptionParamsRef.current = {
        kekSalt: result.salt,
        encryptedMasterKey: result.wrappedMK,
        kekWrapIv: result.wrapIv,
        kekIterations: params.kekIterations,
      };
      return result;
    }
    // Recovery has its own path (recoverAndRewrap), which never keeps an
    // extractable copy of the master key around
    throw new Error('Enter your current password to change it');
  }, []);

  const generateRecoveryKey = useCallback(async (currentPassword: string, externalParams?: EncryptionParams) => {
    const params = encryptionParamsRef.current ?? externalParams;
    if (!params) throw new Error('No encryption params available — please re-login');
    return encryptionService.generateRecoveryKeyFromParams(
      currentPassword,
      params.kekSalt,
      params.encryptedMasterKey,
      params.kekWrapIv,
      params.kekIterations
    );
  }, []);

  const recoverAndRewrap = useCallback(async (
    recoveryKey: string,
    recoveryWrappedMK: string,
    recoveryWrapIv: string,
    newPassword: string
  ) => {
    // Unwrap the master key using the recovery key
    const extractableKey = await encryptionService.unwrapWithRecoveryKey(recoveryKey, recoveryWrappedMK, recoveryWrapIv);
    // Rewrap with the new password
    const rewrapped = await encryptionService.rewrapMasterKey(extractableKey, newPassword);
    // Generate a fresh recovery key for the new session
    const recovery = await encryptionService.generateNewRecoveryWrapping(extractableKey);
    encryptionParamsRef.current = {
      kekSalt: rewrapped.salt,
      encryptedMasterKey: rewrapped.wrappedMK,
      kekWrapIv: rewrapped.wrapIv,
      kekIterations: PBKDF2_ITERATIONS,
    };
    // A non-extractable copy for this session, installed like an unlock (the
    // record cipher seals topics and doses; R2 / AI credentials reopen)
    await install(await toNonExtractable(extractableKey));
    return {
      ...rewrapped,
      newRecoveryKey: recovery.recoveryKey,
      newRecoveryWrappedMK: recovery.recoveryWrappedMK,
      newRecoveryWrapIv: recovery.recoveryWrapIv,
    };
  }, [install]);

  // Clear all key material on unmount
  useEffect(() => {
    return () => {
      masterKeyRef.current = null;
      };
  }, []);

  // Restore a remembered unlock on page load (new tab, reload, navigating back)
  useEffect(() => {
    if (!isRestoring) return;
    let cancelled = false;
    (async () => {
      const got = await fetchRemembered();
      if (cancelled) return;
      if (typeof got === 'object') {
        try {
          const key = await encryptionService.unwrapFromDevice(got.secret, got.blob.wrapped, got.blob.iv);
          if (!cancelled) {
            rememberedRef.current = true;
            setIsRemembered(true);
            markActivity();
            await install(key);
          }
        } catch {
          // Blob doesn't open with this secret (tampered or stale) — forget it
          forgetRemembered();
        } finally {
          got.secret.fill(0);
        }
      }
      if (!cancelled) setIsRestoring(false);
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Another tab locked or signed out (the remembered copy vanished) — lock here too
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      const cleared = e.key === null || (e.key === REMEMBER_STORE_KEY && e.newValue === null);
      if (cleared && rememberedRef.current && masterKeyRef.current) lockLocal();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [lockLocal]);

  // Auto-lock when tab becomes hidden (user switches away) — unless this
  // browser is remembered, which is the point of Remember me
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && masterKeyRef.current && !rememberedRef.current) {
        lock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [lock]);

  // Inactivity timeout. Normal sessions: 15 minutes without interaction in this
  // tab. Remembered sessions: an hour without activity in ANY Chronicles tab
  // (shared timestamp), which also ends the remembered copy.
  useEffect(() => {
    const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
    let inactivityTimer: ReturnType<typeof setTimeout>;
    let lastMark = 0;

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      if (!masterKeyRef.current) return;
      if (rememberedRef.current) {
        const now = Date.now();
        if (now - lastMark > 15_000) { lastMark = now; markActivity(now); }
        return;
      }
      inactivityTimer = setTimeout(() => {
        if (masterKeyRef.current) lock();
      }, INACTIVITY_TIMEOUT_MS);
    };

    const idleCheck = setInterval(() => {
      if (masterKeyRef.current && rememberedRef.current && Date.now() - lastActivity() > REMEMBER_IDLE_MS) lock();
    }, 60_000);

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => document.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      events.forEach(event => document.removeEventListener(event, resetTimer));
      clearTimeout(inactivityTimer);
      clearInterval(idleCheck);
    };
  }, [lock, isUnlocked, isRemembered]);

  return (
    <EncryptionContext.Provider value={{
      isUnlocked,
      isRestoring,
      isRemembered,
      unlock,
      lock,
      forgetBrowser,
      setupEncryption,
      encryptPost,
      encryptNewPost,
      decryptPost,
      decryptPosts,
      encryptBytes,
      decryptBytes,
      encryptRecord,
      decryptRecord,
      rewrapMasterKey,
      generateRecoveryKey,
      recoverAndRewrap,
    }}>
      {children}
    </EncryptionContext.Provider>
  );
}

/** The encryption context, or null outside EncryptionProvider (for hooks that only use it when present) */
export function useOptionalEncryption(): EncryptionContextValue | null {
  return useContext(EncryptionContext);
}

export function useEncryption(): EncryptionContextValue {
  const context = useContext(EncryptionContext);
  if (!context) throw new Error('useEncryption must be used within EncryptionProvider');
  return context;
}
