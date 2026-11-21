import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { NAV_COMPACT_QUERY } from '../../styles/breakpoints.js';

/* A page's main action (New entry, New topic, Log exercise…). On phones and
   tablets it moves into the mobile top bar, across from the logo (MobileChrome's
   slot); on desktop it stays where it's written, beside the page title.

   The action is drawn once, into a box of its own, and the BOX is what moves
   between the two places. Drawing it in one place or the other would make it a
   new component each time the screen crosses the breakpoint, and whatever it
   held — an open dialog, an AI answer being reviewed — would be thrown away. */

export const TOP_BAR_SLOT_ID = 'mobile-bar-actions';
/** Marks the action in place on desktop, so a wallpaper can turn its buttons to glass pills (GlobalStyle) */
const IN_PLACE_CLASS = 'page-action';

function makeBox(): HTMLElement {
  const box = document.createElement('span');
  box.style.display = 'contents';
  return box;
}

export function TopBarAction({ children }: { children: ReactNode }) {
  const compact = useMediaQuery(NAV_COMPACT_QUERY);
  const [box] = useState(makeBox);
  const place = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const slot = compact ? document.getElementById(TOP_BAR_SLOT_ID) : null;
    box.className = slot ? '' : IN_PLACE_CLASS;
    (slot ?? place.current)?.appendChild(box);
    return () => box.remove();
  }, [compact, box]);
  return <span ref={place} style={{ display: 'contents' }}>{createPortal(children, box)}</span>;
}
