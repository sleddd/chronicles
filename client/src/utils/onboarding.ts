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

export type ChecklistKey = 'name' | 'city' | 'entry' | 'health' | 'planning' | 'kitchen' | 'media' | 'ai' | 'voice' | 'passkey' | 'homescreen' | 'recovery';

export interface ChecklistItem {
  key: ChecklistKey;
  label: string;
  /** How to do it, in a line */
  how: string;
  done: boolean;
}

/** How to put Chronicles on an iPhone or iPad Home Screen (the same in Safari and Chrome) */
export const HOME_SCREEN_STEPS: readonly string[] = [
  'Open Chronicles in Safari or Chrome. The steps are the same in both.',
  'Tap the Share button, the square with an arrow pointing up. In Safari on iPhone it’s at the bottom of the screen. In Chrome, and on iPad, it’s at the top, in or beside the address bar.',
  'Scroll down and tap Add to Home Screen. If you don’t see it, tap Edit Actions and add it.',
  'Tap Add. Chronicles now opens full screen from its icon, like an app.',
];
export const HOME_SCREEN_HOW = 'In Safari or Chrome, tap Share (the square with an arrow), then Add to Home Screen, then Add.';

/** The checklist. Items are only ever ticked by hand — nothing is checked off
    for the person (an entry they already had, ticking another item…) */
export function gettingStarted(opts: {
  state: OnboardingState;
  /** Voice isn't offered where the browser can't do speech (the voice item is off for now) */
  voiceSupported: boolean;
  /** A passkey isn't offered where the browser can't use one to open the journal */
  passkeySupported?: boolean;
  /** Already opened from the Home Screen (an installed copy): no need to ask */
  installed?: boolean;
  /** Media is switched off in Settings: no Media journal item */
  mediaOff?: boolean;
}): ChecklistItem[] {
  const ticked = new Set(opts.state.ticked ?? []);
  const items: ChecklistItem[] = [];
  const add = (key: ChecklistKey, label: string, how: string) => items.push({ key, label, how, done: ticked.has(key) });
  add('name', 'Add your name', 'Settings → Account → Display name. It’s how the dashboard greets you.');
  add('city', 'Add your city for the weather and world clocks', 'Tap the sliders at the top right, then Customize view, and add a city.');
  add('entry', 'Write your first entry', 'Pick a topic in Quick entry, write your entry, then press Save entry.');
  add('recovery', 'Keep your recovery key somewhere safe', 'It was shown when you signed up. Lost it? Make a new one in Settings → Security.');
  if (opts.passkeySupported) add('passkey', 'Set up a passkey', 'Settings → Security → Passkeys. Sign in with your fingerprint, face or device PIN, with no password to type.');
  add('ai', 'Set up your AI (optional)', 'Settings → In-App AI. Use your own Claude, OpenAI or Amazon Bedrock account for meal and exercise estimates, then turn on the chat, AI planning or AI kitchen if you want them. It stays off until you set it up.');
  add('health', 'Explore your Health dashboard', 'Health is where you set up medications and your exercise routine, log meals and symptoms, and see your reports.');
  add('planning', 'Start planning with your vision', 'In Planning, write your vision first. Then add goals that work toward it, break them into milestones, and plan the tasks onto your week.');
  add('kitchen', 'Explore your Kitchen', 'Your Kitchen dashboard shows today’s meals and your shopping list. Plan the week on the Menu, save recipes and keep your shopping lists there.');
  if (!opts.mediaOff) add('media', 'Start your Media Journal', 'Add the books, movies, TV shows and music you’re into. Rate them, track how far along you are and, if you like, share a public shelf.');
  // The voice command item is off for now, until voice has been fully tested ('voice' stays a key, so a stored tick still reads)
  if (!opts.installed) add('homescreen', 'Add Chronicles to your iPhone or iPad Home Screen to use like an app', HOME_SCREEN_HOW);
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
