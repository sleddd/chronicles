/**
 * Tells every other open Chronicles tab what this one is doing with the
 * browser's sign-in, so none of them keeps someone else's journal on screen:
 *
 * - `reset`: this browser's data is being wiped (Sign out, or a different
 *   person signed in). Every tab drops its key and decrypted data.
 * - `signing-in` (with the email): someone is signing in here. The browser's
 *   session cookie is about to become theirs, so a tab showing a DIFFERENT
 *   person drops everything at once; a tab showing the same person carries on
 *   (it simply shares the new session).
 *
 * BroadcastChannel where there is one; `localStorage.clear()` (a wipe) fires a
 * `storage` event with `key === null` as the fallback for `reset`.
 */
const CHANNEL = 'chronicles-auth';
const RESET = 'reset';
const SIGNING_IN = 'signing-in';
/** A channel also hears other channel objects in the same tab — ignore our own */
const TAB_ID = Math.random().toString(36).slice(2);

function channel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
  } catch {
    return null;
  }
}

function post(message: Record<string, unknown>): void {
  const ch = channel();
  if (!ch) return;
  try { ch.postMessage({ ...message, from: TAB_ID }); } catch { /* closed */ }
  ch.close();
}

export function announceLocalReset(): void {
  post({ type: RESET });
}

/** Someone is signing in on this browser as `email` (normalized the way sign-in does). */
export function announceSigningIn(email: string): void {
  post({ type: SIGNING_IN, email: email.trim().toLowerCase() });
}

/**
 * Run `onReset` when another tab wipes this browser's data, or signs in as
 * someone other than `whoIsHere()` (this tab's signed-in email, or null).
 * Returns the unsubscribe.
 */
export function onRemoteReset(onReset: () => void, whoIsHere: () => string | null = () => null): () => void {
  const ch = channel();
  const onMessage = (e: MessageEvent) => {
    if (e.data?.from === TAB_ID) return;
    if (e.data?.type === RESET) onReset();
    else if (e.data?.type === SIGNING_IN) {
      const here = whoIsHere();
      if (here !== null && here.trim().toLowerCase() !== e.data.email) onReset();
    }
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
