/*
 * When someone was last at any Chronicles tab in this browser.
 *
 * Shared through localStorage so that reading in one tab doesn't sign out
 * another, and so a tab that is asked for the key (services/keyHandoff.ts)
 * can tell that nobody has been here for too long and refuse: a new tab must
 * never be let in, with no password or touch, off the back of a tab that
 * should already have signed out.
 */

/** With nobody at any Chronicles tab for this long, the session ends. */
export const IDLE_SIGN_OUT_MS = 15 * 60 * 1000;
export const ACTIVITY_STORE_KEY = 'chronicles.lastActive';
/** Something other than a pointer or key shows someone is here (dictation putting words in the editor) */
export const ACTIVITY_EVENT = 'chronicles:activity';

// This tab's own record, for when localStorage is unavailable
let lastHere = 0;

export function lastActivity(): number {
  let shared = 0;
  try { shared = Number(localStorage.getItem(ACTIVITY_STORE_KEY)) || 0; } catch { /* storage unavailable */ }
  return Math.max(shared, lastHere);
}

/** Someone is here now. */
export function markActivity(now = Date.now()): void {
  lastHere = now;
  try { localStorage.setItem(ACTIVITY_STORE_KEY, String(now)); } catch { /* storage unavailable: this tab's own record stands */ }
}

/** Idle by the clock: how long since anyone was at this tab or any other. Pure, for tests. */
export function isIdle(now: number, lastSeenHere: number, lastSeenAnywhere: number, limit = IDLE_SIGN_OUT_MS): boolean {
  return now - Math.max(lastSeenHere, lastSeenAnywhere) > limit;
}

/** Has nobody been at any Chronicles tab for too long? */
export function browserIsIdle(now = Date.now()): boolean {
  return isIdle(now, lastHere, lastActivity());
}

/** Tell the idle watch someone is here, from code that sees presence without a pointer or key event. */
export function noteActivity(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACTIVITY_EVENT));
}

/** Tests only */
export function resetActivityForTests(): void { lastHere = 0; }
