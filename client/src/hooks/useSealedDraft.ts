import { useCallback, useEffect, useRef, useState } from 'react';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { draftsAvailable, onFlushDrafts, readDraft, removeDraft, saveDraft } from '../services/drafts.js';

/** A moment after the last change, the draft is sealed. */
const SEAL_AFTER_MS = 2000;

interface Found<T> { value: T; savedAt: number }
/** What a slot holds: the latest unsaved writing, and one from before that was still on offer when it was typed */
interface Stored<T> { value: T; older?: Found<T> }

export interface SealedDraft<T> {
  /** A draft from before, waiting to be restored or discarded (null once dealt with, or when there's none) */
  found: Found<T> | null;
  /** The form took the draft's content: stop offering it (it is now the form's own unsaved writing) */
  taken: () => void;
  /** Throw the found draft away */
  discard: () => void;
  /** The writing was saved as an entry: the stored draft goes now, not a moment later */
  clear: () => void;
}

/**
 * Keeps a form's unsaved writing sealed in this browser so it survives the
 * session ending (services/drafts.ts).
 *
 * `read` gives what would be lost right now — null when there is nothing
 * unsaved. It is called a moment after anything in `deps` changes (never on
 * every keystroke: an entry can be megabytes), and what it returns is sealed;
 * null removes the stored draft.
 *
 * A draft found from before is offered back (`found`) and is never lost to
 * new typing: writing something else while it is on offer seals the new text
 * with the old draft kept beside it, and the old one is offered again next
 * time. When the form goes away, whatever is waiting is settled at once — so a
 * save followed by leaving the page doesn't leave a draft of a saved entry.
 */
export function useSealedDraft<T>(slot: string, read: () => T | null, deps: readonly unknown[]): SealedDraft<T> {
  const { isUnlocked, encryptBytes, decryptBytes } = useEncryption();
  const [found, setFound] = useState<Found<T> | null>(null);
  const foundRef = useRef<Found<T> | null>(null);
  // An older draft still waiting behind the one on offer
  const olderRef = useRef<Found<T> | null>(null);
  // The stored draft has been read (nothing is written before that)
  const loaded = useRef(false);
  const cipher = useRef({ encryptBytes, decryptBytes });
  cipher.current = { encryptBytes, decryptBytes };
  const latest = useRef(read);
  latest.current = read;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stored = useRef(false);

  const offer = useCallback((draft: Found<T> | null) => { foundRef.current = draft; setFound(draft); }, []);

  useEffect(() => {
    if (!isUnlocked || !draftsAvailable()) return;
    let cancelled = false;
    loaded.current = false;
    void readDraft<Stored<T>>(cipher.current, slot).then(draft => {
      if (cancelled) return;
      if (draft) {
        stored.current = true;
        olderRef.current = draft.value.older ?? null;
        offer({ value: draft.value.value, savedAt: draft.savedAt });
      }
      loaded.current = true;
    }).catch(() => { /* couldn't read: nothing is written over what may be there */ });
    return () => { cancelled = true; };
  }, [isUnlocked, slot, offer]);

  const sealNow = useCallback(async () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (!loaded.current || !draftsAvailable()) return;
    const v = latest.current();
    // A draft still on offer (or waiting behind it) is kept beside the new writing
    const waiting = foundRef.current ?? olderRef.current;
    if (v === null) {
      if (waiting) return; // what is stored is the offer itself: leave it
      if (stored.current) { stored.current = false; await removeDraft(slot); }
      return;
    }
    stored.current = true;
    const value: Stored<T> = waiting ? { value: v, older: waiting } : { value: v };
    await saveDraft(cipher.current, slot, value).catch(() => { /* the key left meanwhile, or storage is full: the next change tries again */ });
  }, [slot]);

  // Sealed a moment after each change
  useEffect(() => {
    if (!isUnlocked || !draftsAvailable()) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void sealNow(); }, SEAL_AFTER_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnlocked, sealNow, ...deps]);

  // The form is going away: settle what is waiting now (a save just before
  // leaving must remove its draft; unsaved writing must be sealed)
  useEffect(() => () => { if (timer.current) void sealNow(); }, [sealNow]);

  // The session is about to be ended on purpose: seal what's waiting
  useEffect(() => onFlushDrafts(() => (timer.current ? sealNow() : Promise.resolve())), [sealNow]);

  /** The one on offer is dealt with: the one behind it (if any) is offered next */
  const next = useCallback(() => {
    const older = olderRef.current;
    olderRef.current = null;
    offer(older);
    return older;
  }, [offer]);

  const taken = useCallback(() => {
    next();
    // The form's content changes with the restore, which schedules the seal
  }, [next]);

  const discard = useCallback(() => {
    const older = next();
    clearTimeout(timer.current);
    timer.current = undefined;
    const v = latest.current();
    if (v !== null) { void sealNow(); return; }
    // Nothing typed: what is stored becomes the older one, or nothing
    if (older) void saveDraft(cipher.current, slot, { value: older.value } satisfies Stored<T>, older.savedAt).catch(() => {});
    else { stored.current = false; void removeDraft(slot); }
  }, [next, sealNow, slot]);

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (!loaded.current) return;
    const waiting = foundRef.current ?? olderRef.current;
    if (waiting) {
      // The saved writing goes; the draft still on offer stays stored by itself
      void saveDraft(cipher.current, slot, { value: waiting.value } satisfies Stored<T>, waiting.savedAt).catch(() => {});
      return;
    }
    stored.current = false;
    void removeDraft(slot);
  }, [slot]);

  return { found, taken, discard, clear };
}
