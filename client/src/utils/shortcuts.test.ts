import { describe, expect, it } from 'vitest';
import { addableShortcuts, cleanShortcuts, MAX_SHORTCUTS, shortcutCatalog, shownShortcuts } from './shortcuts.js';

const nav = [
  { label: 'Journal', icon: 'book', path: '/journal' },
  { label: 'Health', icon: 'health_and_safety', path: '/health', views: [{ label: 'Dashboard', path: '/health' }, { label: 'Habits', path: '/health/habits' }] },
];
const topics = [{ id: 7, name: 'Recipes' }, { id: 3, name: 'Books' }];

describe('shortcutCatalog', () => {
  it('lists the nav, its views and each topic, every path once', () => {
    const c = shortcutCatalog(nav, topics);
    expect(c.map(s => s.path)).toEqual(['/dashboard', '/journal', '/health', '/health/habits', '/topics/3', '/topics/7']);
    expect(c.find(s => s.path === '/health/habits')).toMatchObject({ label: 'Health · Habits', group: 'Health', icon: 'health_and_safety' });
    expect(c.find(s => s.path === '/topics/3')).toMatchObject({ label: 'Books', group: 'Topics' });
  });
});

describe('saved shortcuts', () => {
  const catalog = shortcutCatalog(nav, topics);

  it('keeps only same-site paths, each once, up to the cap', () => {
    expect(cleanShortcuts(['/journal', '/journal', 'https://evil.example', '//evil.example', 5, '/x'])).toEqual(['/journal', '/x']);
    expect(cleanShortcuts('nope')).toEqual([]);
    expect(cleanShortcuts(Array.from({ length: 40 }, (_, i) => `/p${i}`))).toHaveLength(MAX_SHORTCUTS);
  });

  it('shows saved ones that still have a page, in order', () => {
    expect(shownShortcuts(['/topics/7', '/finance', '/journal'], catalog).map(s => s.label)).toEqual(['Recipes', 'Journal']);
  });

  it('offers what is not yet pinned, grouped', () => {
    const groups = addableShortcuts(['/journal', '/health/habits'], catalog);
    expect(groups.map(g => g.group)).toEqual(['Pages', 'Topics']);
    expect(groups.flatMap(g => g.items).some(s => s.path === '/journal')).toBe(false);
  });
});
