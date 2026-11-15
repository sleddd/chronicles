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
import { forgetPlannerKeyword, forgetPlanningTypeFilter } from '../types/planner.js';
import { useTimeStore } from '../stores/timeStore.js';
import { announceLocalReset, onRemoteReset } from '../services/signOutBroadcast.js';
import { claimBrowserFor } from '../services/browserData.js';
import { holdKey, keyHolderExists, requestKey } from '../services/keyHandoff.js';
import { browserIsIdle, markActivity } from '../services/activity.js';
import type { ConfirmAction } from '../services/api.js';
import { auth as authApi, type PasskeyWrap } from '../services/api.js';
import { deriveAuthSecret } from '@shared/crypto/authSecret.js';
import { useOptionalAuth } from './AuthContext.js';
import { cancelCalendarSync } from '../services/calendarSync.js';
import { clearEncryptedSettings } from '../hooks/useEncryptedSetting.js';
export interface EncryptionParams {
  kekSalt: string;
  encryptedMasterKey: string;
  kekWrapIv: string;
  kekIterations: number;
}

/**
 * Where an extractable copy of the master key comes from when another wrap of
 * it has to be made (a new password, a recovery key, a passkey): the typed
 * password and its wrap, or a passkey touch and that passkey's wrap.
 */
export type KeySource =
  // `confirmToken`: the server checked the password (and the 2FA code) when it
  // handed over the wrap, and this single-use token confirms the action it was for
  | { kind: 'password'; password: string; params: EncryptionParams; confirmToken?: string }
  | { kind: 'passkey'; prf: Uint8Array; wrap: PasskeyWrap };

interface EncryptionContextValue {
  /** This tab holds the master key. Signed in and unlocked are one state: there is no lock screen. */
  isUnlocked: boolean;
  /** True on page load until it's known whether another tab can hand this one the key. */
  isRestoring: boolean;
  unlock: (password: string, kekSalt: string, encryptedMasterKey: string, kekWrapIv: string, kekIterations: number) => Promise<void>;
  /** Open the key with a passkey's secret and its wrap (sign-in by passkey). */
  unlockWithPasskey: (prf: Uint8Array, wrap: PasskeyWrap) => Promise<void>;
  /** Drop the key and every decrypted thing this tab holds. Always part of ending the session — never a state of its own. */
  clearKey: () => void;
  /** A sign-in is starting here: other tabs must not take the browser's session for nobody's (services/keyHandoff.ts). */
  claimKeyHolder: () => void;
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
  /**
   * The typed password as a key source. A tab never keeps the password wrap, so
   * it is fetched here against the password and — with 2FA on — a code, for one
   * named action; the source carries the single-use token that confirms it.
   */
  passwordSource: (password: string, email: string, action: ConfirmAction, code?: string) => Promise<KeySource & { kind: 'password'; confirmToken: string }>;
  /** Does this source open the key? Throws when it doesn't (a wrong password) — checked before anything is made with it. */
  verifyKeySource: (source: KeySource) => Promise<void>;
  /** A new password wrap of the master key. */
  rewrapWith: (source: KeySource, newPassword: string) => Promise<{ salt: string; wrappedMK: string; wrapIv: string }>;
  /** A new recovery key and its wrap of the master key. */
  recoveryKeyWith: (source: KeySource) => Promise<{ recoveryKey: string; recoveryWrappedMK: string; recoveryWrapIv: string }>;
  /** The master key wrapped for a new passkey, under that passkey's secret. */
  passkeyWrapWith: (source: KeySource, newPrf: Uint8Array, newCredentialId: string) => Promise<{ wrappedMK: string; wrapIv: string }>;
  /** Atomic recovery: unwrap with recovery key + rewrap with new password + generate new recovery key in one step. */
  recoverAndRewrap: (recoveryKey: string, recoveryWrappedMK: string, recoveryWrapIv: string, newPassword: string) => Promise<{
    salt: string; wrappedMK: string; wrapIv: string;
    newRecoveryKey: string; newRecoveryWrappedMK: string; newRecoveryWrapIv: string;
  }>;
}

const EncryptionContext = createContext<EncryptionContextValue | null>(null);

export function EncryptionProvider({ children }: { children: ReactNode }) {
  const auth = useOptionalAuth();
  const [isUnlocked, setIsUnlocked] = useState(false);
  // Until it's known whether another tab can hand this one the key (below)
  const [isRestoring, setIsRestoring] = useState(() => auth !== null);
  // CryptoKey stored in ref — non-extractable, lives only in memory
  const masterKeyRef = useRef<CryptoKey | null>(null);
  // Whose key this is, for the tabs that ask for it
  const emailRef = useRef<string | null>(null);
  emailRef.current = auth?.user?.email ?? null;
  // While this tab holds the key (or is signing in), other tabs can see that and ask for it
  const releaseHolderRef = useRef<(() => void) | null>(null);
  const claimKeyHolder = useCallback(() => {
    releaseHolderRef.current ??= holdKey(() => (
      // Not once nobody has been here for too long: this tab is about to sign
      // out, and must not let a new tab in with no password or touch
      masterKeyRef.current && emailRef.current && !browserIsIdle() ? { key: masterKeyRef.current, email: emailRef.current } : null
    ));
  }, []);

  /**
   * Install an opened master key and restore the in-memory secrets that depend
   * on it. `signedIn`: someone just proved who they are (a password, a passkey,
   * a recovery key), which is them being here — taking the key from another tab
   * is not, and must not reset the idle clock.
   */
  const install = useCallback(async (key: CryptoKey, signedIn = true) => {
    if (signedIn) markActivity();
    // Before anything reads the off-device switches (the startup settings load
    // once isUnlocked flips): their records are kept under this tag
    const tag = await encryptionService.accountTag(key, 'egress');
    // What this browser has stored is kept for the same person and wiped for
    // anyone else — decided by the key, before any of it is read
    if (await claimBrowserFor(tag)) announceLocalReset();
    setEgressAccount(tag);
    masterKeyRef.current = key;
    claimKeyHolder();
    // Restore the in-memory R2 credentials from their master-key-encrypted
    // blob so image display/cleanup keeps working
    void rederiveImageStorageConfig((ct, iv, aad) => encryptionService.decryptFile(key, ct, iv, aad));
    void rederiveAiConfig((ct, iv, aad) => encryptionService.decryptFile(key, ct, iv, aad));
    // Topic names and dose records are sealed by the API layer itself
    installRecordCipher(encryptionService, key);
    setIsUnlocked(true);
  }, [claimKeyHolder]);

  const unlock = useCallback(async (
    password: string,
    kekSalt: string,
    encryptedMasterKey: string,
    kekWrapIv: string,
    kekIterations: number,
  ) => {
    // Reject iterations below the security minimum to prevent downgrade attacks
    if (kekIterations < PBKDF2_ITERATIONS) {
      throw new Error(`PBKDF2 iterations ${kekIterations} below minimum ${PBKDF2_ITERATIONS}`);
    }
    // The wrap is used and let go: this tab keeps the key, never what wraps it
    const key = await encryptionService.unwrapMasterKey(password, kekSalt, encryptedMasterKey, kekWrapIv, kekIterations);
    await install(key);
  }, [install]);

  const unlockWithPasskey = useCallback(async (prf: Uint8Array, wrap: PasskeyWrap) => {
    const key = await encryptionService.unwrapWithPasskey(prf, wrap.wrappedMK, wrap.wrapIv, wrap.credentialId);
    await install(key);
  }, [install]);

  /** Clear all in-memory key material and decrypted secrets (this tab only). */
  const clearKey = useCallback(() => {
    masterKeyRef.current = null;
    releaseHolderRef.current?.();
    releaseHolderRef.current = null;
    // Revoke decrypted image object URLs — they hold plaintext image bytes
    clearImageCache();
    // Drop the decrypted AI provider credentials too
    clearAiConfig();
    clearRecordCipher();
    // And the decrypted Finance records
    clearFinanceCache();
    // And the app-wide copies of the sealed settings (habit log, time log,
    // dashboard layout, chips…) held by useEncryptedSetting
    clearEncryptedSettings();
    // A calendar sync in flight must not go on against the emptied stores (it
    // would read every event as deleted here), nor keep its Google token
    cancelCalendarSync();
    // And every decrypted entry, topic and private setting held in the stores:
    // nothing readable stays in memory once the session ends
    useEntriesStore.getState().clearAll();
    useUIStore.getState().clearPrivateState();
    clearReservedEntryIds();
    clearIssuedTopicIds();
    clearSealMarkers();
    // Entry list titles are cached keyed by the decrypted entry HTML
    clearEntryTitleCache();
    // Time-tracking sessions (which entries, when) — TimeSync reopens them at the next sign-in
    useTimeStore.getState().reset();
    // Words typed into the planner's search, and the name of a task type
    // picked as a filter, wait in sessionStorage: they're from decrypted data
    forgetPlannerKeyword();
    forgetPlanningTypeFilter();
    setEgressAccount(null);
    setIsUnlocked(false);
  }, []);

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

  const passwordSource = useCallback(async (password: string, email: string, action: ConfirmAction, code?: string) => {
    // Always from the server, against the password and (with 2FA on) a code:
    // a wrap kept in the tab would go stale the moment the password is changed
    // in another tab, and it is one more thing in memory that opens the journal
    const { confirmToken, encryption: e } = await authApi.passwordWrap({
      currentAuthSecret: await deriveAuthSecret(password, email), action, ...(code?.trim() ? { code: code.trim() } : {}),
    });
    if (!e.kekSalt || !e.encryptedMasterKey || !e.kekWrapIv) throw new Error('No encryption params available. Sign in again.');
    const params = { kekSalt: e.kekSalt, encryptedMasterKey: e.encryptedMasterKey, kekWrapIv: e.kekWrapIv, kekIterations: e.kekIterations };
    return { kind: 'password' as const, password, params, confirmToken };
  }, []);

  // The extractable copy exists only inside these calls: made, wrapped, let go
  const extractable = (source: KeySource): Promise<CryptoKey> => source.kind === 'password'
    ? encryptionService.extractableFromPassword(source.password, source.params.kekSalt, source.params.encryptedMasterKey, source.params.kekWrapIv, source.params.kekIterations)
    : encryptionService.extractableFromPasskey(source.prf, source.wrap.wrappedMK, source.wrap.wrapIv, source.wrap.credentialId);

  const verifyKeySource = useCallback(async (source: KeySource) => {
    try { await extractable(source); } catch { throw new Error(source.kind === 'password' ? 'Current password incorrect' : 'That passkey didn’t open your journal'); }
  }, []);

  const rewrapWith = useCallback(async (source: KeySource, newPassword: string) => {
    return encryptionService.rewrapMasterKey(await extractable(source), newPassword);
  }, []);

  const recoveryKeyWith = useCallback(async (source: KeySource) => {
    return encryptionService.generateNewRecoveryWrapping(await extractable(source));
  }, []);

  const passkeyWrapWith = useCallback(async (source: KeySource, newPrf: Uint8Array, newCredentialId: string) => {
    return encryptionService.wrapForPasskey(await extractable(source), newPrf, newCredentialId);
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

  // Page load with a session but no key (a new tab, a reload). The key is only
  // ever in a tab's memory, so: take it from a tab that has it — or, with no
  // such tab, the session is nobody's any more and it ends here, on to sign-in
  const askedRef = useRef(false);
  const authLoading = auth?.isLoading ?? false;
  useEffect(() => {
    if (!auth) { setIsRestoring(false); return; }
    if (authLoading || askedRef.current) return;
    askedRef.current = true;
    const email = auth.user?.email;
    if (!email || masterKeyRef.current) { setIsRestoring(false); return; }
    void (async () => {
      const holder = await keyHolderExists();
      const key = holder === false ? null : await requestKey(email);
      // A sign-in may have finished here meanwhile
      if (!masterKeyRef.current) {
        if (key) await install(key, false);
        // No tab holds the key: end the session on the server too (the cache stays)
        else if (holder === false) await auth.endSession();
        // A tab holds it but couldn't hand it over (or this browser can't say):
        // sign in here. The browser's session is left alone — that tab is using it
        else auth.dropUser();
      }
      setIsRestoring(false);
    })();
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Another tab wiped this browser (Sign out, a different person signing in):
  // drop the key here too — a second window must never keep the last person's
  // journal open
  useEffect(() => onRemoteReset(() => { if (masterKeyRef.current) clearKey(); }, () => emailRef.current), [clearKey]);

  // The tab is going away: let the holder lock go at once. The key itself is
  // left in its ref — a real unmount drops the ref with the provider, and
  // under Fast Refresh (development) this effect re-runs on an edit while the
  // ref keeps its key: nulling it there left `isUnlocked` true with no key, so
  // every decrypt failed until the next sign-in. Re-run with a key, it takes
  // the lock again
  useEffect(() => {
    if (masterKeyRef.current) claimKeyHolder();
    return () => { releaseHolderRef.current?.(); releaseHolderRef.current = null; };
  }, [claimKeyHolder]);

  return (
    <EncryptionContext.Provider value={{
      isUnlocked,
      isRestoring,
      unlock,
      unlockWithPasskey,
      clearKey,
      claimKeyHolder,
      setupEncryption,
      encryptPost,
      encryptNewPost,
      decryptPost,
      decryptPosts,
      encryptBytes,
      decryptBytes,
      encryptRecord,
      decryptRecord,
      passwordSource,
      verifyKeySource,
      rewrapWith,
      recoveryKeyWith,
      passkeyWrapWith,
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
