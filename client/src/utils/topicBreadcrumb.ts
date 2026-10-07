/**
 * Breadcrumb trail for the entry editor: view / subview (if applicable),
 * derived statically from the entry's topic — navigation history is not
 * tracked, so each topic maps to its natural home. The topic itself renders
 * as the last crumb (an inline topic picker), so trails avoid repeating it.
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
