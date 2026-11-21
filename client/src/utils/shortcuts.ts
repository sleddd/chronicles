/* The dashboard's Shortcuts card: which pages can be pinned and what a saved list still
   points at. Pure. A shortcut is saved as its path only, so a renamed view or topic keeps
   its chip; one whose page is gone (a feature switched off, a topic deleted) is hidden,
   never dropped from the saved list — switch the feature back on and it returns. */

export interface Shortcut { path: string; label: string; icon: string; group: string }

interface NavLike { label: string; icon: string; path: string; views?: { label: string; path: string }[] }

/** Views under a section's view (its own sub tabs), offered after that view */
const SUB_VIEWS: Record<string, { label: string; path: string }[]> = {
  '/health/exercise': [
    { label: 'Schedule', path: '/health/exercise/schedule' },
    { label: 'Training', path: '/health/exercise/training' },
    { label: 'History', path: '/health/exercise/history' },
  ],
  '/goals/tasks': [{ label: 'Todos', path: '/goals/todos' }],
};

/** Pages with no nav item of their own */
const EXTRA_PAGES: Shortcut[] = [
  { path: '/inspiration/research', label: 'Research', icon: 'lightbulb', group: 'Inspiration' },
  { path: '/inspiration/quotes', label: 'Quotes', icon: 'lightbulb', group: 'Inspiration' },
];

/** Most chips a card keeps */
export const MAX_SHORTCUTS = 24;

/** Every page that can be pinned: the nav's items and their views, then each topic's page */
export function shortcutCatalog(nav: NavLike[], topics: { id: number; name: string }[]): Shortcut[] {
  const out: Shortcut[] = [];
  const seen = new Set<string>();
  const add = (s: Shortcut) => { if (!seen.has(s.path)) { seen.add(s.path); out.push(s); } };
  add({ path: '/dashboard', label: 'Dashboard', icon: 'home', group: 'Pages' });
  for (const item of nav) {
    // A section with views is offered view by view, in its own group (its page is one of them)
    if (!item.views?.length) add({ path: item.path, label: item.label, icon: item.icon, group: 'Pages' });
    // Each view and sub view is named on its own ("Training", not "Health · Exercise · Training"):
    // the picker groups them under their section, and the chip carries the section's icon
    for (const v of item.views ?? []) {
      add({ path: v.path, label: v.label, icon: item.icon, group: item.label });
      for (const sub of SUB_VIEWS[v.path] ?? []) {
        add({ path: sub.path, label: sub.label, icon: item.icon, group: item.label });
      }
    }
  }
  EXTRA_PAGES.forEach(add);
  for (const t of [...topics].sort((a, b) => a.name.localeCompare(b.name))) {
    add({ path: `/topics/${t.id}`, label: t.name, icon: 'sell', group: 'Topics' });
  }
  return out;
}

/**
 * The name each pinned chip shows. Views are named on their own ("Training"), so two pinned
 * pages can share a name ("Reports" in Health and in Finance): those get their section in front.
 */
export function chipLabels(pinned: Shortcut[]): Map<string, string> {
  const uses = new Map<string, number>();
  for (const s of pinned) uses.set(s.label, (uses.get(s.label) ?? 0) + 1);
  const inSection = (s: Shortcut) => s.group !== 'Pages' && s.group !== 'Topics';
  return new Map(pinned.map(s => [s.path, (uses.get(s.label) ?? 0) > 1 && inSection(s) ? `${s.group} · ${s.label}` : s.label]));
}

/** The saved list as stored: paths only, each once, in order, at most MAX_SHORTCUTS */
export function cleanShortcuts(saved: unknown): string[] {
  if (!Array.isArray(saved)) return [];
  const out: string[] = [];
  for (const p of saved) {
    if (typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && p.length <= 200 && !out.includes(p)) out.push(p);
    if (out.length >= MAX_SHORTCUTS) break;
  }
  return out;
}

/** The chips to show: the saved paths that still have a page, in the saved order */
export function shownShortcuts(saved: unknown, catalog: Shortcut[]): Shortcut[] {
  const byPath = new Map(catalog.map(s => [s.path, s]));
  return cleanShortcuts(saved).map(p => byPath.get(p)).filter((s): s is Shortcut => !!s);
}

/** What can still be added, grouped as in the nav */
export function addableShortcuts(saved: unknown, catalog: Shortcut[]): { group: string; items: Shortcut[] }[] {
  const taken = new Set(cleanShortcuts(saved));
  const groups: { group: string; items: Shortcut[] }[] = [];
  for (const s of catalog) {
    if (taken.has(s.path)) continue;
    let g = groups.find(x => x.group === s.group);
    if (!g) { g = { group: s.group, items: [] }; groups.push(g); }
    g.items.push(s);
  }
  return groups;
}
