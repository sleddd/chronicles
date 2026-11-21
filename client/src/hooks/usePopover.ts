import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

interface PopoverOptions {
  open: boolean;
  onClose: () => void;
  /** The button that opens it (focus goes back here) */
  triggerRef: RefObject<HTMLElement | null>;
  /** The floating panel (often portalled to <body>) */
  panelRef: RefObject<HTMLElement | null>;
  /** Move focus into the panel when it opens (default true) */
  focusOnOpen?: boolean;
  /** True while something over the panel (a dialog it opened) owns the keyboard */
  ignore?: () => boolean;
}

/**
 * Keyboard reach for a floating panel opened by a button: on open the first
 * focusable thing in the panel takes focus, Escape closes it and puts focus
 * back on the button, and focus moving somewhere outside both closes it. When it
 * closes while focus was in the panel, focus goes back to the button too (the
 * panel is about to leave the page and would drop focus on <body>).
 * Mouse behaviour (outside clicks and so on) stays with the component.
 */
export function usePopover({ open, onClose, triggerRef, panelRef, focusOnOpen = true, ignore }: PopoverOptions) {
  // Read through a ref: callers pass a fresh onClose each render
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const ignoreRef = useRef(ignore);
  ignoreRef.current = ignore;
  const focusInPanel = useRef(false);

  useEffect(() => {
    if (!open) return;
    focusInPanel.current = false;

    // The panel may render a frame later (portals, measured placement)
    let raf = 0;
    let tries = 0;
    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) {
        if (tries++ < 5) raf = requestAnimationFrame(focusFirst);
        return;
      }
      if (panel.contains(document.activeElement)) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus({ preventScroll: true });
    };
    const inside = (n: Node | null) =>
      !!n && (!!panelRef.current?.contains(n) || !!triggerRef.current?.contains(n));

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || ignoreRef.current?.()) return;
      e.preventDefault();
      focusInPanel.current = false;
      onCloseRef.current();
      triggerRef.current?.focus();
    };
    const onFocusIn = (e: FocusEvent) => {
      if (ignoreRef.current?.()) return;
      const t = e.target as Node | null;
      if (t && panelRef.current?.contains(t)) { focusInPanel.current = true; return; }
      if (t && triggerRef.current?.contains(t)) { focusInPanel.current = false; return; }
      // Focus went somewhere else on the page: close, and leave focus there
      if (t && t !== document.body && !inside(t)) {
        focusInPanel.current = false;
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocusIn);
    // After the listeners, so the first focus counts as being in the panel
    if (focusOnOpen) focusFirst();
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
      // Closed with focus still in the panel (a choice made, a × pressed): back to the button
      const active = document.activeElement;
      if (focusInPanel.current && (!active || active === document.body || panelRef.current?.contains(active))) {
        triggerRef.current?.focus({ preventScroll: true });
      }
      focusInPanel.current = false;
    };
  }, [open, focusOnOpen, panelRef, triggerRef]);
}
