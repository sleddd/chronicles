/* The dashboard's Shortcuts card: which pages can be pinned and what a saved list still
   points at. Pure. A shortcut is saved as its path only, so a renamed view or topic keeps
   its chip; one whose page is gone (a feature switched off, a topic deleted) is hidden,
   never dropped from the saved list — switch the feature back on and it returns. */

export interface Shortcut { path: string; label: string; icon: string; group: string }

interface NavLike { label: string; icon: string; path: string; views?: { label: string; path: string }[] }

/** Most chips a card keeps */
export const MAX_SHORTCUTS = 24;

/** Every page that can be pinned: the nav's items and their views, then each topic's page */
export function shortcutCatalog(nav: NavLike[], topics: { id: number; name: string }[]): Shortcut[] {
  const out: Shortcut[] = [];
  const seen = new Set<string>();
  const add = (s: Shortcut) => { if (!seen.has(s.path)) { seen.add(s.path); out.push(s); } };
  add({ path: '/dashboard', label: 'Dashboard', icon: 'home', group: 'Pages' });
  for (const item of nav) {
    add({ path: item.path, label: item.label, icon: item.icon, group: 'Pages' });
    for (const v of item.views ?? []) {
      add({ path: v.path, label: v.label === item.label ? v.label : `${item.label} · ${v.label}`, icon: item.icon, group: item.label });
    }
  }
  for (const t of [...topics].sort((a, b) => a.name.localeCompare(b.name))) {
    add({ path: `/topics/${t.id}`, label: t.name, icon: 'sell', group: 'Topics' });
  }
  return out;
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
