import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, TouchEvent as ReactTouchEvent } from 'react';

/* Paging a sideways view by gesture instead of its ‹ › buttons (the Planner):
   - mouse: drag empty space — it scrolls the view first when it's wider than the
     screen, then the board follows the pointer past the edge, and letting go far
     enough pages (right = previous, left = next)
   - touch: a sideways swipe pages once the view is already scrolled to that edge,
     so a wide week still scrolls natively first
   - trackpad / sideways wheel: the same, once the view can't scroll further
   `busy()` says a card is being dragged (or was a moment ago), so a card drag
   never pages. Presses on buttons, fields, links and cards are left alone.
   `boardRef` is the board inside the scroller: the hook moves it sideways itself
   while it is pulled past the edge (no re-render per pixel). */

const INTERACTIVE = 'button, a, input, textarea, select, label, [role="button"], [contenteditable="true"]';
/** How far past the edge (px) a drag or swipe has to go to page */
const PAGE_AT = 70;
/** Sideways wheel travel (px) past the edge that pages */
const WHEEL_AT = 120;

/** The board has glided back: take our transition off it. Cards inside have transitions of their
 *  own, and their `transitionend` bubbles up here — only the board's own transform counts */
function clearGlide(e: TransitionEvent) {
  const board = e.currentTarget as HTMLElement;
  if (e.target !== board || e.propertyName !== 'transform') return;
  board.style.transition = '';
  board.removeEventListener('transitionend', clearGlide);
}

export function usePagePan(boardRef: RefObject<HTMLElement | null>, onPrev: () => void, onNext: () => void, busy: () => boolean = () => false) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  /** A mouse is dragging the board sideways (for the cursor) — set once at the start, not every pixel */
  const [panning, setPanning] = useState(false);
  /** Bumps on each page, with the side the new days come in from (for the slide-in) */
  const [entered, setEntered] = useState<{ from: 'left' | 'right'; n: number } | null>(null);
  const drag = useRef<{ x: number; y: number; scroll: number; moved: boolean; id: number } | null>(null);
  /** How far the board is pulled past the edge while a mouse drags it */
  const pullRef = useRef(0);
  const swallowClick = useRef(false);
  const touch = useRef<{ x: number; y: number; atStart: boolean; atEnd: boolean } | null>(null);
  const handlers = useRef({ onPrev, onNext, busy });
  handlers.current = { onPrev, onNext, busy };

  const elRef = useRef<HTMLDivElement | null>(null);
  elRef.current = el;
  const pullFrame = useRef(0);
  /** The board inside the scroller, pulled sideways (`ease`: glide back into place) */
  const drawPull = useCallback((x: number, ease = false) => {
    const board = boardRef.current;
    if (!board) return;
    // Gliding back only when it was pulled: with nothing to animate, no transition would end
    const glide = ease && !x && board.style.transform !== '';
    board.style.transition = glide ? 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)' : x ? 'none' : '';
    board.style.transform = x ? `translateX(${x}px)` : '';
    // Nothing of ours stays on the board once it's back in place (the same listener each time, so
    // it is only ever added once)
    if (glide) board.addEventListener('transitionend', clearGlide);
  }, [boardRef]);
  useEffect(() => () => cancelAnimationFrame(pullFrame.current), []);
  const page = useCallback((dir: 'prev' | 'next') => {
    if (dir === 'next') handlers.current.onNext(); else handlers.current.onPrev();
    setEntered(e => ({ from: dir === 'next' ? 'right' : 'left', n: (e?.n ?? 0) + 1 }));
    // A wide view starts the new days from the side they came in on
    requestAnimationFrame(() => {
      const node = elRef.current;
      if (node) node.scrollLeft = dir === 'next' ? 0 : node.scrollWidth;
    });
  }, []);

  const edges = (node: HTMLDivElement) => {
    const max = node.scrollWidth - node.clientWidth;
    return { max, atStart: node.scrollLeft <= 1, atEnd: node.scrollLeft >= max - 1 };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !el) return;
    if ((e.target as Element).closest(INTERACTIVE)) return;
    drag.current = { x: e.clientX, y: e.clientY, scroll: el.scrollLeft, moved: false, id: e.pointerId };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id || !el) return;
    // Let go somewhere this never heard about (outside the board, before the pan began): not a drag any more
    if (e.buttons === 0) { drag.current = null; return; }
    if (handlers.current.busy()) { drag.current = null; return; }
    const dx = e.clientX - d.x;
    if (!d.moved) {
      if (Math.abs(dx) < 6) return;
      // Mostly up and down: not ours
      if (Math.abs(e.clientY - d.y) > Math.abs(dx)) { drag.current = null; return; }
      d.moved = true;
      setPanning(true);
      el.setPointerCapture(e.pointerId);
      window.getSelection()?.removeAllRanges();
    }
    const { max } = edges(el);
    const want = d.scroll - dx;
    const scroll = Math.min(max, Math.max(0, want));
    el.scrollLeft = scroll;
    // Past the edge the board follows at half speed (positive = pulled right)
    pullRef.current = (scroll - want) * 0.5;
    // Moved straight on the board, once a frame: re-rendering the whole planner on every pixel
    // (as before) was what made it choppy
    if (!pullFrame.current) pullFrame.current = requestAnimationFrame(() => { pullFrame.current = 0; drawPull(pullRef.current); });
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (!d.moved) return;
    swallowClick.current = true;
    setTimeout(() => { swallowClick.current = false; }, 0);
    const p = pullRef.current;
    pullRef.current = 0;
    setPanning(false);
    if (pullFrame.current) { cancelAnimationFrame(pullFrame.current); pullFrame.current = 0; }
    // Back into place with a short glide (when it pages, the new days slide in as before)
    drawPull(0, true);
    if (p > PAGE_AT / 2) page('prev');
    else if (p < -PAGE_AT / 2) page('next');
  };

  // A drag ends with a click on whatever it started over — not a choice
  const onClickCapture = (e: ReactMouseEvent) => {
    if (swallowClick.current) { e.stopPropagation(); e.preventDefault(); swallowClick.current = false; }
  };

  const onTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!el || e.touches.length !== 1) { touch.current = null; return; }
    const t = e.touches[0];
    const { atStart, atEnd } = edges(el);
    touch.current = { x: t.clientX, y: t.clientY, atStart, atEnd };
  };

  const onTouchEnd = (e: ReactTouchEvent<HTMLDivElement>) => {
    const s = touch.current;
    touch.current = null;
    if (!s || handlers.current.busy()) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < PAGE_AT || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx < 0 && s.atEnd) page('next');
    else if (dx > 0 && s.atStart) page('prev');
  };

  // Trackpads and sideways wheels: page once the view can't scroll that way
  useEffect(() => {
    if (!el) return;
    let travel = 0;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let quietUntil = 0;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || handlers.current.busy()) return;
      const { atStart, atEnd } = edges(el);
      if ((e.deltaX > 0 && !atEnd) || (e.deltaX < 0 && !atStart)) { travel = 0; return; }
      e.preventDefault(); // no browser back / forward swipe while paging
      if (Date.now() < quietUntil) return; // a trackpad's glide after a page
      travel += e.deltaX;
      clearTimeout(idle);
      idle = setTimeout(() => { travel = 0; }, 250);
      if (Math.abs(travel) >= WHEEL_AT) {
        page(travel > 0 ? 'next' : 'prev');
        travel = 0;
        quietUntil = Date.now() + 600;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => { el.removeEventListener('wheel', onWheel); clearTimeout(idle); };
  }, [el, page]);

  return {
    ref: setEl,
    el,
    /** Page by hand (a card held at the edge) — with the same slide-in */
    page,
    entered,
    panning,
    bind: {
      onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag,
      onClickCapture, onTouchStart, onTouchEnd,
    },
  };
}
