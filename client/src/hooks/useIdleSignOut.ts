import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { auth as authApi, lastRequestTime } from '../services/api.js';
import { flushDrafts } from '../services/drafts.js';
import { ACTIVITY_EVENT, ACTIVITY_STORE_KEY, IDLE_SIGN_OUT_MS, isIdle, lastActivity, markActivity } from '../services/activity.js';
import { useEndSession } from './useSignOut.js';

export { ACTIVITY_STORE_KEY, IDLE_SIGN_OUT_MS, isIdle };
export const IDLE_NOTE = 'You were signed out after 15 minutes away.';

// Someone at the page, but nothing sent to the server for this long: say so,
// so the server's own idle limit (2 hours) doesn't end a session that's in use
const PING_AFTER_MS = 10 * 60 * 1000;
const WRITE_EVERY_MS = 15_000;
const CHECK_EVERY_MS = 10_000;

/**
 * Ends the session after 15 minutes with nobody at any Chronicles tab.
 *
 * Measured against the clock, never by a running timer: timers stop while a
 * laptop sleeps, so one set for 15 minutes could come back hours later with
 * time still on it. The check runs every 10 seconds, whenever the page is
 * shown, hidden or focused, and before any activity is counted — a laptop
 * reopened after hours is signed out by its first check, not kept alive by the
 * click that woke it.
 *
 * Mounting is not activity: a tab that took the key from another tab must not
 * reset the clock for both. Signing in is (EncryptionContext marks it), and a
 * tab asked for the key refuses once the browser is idle (services/keyHandoff).
 *
 * Switching tabs does nothing by itself. Nothing typed is lost: saved entries
 * autosave, and unsaved writing is sealed as it's typed and offered back after
 * the next sign-in (services/drafts.ts).
 */
export function useIdleSignOut(): void {
  const { isAuthenticated } = useAuth();
  const { isUnlocked } = useEncryption();
  const endSession = useEndSession();
  const endRef = useRef(endSession);
  endRef.current = endSession;

  useEffect(() => {
    if (!isAuthenticated || !isUnlocked) return;
    // What this tab has seen itself. Starting to watch isn't someone being
    // here: the shared record (set at sign-in, kept by whoever is active) says
    let lastHere = 0;
    let lastWrite = Date.now();
    let lastPing = Date.now();
    let ending = false;

    const end = () => {
      if (ending) return;
      ending = true;
      // Anything still being typed is sealed first (it is also sealed as it's typed)
      void flushDrafts().catch(() => {}).then(() => endRef.current(IDLE_NOTE));
    };
    const check = (): boolean => {
      if (ending) return true;
      if (!isIdle(Date.now(), lastHere, lastActivity())) return false;
      end();
      return true;
    };
    const active = () => {
      // First: were they away too long? Only then does this count as being here
      if (check()) return;
      const now = Date.now();
      lastHere = now;
      if (lastWrite === 0 || now - lastWrite > WRITE_EVERY_MS) { lastWrite = now; markActivity(now); }
      if (now - lastPing > PING_AFTER_MS && now - lastRequestTime() > PING_AFTER_MS) {
        lastPing = now;
        void authApi.me().catch(() => { /* the next data request says if the session ended */ });
      }
    };
    // Shown, hidden or focused: look at the clock either way (a tab going into
    // the background after a long sleep must not stay signed in back there)
    const back = () => { check(); };

    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'];
    // Capture: scrolling happens inside the pages' own panels, which don't bubble
    events.forEach(e => document.addEventListener(e, active, { capture: true, passive: true }));
    window.addEventListener(ACTIVITY_EVENT, active);
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    window.addEventListener('pageshow', back);
    const timer = setInterval(check, CHECK_EVERY_MS);

    return () => {
      events.forEach(e => document.removeEventListener(e, active, { capture: true }));
      window.removeEventListener(ACTIVITY_EVENT, active);
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('focus', back);
      window.removeEventListener('pageshow', back);
      clearInterval(timer);
    };
  }, [isAuthenticated, isUnlocked]);
}
