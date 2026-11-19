import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { create } from 'zustand';

/* Which nav section shows its views (the drop-down under Health, Planning, Kitchen, Finance),
   for the rail and the phone menu alike. One at a time: opening a section closes any other.
   Every section starts closed (on a load or a reload too — nothing is remembered), and going to
   a page closes them — except a section whose own row (its name, icon or anywhere on it) was just
   clicked, which opens as its page loads (`openWith` before the navigation).

   Kept in one app-wide store, never in the component: every page mounts its own rail and phone
   menu, so state held in the component started closed again on the page the click went to — the
   row "just navigated" and the drop-down never showed. The page change is handled once, by
   whichever copy sees the new address first (`lastPath`). */

const OLD_KEY = 'nav-sections-open-v1';

interface NavSectionsState {
  openKey: string | null;
  /** The section a row click just opened, and the page it's going to: kept open as that page loads */
  keep: { key: string; path: string } | null;
  /** The address the last page change was handled for */
  lastPath: string | null;
}

const useNavStore = create<NavSectionsState>(() => ({ openKey: null, keep: null, lastPath: null }));

/** Start closed again (tests; a fresh load already does) */
export function resetNavSections(): void {
  useNavStore.setState({ openKey: null, keep: null, lastPath: null });
}

export function useNavSections(): {
  isOpen: (key: string) => boolean;
  toggle: (key: string) => void;
  openWith: (key: string, path?: string) => void;
} {
  const openKey = useNavStore(s => s.openKey);
  const { pathname } = useLocation();

  // The open sections used to be remembered per browser: forget that (added 2026-11 — can go once
  // browsers have had time to load it)
  useEffect(() => { try { localStorage.removeItem(OLD_KEY); } catch { /* nothing kept */ } }, []);

  // Going to a page closes the menus (but not one its own row just opened, whose page this is)
  useEffect(() => {
    const { lastPath, keep, openKey: now } = useNavStore.getState();
    if (lastPath === pathname) return; // another copy (or this one) already handled this page
    if (lastPath === null) { useNavStore.setState({ lastPath: pathname }); return; } // first load
    const kept = keep && (pathname === keep.path || pathname.startsWith(`${keep.path}/`)) ? keep.key : null;
    useNavStore.setState({ lastPath: pathname, keep: null, openKey: now !== null && now === kept ? now : null });
  }, [pathname]);

  const isOpen = (key: string) => openKey === key;
  // The arrow: open or close this one (closing any other)
  const toggle = (key: string) => {
    useNavStore.setState(s => ({ keep: null, openKey: s.openKey === key ? null : key }));
  };
  // A section's own row: open it (closing any other) and keep it open as its page loads
  const openWith = (key: string, path?: string) => {
    useNavStore.setState({ openKey: key, keep: path !== undefined && path !== pathname ? { key, path } : null, lastPath: pathname });
  };
  return { isOpen, toggle, openWith };
}
