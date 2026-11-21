/*
 * The browser tab's title for a page ("Health · Chronicles"), so each page can
 * be told apart in tabs, history and by screen readers (WCAG 2.4.2). The home
 * page keeps the SEO title from index.html. Pure.
 */

/** Longest prefix first: the first that matches names the page */
const PAGES: [string, string][] = [
  ['/health/food', 'Meals'],
  ['/health/exercise', 'Exercise'],
  ['/health/habits', 'Habits'],
  ['/health/symptoms', 'Symptoms'],
  ['/health/meds', 'Med list'],
  ['/health/med-history', 'Med history'],
  ['/health/allergies', 'Allergies'],
  ['/health/reports', 'Health reports'],
  ['/health', 'Health'],
  ['/goals/overview', 'Vision'],
  ['/goals/milestones', 'Milestones'],
  ['/goals/roadmap', 'Roadmap'],
  ['/goals/planner', 'Planner'],
  ['/goals/tasks', 'Tasks'],
  ['/goals/todos', 'Todos'],
  ['/goals/filter', 'Planning filters'],
  ['/goals', 'Goals'],
  ['/menu/recipes', 'Recipes'],
  ['/menu', 'Menu'],
  ['/shopping', 'Shopping lists'],
  ['/kitchen', 'Kitchen'],
  ['/finance/goals', 'Finance goals'],
  ['/finance/savings', 'Savings'],
  ['/finance/debts', 'Debts'],
  ['/finance/reports', 'Finance reports'],
  ['/finance', 'Budget & bills'],
  ['/dashboard', 'Today'],
  ['/journal', 'Journal'],
  ['/topics', 'Topics'],
  ['/calendar', 'Calendar'],
  ['/media', 'Media'],
  ['/settings', 'Settings'],
  ['/inspiration/research', 'Research'],
  ['/inspiration/quotes', 'Quotes'],
  ['/login', 'Sign in'],
  ['/sign-up', 'Create your account'],
  ['/recover', 'Recover your account'],
  ['/health-privacy', 'Health data privacy'],
  ['/terms', 'Terms of service'],
  ['/license', 'License'],
  ['/report-a-bug', 'Feedback and bug reports'],
  ['/public-shelf', 'Public shelf'],
];

/** The tab title for a path, or null for the home page (it keeps index.html's) */
export function pageTitleFor(pathname: string): string | null {
  if (pathname === '/' || pathname === '') return null;
  const hit = PAGES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return hit ? `${hit[1]} · Chronicles` : 'Chronicles';
}
