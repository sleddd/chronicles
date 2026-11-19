import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/* Which nav section shows its views (the drop-down under Health, Planning, Kitchen, Finance),
   for the rail and the phone menu alike. One at a time: opening a section closes any other.
   Every section starts closed (on a load or a reload too — nothing is remembered), and going to
   a page closes them — except a section whose own row was just clicked, which opens as its page
   loads (`openWith` before the navigation). */

const OLD_KEY = 'nav-sections-open-v1';

export function useNavSections(): {
  isOpen: (key: string) => boolean;
  toggle: (key: string) => void;
  openWith: (key: string, path?: string) => void;
} {
  const [openKey, setOpenKey] = useState<string | null>(null);
  // The section a click just opened, kept open through the page change that click starts
  const keep = useRef<string | null>(null);
  const { pathname } = useLocation();

  // The open sections used to be remembered per browser: forget that (added 2026-11 — can go once
  // browsers have had time to load it)
  useEffect(() => { try { localStorage.removeItem(OLD_KEY); } catch { /* nothing kept */ } }, []);

  // Going to a page closes the menus (but not one its own row just opened)
  useEffect(() => {
    const kept = keep.current;
    keep.current = null;
    setOpenKey(prev => (prev !== null && prev === kept ? prev : null));
  }, [pathname]);

  const isOpen = (key: string) => openKey === key;
  // The arrow: open or close this one (closing any other)
  const toggle = (key: string) => { keep.current = null; setOpenKey(prev => (prev === key ? null : key)); };
  // A section's own row: open it (closing any other) and keep it open as its page loads — only when
  // that's a different page, or the hold would outlast the click and keep it open past a later page
  const openWith = (key: string, path?: string) => { keep.current = path !== undefined && path !== pathname ? key : null; setOpenKey(key); };
  return { isOpen, toggle, openWith };
}
