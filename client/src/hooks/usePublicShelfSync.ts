import { useEffect, useMemo, useRef } from 'react';
import { useEntriesStore } from '../stores/entriesStore.js';
import { usePublicShelfStore } from '../stores/publicShelfStore.js';
import { publicShelf as publicShelfApi, ApiError, retryDelayMs, type OwnedPublicShelf } from '../services/api.js';
import { buildPublicShelfItems, ON_PUBLIC_SHELF } from '../services/publicShelf.js';
import { mediaItems, mediaTopicIds } from '../utils/media.js';
import { stripHtml } from '../utils/stripHtml.js';
import { showFlash } from '../services/flashNotice.js';
import { PUBLIC_SHELF_TITLE_DEFAULT } from '@shared/validation/schemas';

/*
 * Keeps the public shelf in step with the journal while the owner is signed
 * in and unlocked: whenever the bookmarked media items (or their shown
 * fields, or the title) change, the whole list is rebuilt and sent once,
 * 1.5 s after the last change. Nothing is sent while there is no shelf (the
 * first bookmark creates it after the owner confirms), while the journal is
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
  const title = usePublicShelfStore(s => s.title);
  const lastSentBody = usePublicShelfStore(s => s.lastSentBody);
  const attemptRef = useRef(0);
  const failedBodyRef = useRef<string | null>(null);
  const flashedRef = useRef(false);

  // Ask once per unlock whether this account has a shelf
  useEffect(() => {
    if (!active || loaded) return;
    let cancelled = false;
    publicShelfApi.mine()
      .then(({ publicShelf }) => { if (!cancelled) usePublicShelfStore.getState().setLoaded(publicShelf); })
      .catch(() => { /* a signed-out or offline start — asked again next time */ });
    return () => { cancelled = true; };
  }, [active, loaded]);

  // The body the server should hold now (cheap: a filter over items already in memory)
  const body = useMemo(() => {
    if (!active || !shelf) return null;
    const items = buildPublicShelfItems(mediaItems(entries, mediaTopicIds(allTopics), stripHtml));
    return JSON.stringify({ title: title.trim() || PUBLIC_SHELF_TITLE_DEFAULT, items });
  }, [active, shelf, entries, allTopics, title]);

  useEffect(() => {
    if (!active || !loaded || !shelf || !isInitialized || !body || body === lastSentBody) return;
    if (failedBodyRef.current === body) return; // a 413 — nothing changes until the list does
    const store = usePublicShelfStore.getState();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      store.setStatus('offline');
      const again = () => usePublicShelfStore.setState({ status: 'idle' }); // re-runs this effect
      window.addEventListener('online', again, { once: true });
      return () => window.removeEventListener('online', again);
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
        // Nudge the effect to schedule the retry (the body is unchanged)
        usePublicShelfStore.setState({ status: 'error' });
      }
    }, delay);
    return () => clearTimeout(timer); // a lock or unmount drops a pending publish
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, loaded, shelf?.token, isInitialized, body, lastSentBody, usePublicShelfStore.getState().status]);
}

/* ── Owner actions (used by the Media Journal's panel and Settings) ── */

/** Create the shelf now with what's bookmarked (the first bookmark's "Turn on") */
export async function enablePublicShelf(title: string): Promise<OwnedPublicShelf> {
  const { decryptedEntries, allTopics } = useEntriesStore.getState();
  const items = buildPublicShelfItems(mediaItems(decryptedEntries, mediaTopicIds(allTopics), stripHtml));
  const name = title.trim() || PUBLIC_SHELF_TITLE_DEFAULT;
  const saved = await publicShelfApi.put({ title: name, items });
  const store = usePublicShelfStore.getState();
  store.setTitle(name);
  store.setLastSentBody(JSON.stringify({ title: name, items }));
  store.setPublicShelf(saved);
  return saved;
}

/** Turn the shelf off: the row is deleted; the bookmarks stay on the entries */
export async function disablePublicShelf(): Promise<void> {
  await publicShelfApi.remove();
  const store = usePublicShelfStore.getState();
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
}

export { ON_PUBLIC_SHELF };
