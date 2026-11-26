import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { clearAiPrivacy, markHiddenBeforeCreate, markHiddenOnSave, type AiMarkBatch } from '../services/aiPrivacy.js';
import { withAiHiddenKept } from '../utils/aiHiddenFlag.js';
import { encryptionService } from '@shared/crypto/encryptionService.js';
import { toNonExtractable } from '@shared/crypto/primitives.js';
import { clearEntryTitleCache } from '../utils/entryTitle.js';
import { clearEntryOutlineCache } from '../utils/entryOutline.js';
import { clearAllergenCache } from '../utils/aiKitchen.js';
import { setEgressAccount, accountTagForRecords } from '../services/deviceConsent.js';
import { PBKDF2_ITERATIONS } from '@shared/crypto/constants.js';
import type { EncryptedPostData, DecryptedPost, EncryptedPost, SetupEncryptionResult } from '@shared/crypto/types.js';
import { clearImageCache, rederiveImageStorageConfig } from '../services/imageStorage.js';
import { clearAiConfig, rederiveAiConfig, setAiConfig } from '../services/aiAssistant.js';
import { clearRecordCipher, installRecordCipher } from '../services/recordCipher.js';
import { clearFinanceCache } from '../stores/financeStore.js';
import { stopAllFocusSounds } from '../services/focusSounds.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { olderEntriesAllowed, reserveEntryId, clearReservedEntryIds } from '../services/entryReseal.js';
import { clearSealMarkers, clearIssuedTopicIds } from '../services/api.js';
import { useUIStore } from '../stores/uiStore.js';
import { forgetPlannerKeyword, forgetPlanningTypeFilter } from '../types/planner.js';
import { useTimeStore } from '../stores/timeStore.js';
import { announceLocalReset, onRemoteReset } from '../services/signOutBroadcast.js';
import { claimBrowserFor, retagBrowser, noteRetagPending, clearRetagPending, rekeyFinishedHere, markRekeyFinished, ownerMark, ownedByAnotherKey } from '../services/browserData.js';
import { runRekey, resealLocalDrafts, RekeyError } from '../services/rekey.js';
import { useRekeyStore, rekeyActive } from '../stores/rekeyStore.js';
import { forgetPasskeysHere, syncPasskeysWithDevice } from '../services/passkeys.js';
import { setImageStorageConfig } from '../services/imageStorage.js';
import { showFlash } from '../services/flashNotice.js';
import type { RekeyCommit } from '../services/api.js';
import { setLegacyMigrationAllowed } from '../services/sealedFormats.js';
import { holdKey, keyHolderExists, keylessPage, requestKey } from '../services/keyHandoff.js';
import { browserIsIdle, markActivity, noteActivity } from '../services/activity.js';
import type { ConfirmAction } from '../services/api.js';
import { auth as authApi, type PasskeyWrap } from '../services/api.js';
import { withAuthSecret } from '../utils/passwordForms.js';
import { newRecoveryProof } from '@shared/crypto/authSecret.js';
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
  /** `aiMarks` (imports): a hidden entry's mark waits in the batch, which the caller flushes before it creates the entries (services/aiPrivacy) */
  encryptNewPost: (content: string, metadata: Record<string, unknown>, options?: { aiMarks?: AiMarkBatch }) => Promise<EncryptedPostData & { id: number }>;
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
  /** The page this tab shows changed (KeylessPageWatch in App.tsx): a keyless page doesn't ask other tabs for the key */
  notePage: (pathname: string) => void;
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
  /**
   * Re-encrypting the journal with a password change, step 1: a new master key
   * and its wraps (the new password's, a new recovery key's). Nothing is sent:
   * the recovery key is shown first, so it is saved before anything changes.
   */
  prepareRekey: (newPassword: string) => Promise<PreparedRekey>;
  /**
   * Step 2: open the current key from `source`, carry it (sealed under the new
   * key) to the server with the password change `send` makes, then re-encrypt
   * every record. The app stays behind RekeyOverlay until that is done.
   */
  commitRekey: (prepared: PreparedRekey, source: KeySource, send: (wrap: { newEncryptedMasterKey: string; newKekSalt: string; newKekWrapIv: string; rekey: RekeyCommit }) => Promise<unknown>) => Promise<void>;
  /** A re-encryption that stopped on an error: try it again */
  retryRekey: (opts?: { allowMissingPhotos?: boolean }) => void;
}

/** A new master key and its wraps, made but not sent (prepareRekey) */
export interface PreparedRekey {
  rekeyId: string;
  newKey: CryptoKey;
  wrap: { salt: string; wrappedMK: string; wrapIv: string };
  recoveryKey: string;
  recoveryWrappedMK: string;
  recoveryWrapIv: string;
  recoveryKeyHash: string;
  recoveryKeySalt: string;
}

const EncryptionContext = createContext<EncryptionContextValue | null>(null);

// This tab, to the server's "who is re-encrypting" claim (random, names nobody)
const REKEY_RUNNER = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
// How often a runner asks whether the job is still its own (the server counts
// a runner quiet for two minutes as stopped), and how often a waiting one looks
const REKEY_CLAIM_EVERY_MS = 15_000;
const REKEY_WAIT_MS = 10_000;

/**
 * Every decrypted thing this tab holds, gone (the key itself is the caller's):
 * entries, topics, private settings, credentials, image URLs, caches. Part of
 * ending the session, and of a re-encryption (all of it is read again under
 * the new key once that is done).
 */
function dropDecryptedState(): void {
  // Revoke decrypted image object URLs — they hold plaintext image bytes
  clearImageCache();
  // Drop the decrypted AI provider credentials too
  clearAiConfig();
  clearAiPrivacy();
  clearRecordCipher();
  // And the decrypted Finance records
  clearFinanceCache();
  // Focus sounds stop with the session
  stopAllFocusSounds();
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
  // The next install decides again whether this browser may move older records
  setLegacyMigrationAllowed(false);
  // Entry list titles are cached keyed by the decrypted entry HTML
  clearEntryTitleCache();
  clearEntryOutlineCache();
  clearAllergenCache();
  // Time-tracking sessions (which entries, when) — TimeSync reopens them at the next sign-in
  useTimeStore.getState().reset();
  // Words typed into the planner's search, and the name of a task type
  // picked as a filter, wait in sessionStorage: they're from decrypted data
  forgetPlannerKeyword();
  forgetPlanningTypeFilter();
}

export function EncryptionProvider({ children }: { children: ReactNode }) {
  const auth = useOptionalAuth();
  const [isUnlocked, setIsUnlocked] = useState(false);
  // Until it's known whether another tab can hand this one the key (below)
  const [isRestoring, setIsRestoring] = useState(() => auth !== null);
  // CryptoKey stored in ref — non-extractable, lives only in memory
  const masterKeyRef = useRef<CryptoKey | null>(null);
  // The owner mark of the key this tab holds (services/browserData.ts), and
  // the auth context as of the latest render (both read from getKey)
  const ownMarkRef = useRef<string | null>(null);
  const authRef = useRef(auth);
  authRef.current = auth;
  // Whose key this is, for the tabs that ask for it
  const emailRef = useRef<string | null>(null);
  emailRef.current = auth?.user?.email ?? null;
  // While this tab holds the key (or is signing in), other tabs can see that and ask for it
  const releaseHolderRef = useRef<(() => void) | null>(null);
  const claimKeyHolder = useCallback(() => {
    releaseHolderRef.current ??= holdKey(() => (
      // Not once nobody has been here for too long: this tab is about to sign
      // out, and must not let a new tab in with no password or touch
      // Nor while the journal is being re-encrypted: a tab given the new key
      // now would read records still under the old one
      masterKeyRef.current && emailRef.current && !browserIsIdle() && !rekeyActive() ? { key: masterKeyRef.current, email: emailRef.current } : null
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
    if (await claimBrowserFor(tag, signedIn)) {
      announceLocalReset();
      // The wipe took the shared "someone is here" record with it. Without it a
      // second tab (which takes the key but has seen nobody itself) read the
      // browser as idle and ended the session for every tab — e.g. opening the
      // public shelf right after signing in on a new browser signed you out
      if (signedIn) markActivity();
    }
    setEgressAccount(tag);
    // This key's mark, as the browser now stores it (see getKey)
    ownMarkRef.current = await ownerMark(tag);
    masterKeyRef.current = key;
    claimKeyHolder();
    // Topic names and dose records are sealed by the API layer itself
    installRecordCipher(encryptionService, key);
    // A re-encryption cut short (a closed tab, the idle sign-out) carries on
    // before anything opens: some records may still be under the old key
    await resumeRekeyIfPending(key);
  }, [claimKeyHolder]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-encrypting under a new master key (services/rekey.ts) ─────────────
  const rekeyJobRef = useRef<{ newKey: CryptoKey; oldKey: CryptoKey; rekeyId: string; allowMissingPhotos?: boolean } | null>(null);
  const rekeyingRef = useRef(false);

  // Run (or finish) the re-encryption, the app shut behind RekeyOverlay
  // meanwhile. One runner at a time: tabs here wait on the Web Lock, and other
  // browsers on the server's claim (two working from their own reads of the
  // journal could write over each other). A waiting one takes over if the
  // runner goes quiet, and opens once the job is done.
  const runRekeyJob = useCallback(async () => {
    const job = rekeyJobRef.current;
    if (!job) return;
    rekeyingRef.current = true;
    setIsUnlocked(false);
    setIsRestoring(true);
    const store = useRekeyStore.getState();
    store.set({ status: 'waiting', error: null, errorKind: null, progress: null });
    // The R2 and AI settings this tab still holds sealed are the old key's:
    // they are read again from the server once everything has moved. (Trying
    // them with the new key would fail, and a failed read counts as "off",
    // which drops this browser's own record of having switched AI on)
    setImageStorageConfig(null, null);
    setAiConfig(null, null);
    // This browser's unsaved writing moves whether or not it runs the job: once
    // another browser has finished it, the old key is gone for good
    void resealLocalDrafts(job.newKey, job.oldKey);
    // Signing out (clearKey) drops the job: nothing more is written or shown
    const live = () => rekeyJobRef.current === job;
    let claimedAt = 0;
    const claim = async () => {
      const c = await authApi.rekeyClaim(job.rekeyId, REKEY_RUNNER);
      if (c.claimed) claimedAt = Date.now();
      return c;
    };
    // Before every write: still ours? (Asked again only every few seconds. A
    // tab that slept wakes with an old answer, so it asks before writing.)
    const guard = async () => {
      if (!live()) throw new RekeyError('Signed out', 'taken');
      if (Date.now() - claimedAt < REKEY_CLAIM_EVERY_MS) return;
      if (!(await claim()).claimed) throw new RekeyError('Another browser is re-encrypting', 'taken');
    };
    const work = async () => {
      while (live()) {
        const c = await claim();
        if (!c.pending) return; // finished, here or elsewhere
        if (c.claimed) {
          useRekeyStore.getState().set({ status: 'running' });
          try {
            // A re-encryption making progress is someone's work under way: the idle
            // sign-out mustn't end it part way (it would only carry on next sign-in)
            await runRekey({ ...job, runner: REKEY_RUNNER, guard, onProgress: progress => { noteActivity(); if (live()) useRekeyStore.getState().set({ progress }); } });
            return;
          } catch (err) {
            if (!(err instanceof RekeyError) || (err as { kind?: string }).kind !== 'taken') throw err;
          }
        }
        if (!live()) return;
        useRekeyStore.getState().set({ status: 'waiting', progress: null });
        await new Promise(r => setTimeout(r, REKEY_WAIT_MS));
      }
    };
    try {
      if (typeof navigator !== 'undefined' && navigator.locks?.request) await navigator.locks.request('chronicles-rekey', { mode: 'exclusive' }, work);
      else await work();
    } catch (err) {
      if (!live()) return;
      console.warn('Re-encryption stopped:', err instanceof Error ? err.message : 'Unknown error');
      useRekeyStore.getState().set({
        status: 'error',
        error: err instanceof RekeyError ? err.message : 'The re-encryption stopped (most likely the connection). Your journal is safe. Try again.',
        errorKind: err instanceof RekeyError && (err.kind === 'missing' || err.kind === 'photos') ? err.kind : null,
      });
      return;
    }
    if (!live()) return;
    // Its old key never opens anything in this browser again
    markRekeyFinished(job.rekeyId);
    rekeyJobRef.current = null;
    rekeyingRef.current = false;
    useRekeyStore.getState().reset();
    // The old key goes with the job; the app opens under the new one
    setIsUnlocked(true);
    setIsRestoring(false);
    showFlash('Your journal is re-encrypted with a new key. Add your passkeys again, and replace your R2 and AI keys if someone may have had your old password.');
  }, []);

  const retryRekey = useCallback((opts?: { allowMissingPhotos?: boolean }) => {
    // "Finish without them": said once, it holds for this job in this tab
    if (opts?.allowMissingPhotos && rekeyJobRef.current) rekeyJobRef.current.allowMissingPhotos = true;
    void runRekeyJob();
  }, [runRekeyJob]);

  // After a key is installed: is a re-encryption still under way?
  const resumeRekeyIfPending = useCallback(async (key: CryptoKey) => {
    retryCheckRef.current = null;
    let status: Awaited<ReturnType<typeof authApi.rekeyStatus>> | null = null;
    for (let attempt = 0; attempt < 3 && !status; attempt++) {
      try { status = await authApi.rekeyStatus(); }
      catch (err) {
        // A server from before re-encryption existed (a rollback, with this
        // page still cached) has no such route — and so no re-key under way
        if ((err as { status?: unknown } | null)?.status === 404) status = { pending: false };
        else await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    if (!status) {
      // Can't tell: opening the journal now could read half of it with the
      // wrong key, so it waits for the answer
      rekeyJobRef.current = null;
      setIsRestoring(true);
      useRekeyStore.getState().set({ status: 'error', error: 'Couldn’t reach Chronicles to check your journal. Check your connection and try again.' });
      retryCheckRef.current = () => { useRekeyStore.getState().reset(); void resumeRekeyIfPending(key); };
      return;
    }
    // A re-key this browser saw finished is over for good: its old key is never
    // taken up again, whatever the server says is pending (browserData.ts)
    if (!status.pending || rekeyFinishedHere(status.rekeyId)) {
      if (status.pending) console.warn('Ignored a re-encryption that was already finished here');
      // Restore the in-memory R2 and AI credentials from the sealed copies this
      // tab kept, so image display / cleanup and estimates work at once
      void rederiveImageStorageConfig((ct, iv, aad) => encryptionService.decryptFile(key, ct, iv, aad));
      void rederiveAiConfig((ct, iv, aad) => encryptionService.decryptFile(key, ct, iv, aad));
      // Passkeys the account no longer has (removed on another device, or by a
      // re-encryption made elsewhere) stop being asked for here, and the
      // device stops offering them where the browser can tell it to
      void syncPasskeysWithDevice();
      setIsUnlocked(true);
      // A check that failed first left the app waiting (above): it opens now
      setIsRestoring(false);
      return;
    }
    let oldKey: CryptoKey;
    try {
      oldKey = await encryptionService.openOldKey(key, status.oldKey, status.oldKeyIv, status.rekeyId);
    } catch {
      setIsRestoring(true);
      useRekeyStore.getState().set({ status: 'error', error: 'The re-encryption that was under way couldn’t be continued. Contact support before changing anything else.' });
      return;
    }
    rekeyJobRef.current = { newKey: key, oldKey, rekeyId: status.rekeyId };
    void runRekeyJob();
  }, [runRekeyJob]);
  const retryCheckRef = useRef<(() => void) | null>(null);

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
    ownMarkRef.current = null;
    rekeyJobRef.current = null;
    rekeyingRef.current = false;
    retryCheckRef.current = null;
    useRekeyStore.getState().reset();
    releaseHolderRef.current?.();
    releaseHolderRef.current = null;
    dropDecryptedState();
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

  // The journal has moved to another key in this browser (a re-key made in
  // another tab) or the browser is someone else's now, and this tab never heard
  // (it was frozen, or has no BroadcastChannel): its key must not seal another
  // thing. A save under it after a re-key could never be opened again
  // (Not while this tab is itself moving the browser to a new key: its own mark
  // and the stored one change a moment apart — commitRekey)
  const retaggingRef = useRef(false);
  const keyReplaced = () => !retaggingRef.current && !!masterKeyRef.current && !!ownMarkRef.current && ownedByAnotherKey(ownMarkRef.current);
  const dropReplacedKey = () => {
    if (!keyReplaced()) return false;
    clearKey();
    authRef.current?.dropUser();
    return true;
  };
  const getKey = () => {
    if (dropReplacedKey() || !masterKeyRef.current) throw new Error('Encryption not unlocked');
    return masterKeyRef.current;
  };
  // Looked at whenever the tab comes back, and every few seconds: a tab that
  // wakes up shows sign-in before anything is typed into it
  useEffect(() => {
    const check = () => { dropReplacedKey(); };
    const timer = setInterval(check, 10_000);
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    window.addEventListener('storage', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      window.removeEventListener('storage', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // An entry's creation time is sealed in its metadata (`_createdAt`), so the
  // server — whose created_at is readable — can't re-date it; a save that
  // rebuilds the metadata keeps the one the entry already has
  const encryptPost = useCallback(async (id: number, content: string, metadata: Record<string, unknown>) => {
    // First: while there is no key nothing is saved, so the server is told nothing either
    const key = getKey();
    const existing = useEntriesStore.getState().decryptedEntries.find(e => e.id === id);
    // "Hide from AI" is only ever turned off on purpose: a save that rebuilt
    // the metadata without it keeps what the entry had (utils/aiHiddenFlag)
    let meta = withAiHiddenKept(existing?.metadata as Record<string, unknown> | null | undefined, metadata);
    if (typeof meta._createdAt !== 'string') {
      const sealed = existing?.metadata?._createdAt;
      const at = typeof sealed === 'string' ? sealed : existing ? new Date(existing.createdAt).toISOString() : null;
      if (at) meta = { ...meta, _createdAt: at };
    }
    // Hidden from AI (its own switch or its topic): the server is told before
    // the save, so the Chronicles AI app never sees it (services/aiPrivacy.ts)
    await markHiddenOnSave(id, meta);
    return encryptionService.encryptPost(key, id, content, meta);
  }, []);

  const encryptNewPost = useCallback(async (content: string, metadata: Record<string, unknown>, options?: { aiMarks?: AiMarkBatch }) => {
    const key = getKey();
    const id = await reserveEntryId();
    const fresh = withAiHiddenKept(null, metadata);
    const meta = typeof fresh._createdAt === 'string' ? fresh : { ...fresh, _createdAt: new Date().toISOString() };
    // A new entry that's hidden from AI is marked before it exists
    await markHiddenBeforeCreate(id, meta, options?.aiMarks);
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
    const { confirmToken, encryption: e } = await withAuthSecret(password, email, currentAuthSecret => authApi.passwordWrap({
      currentAuthSecret, action, ...(code?.trim() ? { code: code.trim() } : {}),
    }));
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

  const prepareRekey = useCallback(async (newPassword: string): Promise<PreparedRekey> => {
    // setupEncryption is a new account's key: a fresh master key, its password
    // wrap and a new recovery key's wrap — exactly what a re-key needs
    const made = await encryptionService.setupEncryption(newPassword);
    const { recoveryKeyHash, recoveryKeySalt } = await newRecoveryProof(made.recoveryKey);
    const rekeyId = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    return {
      rekeyId,
      newKey: made.masterKey,
      wrap: { salt: made.salt, wrappedMK: made.wrappedMK, wrapIv: made.wrapIv },
      recoveryKey: made.recoveryKey,
      recoveryWrappedMK: made.recoveryWrappedMK,
      recoveryWrapIv: made.recoveryWrapIv,
      recoveryKeyHash,
      recoveryKeySalt,
    };
  }, []);

  const commitRekey = useCallback(async (
    prepared: PreparedRekey,
    source: KeySource,
    send: (wrap: { newEncryptedMasterKey: string; newKekSalt: string; newKekWrapIv: string; rekey: RekeyCommit }) => Promise<unknown>,
  ) => {
    const oldExtractable = await extractable(source);
    const carried = await encryptionService.sealOldKey(prepared.newKey, oldExtractable, prepared.rekeyId);
    const oldKey = await toNonExtractable(oldExtractable);
    // Written down before sending: if the answer is lost after the server made
    // the change, the next sign-in still knows this browser as the same person's
    const oldTag = accountTagForRecords();
    const newTag = await encryptionService.accountTag(prepared.newKey, 'egress');
    if (oldTag) noteRetagPending(oldTag, newTag);
    try {
    await send({
      newEncryptedMasterKey: prepared.wrap.wrappedMK,
      newKekSalt: prepared.wrap.salt,
      newKekWrapIv: prepared.wrap.wrapIv,
      rekey: {
        rekeyId: prepared.rekeyId,
        oldKey: carried.oldKey,
        oldKeyIv: carried.oldKeyIv,
        recoveryWrappedMK: prepared.recoveryWrappedMK,
        recoveryWrapIv: prepared.recoveryWrapIv,
        recoveryKeyHash: prepared.recoveryKeyHash,
        recoveryKeySalt: prepared.recoveryKeySalt,
      },
    });
    } catch (err) {
      // The server refused it (a 4xx): nothing changed. No answer at all, or a
      // server error, could be either, so the note stays for the next sign-in to decide
      const status = (err as { status?: unknown } | null)?.status;
      if (typeof status === 'number' && status >= 400 && status < 500) { clearRetagPending(); throw err; }
      // The server may have made the change all the same, with this tab's new
      // session already in place (the answer cut off part way). Left as it
      // was, this tab would go on saving under the old key while another
      // device finishes the job, and those saves could never be opened. So it
      // asks: with this very re-key under way, the commit happened
      const made = await authApi.rekeyStatus().then(r => r.pending && r.rekeyId === prepared.rekeyId, () => false);
      if (!made) throw err;
    }
    // Done on the server: the new key opens the journal from here on.
    // What this browser keeps under the account's tag moves to the new key's
    // (this tab's own mark first, so it never reads the move as another key's)
    // The stale-key check is off for these few steps: between them this tab's
    // mark and the stored one differ, and a save or the timer landing there
    // would read that as another key's and sign this tab out mid-commit
    retaggingRef.current = true;
    try {
      const newMark = await ownerMark(newTag);
      if (oldTag) await retagBrowser(oldTag, newTag);
      ownMarkRef.current = newMark;
    } finally { retaggingRef.current = false; }
    clearRetagPending();
    // The server removed the passkeys (each held the old key)
    forgetPasskeysHere();
    // And this device stops offering them, where the browser can tell it to:
    // an old passkey left beside the one added afterwards can only fail
    void syncPasskeysWithDevice();
    // Other tabs here still hold the old key and share the new session cookie:
    // they drop everything and show sign-in (they would otherwise go on
    // writing under the old key while records move)
    announceLocalReset();
    // Everything decrypted here goes; it is read again under the new key once done
    dropDecryptedState();
    // The R2 settings' blob held is the old key's: read again once done
    setImageStorageConfig(null, null);
    masterKeyRef.current = prepared.newKey;
    setEgressAccount(newTag);
    installRecordCipher(encryptionService, prepared.newKey);
    rekeyJobRef.current = { newKey: prepared.newKey, oldKey, rekeyId: prepared.rekeyId };
    void runRekeyJob();
  }, [runRekeyJob]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // A page that never needs the key (the landing page, a share, a public
  // shelf, the legal pages — services/keyHandoff.ts) doesn't ask for it, and
  // doesn't end the session either: the question waits until the tab moves to
  // a page that does (isRestoring stays true meanwhile, so an app page shows
  // its spinner rather than sign-in). The router lives under this provider, so
  // KeylessPageWatch (App.tsx, inside the router) reports each page via notePage
  const [onKeylessPage, setOnKeylessPage] = useState(() => keylessPage());
  const notePage = useCallback((pathname: string) => setOnKeylessPage(keylessPage(pathname)), []);
  useEffect(() => {
    if (!auth) { setIsRestoring(false); return; }
    if (authLoading || askedRef.current) return;
    const email = auth.user?.email;
    if (!email || masterKeyRef.current) { askedRef.current = true; setIsRestoring(false); return; }
    if (onKeylessPage) return;
    askedRef.current = true;
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
      if (!rekeyingRef.current && !rekeyActive()) setIsRestoring(false);
    })();
  }, [authLoading, onKeylessPage]); // eslint-disable-line react-hooks/exhaustive-deps

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
      notePage,
      prepareRekey,
      commitRekey,
      retryRekey: (opts) => { if (retryCheckRef.current) retryCheckRef.current(); else retryRekey(opts); },
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
