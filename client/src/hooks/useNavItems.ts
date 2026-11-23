import { useLocation } from 'react-router-dom';
import { useEntriesStore } from '../stores/entriesStore.js';
import { healthViews, isViewActive, FINANCE_VIEWS, KITCHEN_VIEWS, PLANNING_VIEWS, type SectionView } from '../utils/sectionViews.js';

export interface NavItem {
  key: string;
  label: string;
  /** Material Symbols glyph */
  icon: string;
  path: string;
  active: boolean;
  /** The section's views (its tabs), for the nav's drop-down; none = a page of its own */
  views?: { label: string; path: string; active: boolean }[];
}

/**
 * The app's main destinations, in nav order, with which one is current.
 * Shared by the desktop rail (Sidebar) and the phone drop-down menu
 * (MobileChrome) so the two never drift apart. Feature-flagged sections
 * (Health, Media, Finance) appear only when on. The dashboard has no item: the
 * logo (rail and phone bar) opens it.
 */
export function useNavItems(): NavItem[] {
  const { pathname } = useLocation();
  const ff = useEntriesStore(s => s.featureFlags);
  const at = (p: string) => pathname === p;
  const under = (p: string) => pathname.startsWith(p);
  const hasHealth = ff.medicationEnabled || ff.foodEnabled || ff.exerciseEnabled || ff.allergiesEnabled;

  const views = (list: SectionView[]) => list.map(v => ({ ...v, active: isViewActive(v.path, pathname) }));
  const items: (NavItem | false)[] = [
    { key: 'journal', label: 'Journal', icon: 'book', path: '/journal', active: at('/journal') },
    ff.entertainmentEnabled !== false && { key: 'media', label: 'Media', icon: 'play_lesson', path: '/media', active: at('/media') },
    { key: 'topics', label: 'Topics', icon: 'sell', path: '/topics', active: at('/topics') },
    !!hasHealth && { key: 'health', label: 'Health', icon: 'health_and_safety', path: '/health', active: under('/health'), views: views(healthViews(ff)) },
    (ff.goalsEnabled !== false || ff.milestonesEnabled !== false) && { key: 'planning', label: 'Planning', icon: 'target', path: '/goals/overview', active: under('/goals'), views: views(PLANNING_VIEWS) },
    { key: 'calendar', label: 'Calendar', icon: 'event', path: '/calendar', active: at('/calendar') },
    ff.kitchenEnabled !== false && { key: 'kitchen', label: 'Kitchen', icon: 'fork_spoon', path: '/kitchen', active: at('/kitchen') || under('/menu') || at('/shopping'), views: views(KITCHEN_VIEWS) },
    ff.financeEnabled === true && { key: 'finance', label: 'Finance', icon: 'attach_money', path: '/finance', active: under('/finance'), views: views(FINANCE_VIEWS) },
    { key: 'settings', label: 'Settings', icon: 'settings', path: '/settings', active: at('/settings') },
  ];
  return items.filter((i): i is NavItem => !!i);
}
