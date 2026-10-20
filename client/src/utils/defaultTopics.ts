/* The default topics every account has. The browser seeds any that are
   missing (encrypted — the server can't, since topic names are sealed).
   Singular/plural tolerant: a user's "Recipes" counts as "Recipe". */

export const DEFAULT_TOPICS: { name: string; icon: string; color: string }[] = [
  { name: 'Task', icon: 'circle-check', color: '#3B82F6' },
  { name: 'Goal', icon: 'bullseye', color: '#8B5CF6' },
  { name: 'Milestone', icon: 'flag', color: '#6366F1' },
  { name: 'Idea', icon: 'lightbulb', color: '#F59E0B' },
  { name: 'Research', icon: 'magnifying-glass', color: '#10B981' },
  { name: 'Event', icon: 'calendar', color: '#F59E0B' },
  { name: 'Meeting', icon: 'users', color: '#EC4899' },
  { name: 'Meals', icon: 'utensils', color: '#F97316' },
  { name: 'Exercise', icon: 'dumbbell', color: '#EF4444' },
  { name: 'Medication', icon: 'pills', color: '#14B8A6' },
  { name: 'Symptom', icon: 'flask', color: '#EF4444' },
  { name: 'Music', icon: 'music', color: '#EC4899' },
  { name: 'Books', icon: 'book', color: '#8B5CF6' },
  { name: 'TV/Movies', icon: 'film', color: '#F59E0B' },
  { name: 'Quote', icon: 'quote-left', color: '#6366F1' },
  { name: 'Allergy', icon: 'triangle-exclamation', color: '#F97316' },
  { name: 'Shopping List', icon: 'cart-shopping', color: '#22C55E' },
  { name: 'Recipe', icon: 'bowl-food', color: '#F97316' },
  { name: 'Menu Plan', icon: 'calendar-week', color: '#8B5CF6' },
  { name: 'Changes', icon: 'clock', color: '#64748B' },
];

const norm = (n: string) => n.trim().toLowerCase().replace(/s$/, '');

/** The default topics not yet present (by name, case- and plural-insensitive). */
export function missingDefaultTopics(existing: { name: string }[]) {
  const have = new Set(existing.map(t => norm(t.name)));
  return DEFAULT_TOPICS.filter(t => !have.has(norm(t.name)));
}
