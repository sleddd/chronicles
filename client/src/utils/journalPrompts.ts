/* Rotating writing prompts for a blank entry. A new journal entry takes the
   daily inventory questions — the Lifehacker Daily Personal Inventory, asked
   as something to write about — in turn with reflective prompts; the
   dashboard's Quick entry takes the reflective prompts only (the Your day
   check-in already asks the inventory). Each visit shows the next one; the
   place in each list is kept per browser (a convenience, so a failed read
   just starts over). */

/** The daily inventory, as questions to write about */
export const INVENTORY_PROMPTS = [
  'How good was your day?',
  'How rested did you feel when you woke up this morning?',
  'How many hours did you sleep?',
  'Did you wake up during the night? What woke you?',
  'Did you eat breakfast? How healthy was it?',
  'How healthy were lunch and dinner today?',
  'Did you eat too much or too little today?',
  'How much water did you drink today?',
  'Did you exercise today? For how long?',
  'How was your work day?',
  'How were your social interactions today?',
  'How much did you procrastinate today? On what?',
];

/** Reflective prompts */
export const REFLECTIVE_PROMPTS = [
  'What’s on your mind right now?',
  'What are you grateful for today?',
  'What was the best moment of your day?',
  'What drained your energy today, and what gave it back?',
  'What did you learn today?',
  'What would make tomorrow a good day?',
  'What are you looking forward to?',
  'What’s something you handled well recently?',
  'What’s been weighing on you, and what’s one small step you could take?',
  'Who made a difference to your day?',
  'How are you feeling, in one word? Why that word?',
  'What do you want to remember about today?',
  'What surprised you today?',
  'When did you feel most like yourself today?',
  'What are you avoiding, and what would make it easier to start?',
  'What would you tell a friend who had the day you had?',
  'What did your body need today? Did it get it?',
  'What’s one thing you’d do differently if you could replay today?',
  'Where did your attention go today? Where do you wish it had gone?',
  'What small thing made you smile?',
  'What are you proud of this week, even if no one noticed?',
  'What’s a worry you can set down for tonight?',
  'What did you say yes to today? What could you say no to?',
  'What feels unfinished right now?',
  'How did you take care of yourself today?',
  'What’s something you’re curious about lately?',
  'Who would you like to reach out to, and why?',
  'What does a good enough day look like for you?',
  'What’s changing in your life right now? How do you feel about it?',
  'What gave you a sense of calm today?',
];

/** Inventory and reflective prompts, taking turns */
export const JOURNAL_PROMPTS: string[] = INVENTORY_PROMPTS.flatMap((q, i) =>
  [q, REFLECTIVE_PROMPTS[i % REFLECTIVE_PROMPTS.length]]);

const KEY = 'journal-prompt-v1';

/** The prompt at a turn (wraps around) */
export const promptAt = (turn: number) =>
  JOURNAL_PROMPTS[((turn % JOURNAL_PROMPTS.length) + JOURNAL_PROMPTS.length) % JOURNAL_PROMPTS.length];

/** The next turn in a list kept under `key` (wraps; starts at 0 when storage is blocked) */
function nextTurn(key: string, length: number): number {
  let turn = 0;
  try {
    turn = (parseInt(localStorage.getItem(key) ?? '', 10) + 1) || 0;
    localStorage.setItem(key, String(turn % length));
  } catch { /* storage blocked — start at the first */ }
  return turn % length;
}

/** The next prompt for a new journal entry — call once per visit (e.g. in a useState initialiser). */
export function nextPrompt(): string {
  return promptAt(nextTurn(KEY, JOURNAL_PROMPTS.length));
}

const QUICK_KEY = 'quick-prompt-v1';

/** The next reflective prompt, for the dashboard's Quick entry (its own place in the list) */
export function nextReflectivePrompt(): string {
  return REFLECTIVE_PROMPTS[nextTurn(QUICK_KEY, REFLECTIVE_PROMPTS.length)];
}
