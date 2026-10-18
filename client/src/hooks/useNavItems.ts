import { useLocation } from 'react-router-dom';
import { useEntriesStore } from '../stores/entriesStore.js';

export interface NavItem {
  key: string;
  label: string;
  /** Material Symbols glyph */
  icon: string;
  path: string;
  active: boolean;
}

/**
 * The app's main destinations, in nav order, with which one is current.
 * Shared by the desktop rail (Sidebar) and the phone drop-down menu
 * (MobileChrome) so the two never drift apart. Feature-flagged sections
 * (Health, Finance) appear only when on.
 */
export function useNavItems(): NavItem[] {
  const { pathname } = useLocation();
  const ff = useEntriesStore(s => s.featureFlags);
  const at = (p: string) => pathname === p;
  const under = (p: string) => pathname.startsWith(p);
  const hasHealth = ff.medicationEnabled || ff.foodEnabled || ff.exerciseEnabled || ff.allergiesEnabled;

  const items: (NavItem | false)[] = [
    { key: 'journal', label: 'Journal', icon: 'book', path: '/journal', active: at('/journal') },
    { key: 'topics', label: 'Topics', icon: 'sell', path: '/topics', active: at('/topics') },
    !!hasHealth && { key: 'health', label: 'Health', icon: 'health_cross', path: '/health', active: under('/health') },
    { key: 'planning', label: 'Planning', icon: 'target', path: '/goals', active: under('/goals') },
    { key: 'calendar', label: 'Calendar', icon: 'event', path: '/calendar', active: at('/calendar') },
    ff.financeEnabled === true && { key: 'finance', label: 'Finance', icon: 'attach_money', path: '/finance', active: under('/finance') },
    { key: 'kitchen', label: 'Kitchen', icon: 'fork_spoon', path: '/kitchen', active: at('/kitchen') || under('/menu') || at('/shopping') },
    { key: 'settings', label: 'Settings', icon: 'settings', path: '/settings', active: at('/settings') },
  ];
  return items.filter((i): i is NavItem => !!i);
}
