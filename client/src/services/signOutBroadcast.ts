/**
 * Tells every other open Chronicles tab that this browser's session data is being
 * wiped (sign-out, or the clean start before a new sign-in), so they drop their
 * master key and decrypted data at once instead of leaving them on screen.
 *
 * BroadcastChannel where there is one; `localStorage.clear()` (which `resetLocal`
 * also does) fires a `storage` event with `key === null` as the fallback.
 */
const CHANNEL = 'chronicles-auth';
const RESET = 'reset';
/** A channel also hears other channel objects in the same tab — ignore our own */
const TAB_ID = Math.random().toString(36).slice(2);

function channel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
  } catch {
    return null;
  }
}

export function announceLocalReset(): void {
  const ch = channel();
  if (!ch) return;
  try { ch.postMessage({ type: RESET, from: TAB_ID }); } catch { /* closed */ }
  ch.close();
}

/** Run `onReset` when another tab wipes this browser's data. Returns the unsubscribe. */
export function onRemoteReset(onReset: () => void): () => void {
  const ch = channel();
  const onMessage = (e: MessageEvent) => {
    if (e.data?.type === RESET && e.data.from !== TAB_ID) onReset();
  };
  const onStorage = (e: StorageEvent) => { if (e.key === null) onReset(); };
  ch?.addEventListener('message', onMessage);
  window.addEventListener('storage', onStorage);
  return () => {
    ch?.removeEventListener('message', onMessage);
    ch?.close();
    window.removeEventListener('storage', onStorage);
  };
}
