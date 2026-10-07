/**
 * Breadcrumb trail for the entry editor: view / subview (if applicable).
 * When an entry was opened from another view, the trail is that view (passed
 * as router state `from`), so the breadcrumb always leads back to where you
 * were. Otherwise it falls back to the topic's natural home. The topic itself
 * renders as the last crumb (an inline topic picker), so trails avoid
 * repeating it.
 */

export interface TrailCrumb {
  label: string;
  /** Route to navigate to; null renders a non-clickable crumb. */
  path: string | null;
}

const JOURNAL_CRUMB: TrailCrumb = { label: 'Journal', path: '/journal' };
const PLANNING_TRAIL: TrailCrumb[] = [{ label: 'Planning', path: '/goals' }];
const HEALTH_TRAIL: TrailCrumb[] = [{ label: 'Health', path: '/health' }];
const MEALS_TRAIL: TrailCrumb[] = [{ label: 'From the Kitchen', path: '/kitchen' }];
const CALENDAR_TRAIL: TrailCrumb[] = [{ label: 'Calendar', path: '/calendar' }];

const TRAILS: Record<string, TrailCrumb[]> = {
  task: PLANNING_TRAIL,
  goal: PLANNING_TRAIL,
  milestone: PLANNING_TRAIL,
  priorities: PLANNING_TRAIL,

  medication: HEALTH_TRAIL,
  symptom: HEALTH_TRAIL,
  exercise: HEALTH_TRAIL,
  allergy: HEALTH_TRAIL,
  wellness: HEALTH_TRAIL,
  meals: [...HEALTH_TRAIL, { label: 'Meals', path: '/health/food' }],

  recipe: MEALS_TRAIL,
  recipes: MEALS_TRAIL,
  'shopping list': MEALS_TRAIL,
  'menu plan': MEALS_TRAIL,

  event: CALENDAR_TRAIL,
  meeting: CALENDAR_TRAIL,

  music: [{ label: 'Entertainment', path: '/entertainment/music' }],
  books: [{ label: 'Entertainment', path: '/entertainment/books' }],
  'tv/movies': [{ label: 'Entertainment', path: '/entertainment/tv' }],

  research: [{ label: 'Inspiration', path: '/inspiration/research' }],
  quote: [{ label: 'Inspiration', path: '/inspiration/quotes' }],
  idea: [{ label: 'Inspiration', path: null }],
};

/** Ancestor crumbs for a topic — always rooted at Journal, then the topic's
 *  home view/subview (e.g. Meals → Journal / Health / Meals). */
export function getTopicTrail(topicName?: string | null): TrailCrumb[] {
  const key = (topicName ?? '').toLowerCase();
  return [JOURNAL_CRUMB, ...(TRAILS[key] ?? [])];
}

/* ── Origin views ── */

const HEALTH = { label: 'Health', path: '/health' };
const KITCHEN = { label: 'From the Kitchen', path: '/kitchen' };
const PLANNING = { label: 'Planning', path: '/goals' };

/** Exact routes → their crumbs (parent first). */
const VIEW_TRAILS: Record<string, TrailCrumb[]> = {
  '/': [{ label: 'Home', path: '/' }],
  '/calendar': [{ label: 'Calendar', path: '/calendar' }],
  '/topics': [{ label: 'Topics', path: '/topics' }],
  '/health': [HEALTH],
  '/health/schedule': [HEALTH, { label: 'Meds', path: '/health/schedule' }],
  '/health/food': [HEALTH, { label: 'Meals', path: '/health/food' }],
  '/health/exercise': [HEALTH, { label: 'Exercise', path: '/health/exercise' }],
  '/health/symptoms': [HEALTH, { label: 'Symptoms', path: '/health/symptoms' }],
  '/health/meds': [HEALTH, { label: 'Med List', path: '/health/meds' }],
  '/health/allergies': [HEALTH, { label: 'Allergies', path: '/health/allergies' }],
  '/health/reporting': [HEALTH, { label: 'Reports', path: '/health/reporting' }],
  '/kitchen': [KITCHEN],
  '/menu': [KITCHEN, { label: 'Menu', path: '/menu' }],
  '/menu/recipes': [KITCHEN, { label: 'Recipes', path: '/menu/recipes' }],
  '/shopping': [KITCHEN, { label: 'Shopping Lists', path: '/shopping' }],
  '/goals': [PLANNING],
  '/goals/milestones': [PLANNING, { label: 'Milestones', path: '/goals/milestones' }],
  '/goals/tasks': [PLANNING, { label: 'Tasks', path: '/goals/tasks' }],
  '/goals/todos': [PLANNING, { label: 'Todos', path: '/goals/todos' }],
  '/goals/filter': [PLANNING, { label: 'Filters', path: '/goals/filter' }],
  '/entertainment/music': [{ label: 'Entertainment', path: '/entertainment/music' }, { label: 'Music', path: '/entertainment/music' }],
  '/entertainment/books': [{ label: 'Entertainment', path: '/entertainment/music' }, { label: 'Books', path: '/entertainment/books' }],
  '/entertainment/tv': [{ label: 'Entertainment', path: '/entertainment/music' }, { label: 'TV/Movies', path: '/entertainment/tv' }],
  '/inspiration/research': [{ label: 'Inspiration', path: '/inspiration/research' }, { label: 'Research', path: '/inspiration/research' }],
  '/inspiration/quotes': [{ label: 'Inspiration', path: '/inspiration/research' }, { label: 'Quotes', path: '/inspiration/quotes' }],
};

/**
 * Crumbs for the view an entry was opened from, or null when it isn't a known
 * view. `from` is a path (optionally with ?query) — query strings are kept on
 * the last crumb so filters survive the round trip.
 */
export function viewTrailFor(from: string | null | undefined): TrailCrumb[] | null {
  if (!from || typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return null;
  const [path, query = ''] = from.split('?');
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  if (clean === '/journal') return null;
  let trail = VIEW_TRAILS[clean];
  if (!trail && /^\/topics\/\d+$/.test(clean)) trail = [{ label: 'Topics', path: '/topics' }, { label: 'Topic', path: clean }];
  if (!trail) return null;
  if (!query) return trail;
  const last = trail[trail.length - 1];
  return [...trail.slice(0, -1), { ...last, path: `${last.path}?${query}` }];
}

/** The editor's ancestor crumbs: Journal, then the origin view if known, else the topic's home. */
export function getEntryTrail(topicName: string | null | undefined, from?: string | null): TrailCrumb[] {
  const origin = viewTrailFor(from);
  return origin ? [JOURNAL_CRUMB, ...origin] : getTopicTrail(topicName);
}

/** Router state to pass when opening the journal from a view, so the breadcrumb can lead back. */
export function journalOriginState(pathname: string, search = ''): { from: string } | undefined {
  if (pathname.startsWith('/journal')) return undefined;
  return { from: `${pathname}${search}` };
}
