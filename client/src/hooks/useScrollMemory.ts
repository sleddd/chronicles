import { useEffect, useRef, type RefObject } from 'react';

/* Coming back to a page from the journal (an entry opened from it, then saved, closed or deleted):
   the page's own scroller goes back to where it was, not the top. The place is kept for this tab
   (sessionStorage) only when the page is left for the journal, and used once.

   The page's content arrives in steps (cards load their data), so it is put back over a short
   while, until the content is tall enough — and never once the person scrolls themselves. */

const RESTORE_FOR_MS = 2500;

export function useScrollMemory(ref: RefObject<HTMLElement | null>, key: string, ready: boolean) {
  const storageKey = `scroll-memory:${key}`;
  const last = useRef(0);

  // Keep the place as it scrolls, and on leaving keep it only when going to the journal
  useEffect(() => {
    const el = ref.current;
    if (!ready || !el) return;
    const onScroll = () => { last.current = el.scrollTop; };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      try {
        // Cleanup runs once the address has already changed
        if (window.location.pathname.startsWith('/journal') && last.current > 0) sessionStorage.setItem(storageKey, String(Math.round(last.current)));
        else sessionStorage.removeItem(storageKey);
      } catch { /* storage unavailable */ }
    };
  }, [ready, ref, storageKey]);

  // Back again: put it back (once)
  useEffect(() => {
    const el = ref.current;
    if (!ready || !el) return;
    let target = 0;
    try {
      target = Number(sessionStorage.getItem(storageKey)) || 0;
      sessionStorage.removeItem(storageKey);
    } catch { /* storage unavailable */ }
    if (target <= 0) return;
    let frame = 0;
    let stopped = false;
    const started = performance.now();
    const stop = () => { stopped = true; cancelAnimationFrame(frame); };
    // The person scrolling (or pressing a key) wins
    const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    events.forEach(ev => el.addEventListener(ev, stop, { passive: true }));
    const step = () => {
      if (stopped) return;
      el.scrollTop = target;
      last.current = el.scrollTop;
      if (Math.abs(el.scrollTop - target) < 2 || performance.now() - started > RESTORE_FOR_MS) { stop(); return; }
      frame = requestAnimationFrame(step);
    };
    step();
    return () => { stop(); events.forEach(ev => el.removeEventListener(ev, stop)); };
  }, [ready, ref, storageKey]);
}
