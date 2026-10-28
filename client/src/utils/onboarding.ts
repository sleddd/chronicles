/* Onboarding: a short welcome tour on a new account's first visit to the
   dashboard, then a "Getting started" checklist card the person ticks off.
   Progress is the encrypted `onboarding` setting. An account that already has
   entries when this first runs is marked done quietly — existing people only
   see the tour if they replay it from Settings. Pure. */

export interface OnboardingState {
  /** The tour was finished or skipped */
  tourDone?: boolean;
  /** The checklist card was closed (or finished) */
  checklistDismissed?: boolean;
  /** Items ticked (only ever by hand) */
  ticked?: ChecklistKey[];
}

/** What to do the first time onboarding is read: start the tour, mark an existing account done, or nothing */
export function firstRun(state: OnboardingState | null, entryCount: number): 'tour' | 'existing' | null {
  if (state !== null) return null;
  return entryCount > 0 ? 'existing' : 'tour';
}

export type ChecklistKey = 'name' | 'city' | 'entry' | 'health' | 'voice' | 'recovery';

export interface ChecklistItem {
  key: ChecklistKey;
  label: string;
  /** How to do it, in a line */
  how: string;
  done: boolean;
}

/** The checklist. Items are only ever ticked by hand — nothing is checked off
    for the person (an entry they already had, ticking another item…) */
export function gettingStarted(opts: {
  state: OnboardingState;
  /** Voice isn't offered where the browser can't do speech */
  voiceSupported: boolean;
}): ChecklistItem[] {
  const ticked = new Set(opts.state.ticked ?? []);
  const items: ChecklistItem[] = [];
  const add = (key: ChecklistKey, label: string, how: string) => items.push({ key, label, how, done: ticked.has(key) });
  add('name', 'Add your name', 'Settings → Account → Display name. It’s how the dashboard greets you.');
  add('city', 'Add your city for the weather and world clocks', 'Tap the sliders at the top right, then Customize view, and add a city.');
  add('entry', 'Write your first entry', 'Pick a topic in Quick entry, write your entry, then press Save entry.');
  add('health', 'Explore your Health dashboard', 'Health is where you set up medications and your exercise routine, log meals and symptoms, and see your reports.');
  if (opts.voiceSupported) add('voice', 'Try a voice command', 'Tap Voice and say “Add task water the plants”.');
  add('recovery', 'Keep your recovery key somewhere safe', 'It was shown when you signed up. Lost it? Make a new one in Settings → Security.');
  return items;
}

/** Tick or untick an item by hand */
export function toggleTicked(state: OnboardingState, key: ChecklistKey): ChecklistKey[] {
  const ticked = new Set(state.ticked ?? []);
  if (ticked.has(key)) ticked.delete(key); else ticked.add(key);
  return [...ticked];
}

/** The checklist shows once the tour is over, until it's closed (all ticked, it says so and waits to be closed) */
export function showChecklist(state: OnboardingState | null): boolean {
  return !!state && !!state.tourDone && !state.checklistDismissed;
}
