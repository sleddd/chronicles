/* Rotating writing prompts for a blank entry (Quick entry, a new journal
   entry): the daily inventory questions — the Lifehacker Daily Personal
   Inventory, asked as something to write about — alternating with reflective
   prompts. Each visit shows the next one; the place in the list is kept per
   browser (a convenience, so a failed read just starts over). */

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
];

/** Inventory and reflective prompts, taking turns */
export const JOURNAL_PROMPTS: string[] = INVENTORY_PROMPTS.flatMap((q, i) =>
  [q, REFLECTIVE_PROMPTS[i % REFLECTIVE_PROMPTS.length]]);

const KEY = 'journal-prompt-v1';

/** The prompt at a turn (wraps around) */
export const promptAt = (turn: number) =>
  JOURNAL_PROMPTS[((turn % JOURNAL_PROMPTS.length) + JOURNAL_PROMPTS.length) % JOURNAL_PROMPTS.length];

/** The next prompt — call once per visit (e.g. in a useState initialiser). */
export function nextPrompt(): string {
  let turn = 0;
  try {
    turn = (parseInt(localStorage.getItem(KEY) ?? '', 10) + 1) || 0;
    localStorage.setItem(KEY, String(turn % JOURNAL_PROMPTS.length));
  } catch { /* storage blocked — start at the first */ }
  return promptAt(turn);
}
