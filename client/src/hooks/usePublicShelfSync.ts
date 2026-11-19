import { useEffect, useMemo, useRef, useState } from 'react';
import { useEntriesStore } from '../stores/entriesStore.js';
import { usePublicShelfStore } from '../stores/publicShelfStore.js';
import { publicShelf as publicShelfApi, ApiError, retryDelayMs, type OwnedPublicShelf } from '../services/api.js';
import { buildPublicShelfItems, ON_PUBLIC_SHELF } from '../services/publicShelf.js';
import { mediaItems, mediaTopicIds } from '../utils/media.js';
import { stripHtml } from '../utils/stripHtml.js';
import { showFlash } from '../services/flashNotice.js';
import { recordPublicShelfChoice, reconcilePublicShelf, accountTagForRecords } from '../services/deviceConsent.js';
import { PUBLIC_SHELF_TITLE_DEFAULT } from '@shared/validation/schemas';

/*
 * Keeps the public shelf in step with the journal while the owner is signed
 * in and unlocked: whenever the bookmarked media items (or their shown
 * fields, or the title) change, the whole list is rebuilt and sent once,
 * 1.5 s after the last change. Nothing is sent while there is no shelf (the
 * first bookmark creates it after the owner confirms), before the owner has
 * pressed Turn on in this browser (`enabledHere` — the server saying a shelf
 * exists is never enough to upload anything), while the journal is
 * locked or still loading (an empty store must never publish an empty shelf),
 * or when the body is the one the server already has. Mounted once, app-wide,
 * by PublicShelfSync in App.tsx, so edits made in the journal editor and
 * deletions reach the public page too.
 */

const DEBOUNCE_MS = 1500;

export function usePublicShelfSync(active: boolean): void {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const isInitialized = useEntriesStore(s => s.isInitialized);
  const loaded = usePublicShelfStore(s => s.loaded);
  const shelf = usePublicShelfStore(s => s.publicShelf);
  const enabledHere = usePublicShelfStore(s => s.enabledHere);
  const title = usePublicShelfStore(s => s.title);
  const lastSentBody = usePublicShelfStore(s => s.lastSentBody);
  const attemptRef = useRef(0);
  const failedBodyRef = useRef<string | null>(null);
  const flashedRef = useRef(false);
  // Bumped to run the publish effect again with nothing else changed: after a
  // failed try (its retry) and when the browser comes back online. The effect
  // used to list the store's status among its deps without this hook ever
  // re-rendering on it, so a publish that failed once was never tried again
  // until the shelf changed — the public page stayed as it was
  const [again, setAgain] = useState(0);

  // What the store holds is for another account (a sign-out that didn't clear
  // it): drop it, so it's asked again below for the one signed in now
  const heldFor = usePublicShelfStore(s => s.account);
  useEffect(() => {
    if (active && loaded && heldFor !== accountTagForRecords()) usePublicShelfStore.getState().reset();
  }, [active, loaded, heldFor]);

  // Ask once per unlock whether this account has a shelf
  useEffect(() => {
    if (!active || loaded) return;
    let cancelled = false;
    publicShelfApi.mine()
      .then(({ publicShelf }) => {
        if (cancelled) return;
        // Turned off in another browser: this one's go-ahead ends too, so a
        // shelf the server brings back later is never published to from here
        reconcilePublicShelf(publicShelf !== null);
        usePublicShelfStore.getState().setLoaded(publicShelf);
      })
      .catch(() => { /* a signed-out or offline start — asked again next time */ });
    return () => { cancelled = true; };
  }, [active, loaded]);

  // The body the server should hold now (cheap: a filter over items already in memory)
  const body = useMemo(() => {
    if (!active || !shelf || !isInitialized) return null;
    const items = buildPublicShelfItems(mediaItems(entries, mediaTopicIds(allTopics), stripHtml));
    return JSON.stringify({ title: title.trim() || PUBLIC_SHELF_TITLE_DEFAULT, items });
  }, [active, shelf, isInitialized, entries, allTopics, title]);

  // A browser the shelf isn't turned on in yet turns it on by itself the
  // moment the owner changes what the shelf shows here — a bookmarked item's
  // title, cover or rating edited, a bookmark put on or taken off, the shelf
  // renamed. That's the owner's own action in this browser, so it counts as
  // Turn on; what the server says alone still never uploads anything. The
  // first body seen after loading is the baseline (nothing changed yet).
  const baselineRef = useRef<string | null>(null);
  useEffect(() => {
    if (!body) { baselineRef.current = null; return; }
    if (enabledHere) return;
    if (baselineRef.current === null) { baselineRef.current = body; return; }
    if (body !== baselineRef.current) turnOnPublicShelfHere();
  }, [body, enabledHere]);

  useEffect(() => {
    if (!active || !loaded || !shelf || !enabledHere || !isInitialized || !body || body === lastSentBody) return;
    if (failedBodyRef.current === body) return; // a 413 — nothing changes until the list does
    const store = usePublicShelfStore.getState();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      store.setStatus('offline');
      const online = () => { usePublicShelfStore.setState({ status: 'idle' }); setAgain(n => n + 1); };
      window.addEventListener('online', online, { once: true });
      return () => window.removeEventListener('online', online);
    }
    const delay = attemptRef.current === 0 ? DEBOUNCE_MS : retryDelayMs(null, attemptRef.current);
    const timer = setTimeout(async () => {
      store.setStatus('saving');
      try {
        const saved: OwnedPublicShelf = await publicShelfApi.put(JSON.parse(body));
        const now = usePublicShelfStore.getState();
        now.setPublicShelf(saved);
        now.setLastSentBody(body);
        now.setStatus('idle');
        attemptRef.current = 0;
        flashedRef.current = false;
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0;
        const now = usePublicShelfStore.getState();
        if (status === 413) {
          failedBodyRef.current = body;
          now.setStatus('error');
          showFlash('Your public shelf is too big — take a few items off it');
          return;
        }
        if (status === 401 || status === 403) { now.setStatus('idle'); return; }
        attemptRef.current += 1;
        now.setStatus('error');
        if (!flashedRef.current) {
          flashedRef.current = true;
          showFlash('Couldn’t update your public shelf — will try again');
        }
        // Schedule the retry (the body is unchanged, so nothing else re-runs the effect)
        setAgain(n => n + 1);
      }
    }, delay);
    return () => clearTimeout(timer); // a lock or unmount drops a pending publish
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, loaded, shelf?.token, enabledHere, isInitialized, body, lastSentBody, again]);
}

/* ── Owner actions (used by the Media Journal's panel and Settings) ── */

/** Create the shelf now with what's bookmarked (the first bookmark's "Turn on") */
export async function enablePublicShelf(title: string): Promise<OwnedPublicShelf> {
  const { decryptedEntries, allTopics } = useEntriesStore.getState();
  const items = buildPublicShelfItems(mediaItems(decryptedEntries, mediaTopicIds(allTopics), stripHtml));
  const name = title.trim() || PUBLIC_SHELF_TITLE_DEFAULT;
  const saved = await publicShelfApi.put({ title: name, items });
  recordPublicShelfChoice(true);
  const store = usePublicShelfStore.getState();
  store.setEnabledHere(true);
  store.setTitle(name);
  store.setLastSentBody(JSON.stringify({ title: name, items }));
  store.setPublicShelf(saved);
  return saved;
}

/** This browser publishes the shelf from now on (the owner acted on it here) */
export function turnOnPublicShelfHere(): void {
  const store = usePublicShelfStore.getState();
  if (!store.publicShelf || store.enabledHere) return;
  recordPublicShelfChoice(true);
  store.setEnabledHere(true);
}

/** Turn the shelf off: the row is deleted; the bookmarks stay on the entries */
export async function disablePublicShelf(): Promise<void> {
  // This browser stops publishing first, whatever the server then answers: a
  // delete that fails must not leave bookmark changes going up
  recordPublicShelfChoice(false);
  usePublicShelfStore.getState().setEnabledHere(false);
  await publicShelfApi.remove();
  const store = usePublicShelfStore.getState();
  store.setEnabledHere(false);
  store.setPublicShelf(null);
  store.setLastSentBody(null);
  store.setStatus('idle');
}

/** A new link; the old one stops working */
export async function resetPublicShelfLink(): Promise<OwnedPublicShelf> {
  const saved = await publicShelfApi.reset();
  usePublicShelfStore.getState().setPublicShelf(saved);
  return saved;
}

/** The title shown on the public page (the sync publishes it) */
export function renamePublicShelf(title: string): void {
  usePublicShelfStore.getState().setTitle(title.trim() || PUBLIC_SHELF_TITLE_DEFAULT);
  turnOnPublicShelfHere();
}

export { ON_PUBLIC_SHELF };
