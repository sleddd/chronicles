import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { NAV_COMPACT_QUERY } from '../../styles/breakpoints.js';

/* A page's main action (New entry, New topic, Log exercise…). On phones and
   tablets it moves into the mobile top bar, across from the logo (MobileChrome's
   slot); on desktop it stays where it's written, beside the page title. */

export const TOP_BAR_SLOT_ID = 'mobile-bar-actions';

export function TopBarAction({ children }: { children: ReactNode }) {
  const compact = useMediaQuery(NAV_COMPACT_QUERY);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setSlot(compact ? document.getElementById(TOP_BAR_SLOT_ID) : null); }, [compact]);
  return slot ? createPortal(children, slot) : <>{children}</>;
}
