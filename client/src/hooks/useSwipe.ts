import { useRef } from 'react';
import type { TouchEvent } from 'react';

/** Touch handlers for a sideways swipe: past 40px and more sideways than up/down
 *  (so the page still scrolls), left = next, right = previous. */
export function useSwipe(onNext: () => void, onPrev: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => { const t = e.touches[0]; start.current = { x: t.clientX, y: t.clientY }; },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if (dx < 0) onNext(); else onPrev();
    },
  };
}
