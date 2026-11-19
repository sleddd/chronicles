/*
 * A new tab takes the key from one that already holds it.
 *
 * The master key lives only in a tab's memory, so a second tab (or a reload
 * beside an open tab) starts without it. A non-extractable CryptoKey can be
 * passed between tabs of the same site, still non-extractable — so the new tab
 * asks, and opens with no prompt. Nothing is stored anywhere for this.
 *
 * A new tab first finds out whether any tab holds the key. With none, the
 * session cookie it found is nobody's any more and it ends it
 * (AuthContext.endSession); with one, it asks over the channel and waits for
 * the key. Tabs that hold the key keep a Web Lock, which answers that at once
 * with no timing guess. Where a browser has no Web Locks (Safari was found
 * without them), the new tab asks "who is here?" over the channel and takes a
 * short silence as nobody: a tab too frozen to answer isn't being used, and
 * when its person comes back it simply carries on under whatever session the
 * browser holds by then (the cookie is the browser's, not the tab's).
 *
 * Where a browser can't pass a CryptoKey between tabs (the holder says so),
 * the new tab shows sign-in and shares the browser's session.
 *
 * Who can hear the key. Every script of this origin can open the channel, and
 * BroadcastChannel can't carry a MessagePort or name its sender, so there is
 * no private line between two tabs and no way for the holder to tell an
 * honest request from one made by injected script (which could ask in the
 * same words — the email comes from /me, which its cookies answer). What is
 * done instead:
 * - the key goes out only in answer to a request, and only on a channel named
 *   for that request (`chronicles-key:<random id>`), so it is cloned into the
 *   asking tab alone — not into every tab listening on the shared channel
 *   (other holders, other tabs asking at the time)
 * - pages that never need the key — the landing page, shares, public shelves,
 *   the legal pages (`keylessPage`) — never ask for it, and a tab showing one
 *   never hands it out. Those pages show other people's text (a share, a
 *   shelf), so they are where injected script is likeliest; keeping the key
 *   out of their memory is what can be done. A script that runs in the app's
 *   own pages could use the key there anyway.
 */

const LOCK = 'chronicles-key';
const CHANNEL = 'chronicles-key';

interface Need { type: 'need'; id: string; email: string; reply?: string }
interface Key { type: 'key'; to: string; key: CryptoKey }
interface None { type: 'none'; to: string }
interface Who { type: 'who'; id: string }
interface Here { type: 'here'; to: string }
/** How long a silence counts as "no tab holds the key" where there are no Web Locks */
const WHO_TIMEOUT_MS = 800;

const channel = (name = CHANNEL): BroadcastChannel | null => {
  try { return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name); } catch { return null; }
};

/** The reply channel for one request: named for it, so only the tab that asked listens. */
const replyName = (id: string) => `${CHANNEL}:${id}`;
const REQUEST_ID = /^[0-9a-f-]{36}$/i;

/** Pages that never need the key (and show other people's text): they neither ask for it nor hand it out. */
const KEYLESS_PREFIXES = ['/share', '/public-shelf', '/health-privacy', '/terms', '/license', '/report-a-bug'];
export function keylessPage(pathname: string = typeof location === 'undefined' ? '' : location.pathname): boolean {
  return pathname === '/' || KEYLESS_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * This tab holds (or is about to hold) the key: keep the lock and answer other
 * tabs that ask. `current` gives the key and whose it is, or null while there
 * is none yet (signing in). Returns the release.
 */
export function holdKey(current: () => { key: CryptoKey; email: string } | null): () => void {
  let release: (() => void) | null = null;
  let released = false;
  try {
    void navigator.locks?.request(LOCK, { mode: 'shared' }, () => new Promise<void>(resolve => {
      if (released) resolve(); else release = resolve;
    })).catch(() => { /* no lock: other tabs fall back to asking */ });
  } catch { /* Web Locks unavailable */ }

  const ch = channel();
  const onMessage = (e: MessageEvent) => {
    const msg = e.data as Need | Who | undefined;
    if (msg?.type === 'who' && typeof msg.id === 'string') {
      // Holding, or signing in: either way the browser's session is in use
      try { ch?.postMessage({ type: 'here', to: msg.id } satisfies Here); } catch { /* closed */ }
      return;
    }
    if (msg?.type !== 'need' || typeof msg.id !== 'string') return;
    const held = current();
    // Only to a tab the server says is the same person (its /me): never
    // someone else's key into another account's session. And never from a
    // tab showing a page that has no business with it
    if (!held || held.email !== msg.email || keylessPage()) {
      try { ch?.postMessage({ type: 'none', to: msg.id } satisfies None); } catch { /* closed */ }
      return;
    }
    // On the request's own channel. (A request without one comes from a tab
    // still running the version before it, answered as before until it reloads)
    const withReply = typeof msg.reply === 'string' && msg.reply === replyName(msg.id) && REQUEST_ID.test(msg.id);
    const out = withReply ? channel(msg.reply) : ch;
    try {
      out?.postMessage({ type: 'key', to: msg.id, key: held.key } satisfies Key);
    } catch {
      // This browser won't pass a CryptoKey between tabs
      try { ch?.postMessage({ type: 'none', to: msg.id } satisfies None); } catch { /* closed */ }
    } finally {
      if (withReply) out?.close();
    }
  };
  ch?.addEventListener('message', onMessage);
  return () => {
    released = true;
    release?.();
    ch?.removeEventListener('message', onMessage);
    ch?.close();
  };
}

/** Does another tab hold the key (or is one signing in)? null only when this browser has no way to ask. */
export async function keyHolderExists(timeoutMs = WHO_TIMEOUT_MS): Promise<boolean | null> {
  try {
    if (navigator.locks?.query) {
      const { held = [] } = await navigator.locks.query();
      return held.some(l => l.name === LOCK);
    }
  } catch { /* fall through to asking */ }
  const ch = channel();
  if (!ch) return null;
  const id = crypto.randomUUID();
  return new Promise(resolve => {
    const done = (answer: boolean) => {
      clearTimeout(timer);
      ch.removeEventListener('message', onMessage);
      ch.close();
      resolve(answer);
    };
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as Here | undefined;
      if (msg?.type === 'here' && msg.to === id) done(true);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    ch.addEventListener('message', onMessage);
    try { ch.postMessage({ type: 'who', id } satisfies Who); } catch { done(false); }
  });
}

/** Ask the other tabs for the key. Null when none answers with it in time (and always on a keyless page). */
export function requestKey(email: string, timeoutMs = 2500): Promise<CryptoKey | null> {
  if (keylessPage()) return Promise.resolve(null);
  const ch = channel();
  if (!ch) return Promise.resolve(null);
  const id = crypto.randomUUID();
  const reply = channel(replyName(id));
  return new Promise(resolve => {
    const done = (key: CryptoKey | null) => {
      clearTimeout(timer);
      ch.removeEventListener('message', onMessage);
      reply?.removeEventListener('message', onMessage);
      ch.close();
      reply?.close();
      resolve(key);
    };
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as Key | None | undefined;
      if (!msg || msg.to !== id) return;
      // A tab that answers "none" can't give it; another may still, so that waits for the timeout
      if (msg.type === 'key' && msg.key instanceof CryptoKey && !msg.key.extractable) done(msg.key);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    ch.addEventListener('message', onMessage);
    reply?.addEventListener('message', onMessage);
    // A message that failed to deserialize here (no CryptoKey support): give up early
    ch.addEventListener('messageerror', () => done(null));
    reply?.addEventListener('messageerror', () => done(null));
    try { ch.postMessage({ type: 'need', id, email, ...(reply ? { reply: replyName(id) } : {}) } satisfies Need); } catch { done(null); }
  });
}
