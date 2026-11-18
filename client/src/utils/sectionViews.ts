/* Each section's views (the tabs under its title), in one place: the section tab bars and
   the nav (the rail's and the phone menu's drop-downs) read the same lists, so they never
   drift apart. Pure. */

export interface SectionView { label: string; path: string }

type Flags = Record<string, boolean | undefined>;

/** Health's views; the feature-switched ones only while their feature is on */
export function healthViews(ff: Flags): SectionView[] {
  const views: SectionView[] = [{ label: 'Dashboard', path: '/health' }];
  if (ff.foodEnabled !== false) views.push({ label: 'Meals', path: '/health/food' });
  if (ff.exerciseEnabled !== false) views.push({ label: 'Exercise', path: '/health/exercise' });
  views.push({ label: 'Habits', path: '/health/habits' }, { label: 'Symptoms', path: '/health/symptoms' });
  if (ff.medicationEnabled !== false) views.push({ label: 'Med list', path: '/health/meds' }, { label: 'Med history', path: '/health/med-history' });
  if (ff.allergiesEnabled !== false) views.push({ label: 'Allergies', path: '/health/allergies' });
  views.push({ label: 'Reports', path: '/health/reporting' });
  return views;
}

export const PLANNING_VIEWS: SectionView[] = [
  { label: 'Vision', path: '/goals/overview' },
  { label: 'Goals', path: '/goals' },
  { label: 'Milestones', path: '/goals/milestones' },
  { label: 'Roadmap', path: '/goals/roadmap' },
  { label: 'Tasks', path: '/goals/tasks' },
  { label: 'Planner', path: '/goals/planner' },
];

export const KITCHEN_VIEWS: SectionView[] = [
  { label: 'Dashboard', path: '/kitchen' },
  { label: 'Menu', path: '/menu' },
  { label: 'Recipes', path: '/menu/recipes' },
  { label: 'Shopping lists', path: '/shopping' },
];

export const FINANCE_VIEWS: SectionView[] = [
  { label: 'Budget & bills', path: '/finance' },
  { label: 'Goals', path: '/finance/goals' },
  { label: 'Savings', path: '/finance/savings' },
  { label: 'Debts', path: '/finance/debts' },
  { label: 'Reports', path: '/finance/reports' },
];

/** Is this view the one showing? (The same rule the tab bars use.) */
export function isViewActive(path: string, pathname: string): boolean {
  if (pathname === path) return true;
  // Pages under a view: Exercise's sub tabs, a medication's pages
  if ((path === '/health/meds' || path === '/health/exercise') && pathname.startsWith(`${path}/`)) return true;
  // Planning: Todos is a view of Tasks; a view's own sub-pages count (never /goals itself)
  if (path.startsWith('/goals/') && pathname.startsWith(path)) return true;
  if (path === '/goals/tasks' && pathname.startsWith('/goals/todos')) return true;
  return false;
}
