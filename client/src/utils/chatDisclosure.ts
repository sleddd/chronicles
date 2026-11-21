/* AI disclosure for the In-App AI chat: said at the start of every session
   (the header and the empty state) and again in the thread every three hours.
   The chat is never saved, so the session's clock lives only in memory. */

export const AI_DISCLOSURE = 'You’re chatting with an AI model, not a person.';
export const AI_REMINDER = 'Reminder: you’re talking with an AI model, not a person.';
export const REMINDER_INTERVAL_MS = 3 * 60 * 60 * 1000;

/** True once three hours have passed since the session started or the last reminder. */
export function reminderDue(lastDisclosedAt: number, now: number = Date.now()): boolean {
  return now - lastDisclosedAt >= REMINDER_INTERVAL_MS;
}

/*
 * Medical questions: the chat shows this note in the thread (never sent to the
 * model) the first time in a session that a message is about health care —
 * symptoms, a diagnosis, medications and doses, test results, treatment. The
 * model is told the same in its rules (MEDICAL_RULES in chatSave.ts).
 */
export const MEDICAL_DISCLAIMER = 'In-App AI is not a doctor and can’t give medical advice. What it says is general information and may be wrong. For a diagnosis, a treatment or a question about your medications, talk to a doctor, nurse or pharmacist. If it’s an emergency, call 911.';

const MEDICAL_WORDS = new RegExp([
  'symptoms?', 'diagnos\\w*', 'medications?', 'medicines?', 'meds', 'prescri\\w*', 'dos(?:e|es|age|ing)', 'side[ -]effects?',
  'drug interactions?', 'pills?', 'antibiotics?', 'antidepressants?', 'ibuprofen', 'acetaminophen', 'tylenol', 'advil', 'aspirin',
  'insulin', 'blood (?:pressure|sugar|test|tests|work)', 'lab results?', 'test results?', 'fever', 'rash', 'infection', 'lump',
  'chest pain', 'shortness of breath', 'can\'?t breathe', 'dizz(?:y|iness)', 'migraines?', 'surgery', 'diseases?', 'disorders?',
  'treatments?', 'is (?:this|it) (?:normal|serious)', 'should i (?:see|call) (?:a|my) (?:doctor|dr)',
  'doctors?', 'physicians?', 'pharmacists?', 'nurses?', 'allerg(?:y|ies|ic)', 'pregnan\\w*',
].map(w => `\\b${w}\\b`).join('|'), 'i');

/** Whether a message is about health care (symptoms, medications, a diagnosis…) — for the medical note */
export function mentionsMedical(text: string): boolean {
  return MEDICAL_WORDS.test(text);
}

/** Version of the chat consent / safety notice — bump it to ask everyone again. */
export const AI_CONSENT_VERSION = 1;

/*
 * AI task planning and AI insights send decrypted entries to the person's AI
 * provider. This is what they agree to when turning either on (Settings →
 * In-App AI); the Terms and the privacy policy say the same. Change the
 * wording → bump the version, and every browser is asked again.
 */
export const AI_SHARING_CONSENT_VERSION = 1;

export const AI_SHARING_CONSENT: readonly string[] = [
  'This feature removes the usual privacy barrier between your journal and your AI provider.',
  'When you press the button, the items listed are decrypted in this browser and sent to your provider as readable text.',
  'Chronicles is not responsible for what your AI provider does with the information you send it. Your provider’s own terms and privacy policy apply.',
  'We send only what the feature needs, but there is no guarantee of privacy for anything sent this way.',
  'Your entries stay encrypted in Chronicles. Nothing is stored unencrypted.',
  'Your AI provider sees only what is sent for that run. Nothing is sent unless you are signed in, press the button and choose OK.',
];

/** The two boxes to tick, never pre-ticked */
export const AI_SHARING_CHECKS: readonly string[] = [
  'I understand my entries are unencrypted when they are sent to my AI provider.',
  'I understand Chronicles cannot guarantee the privacy of what I send and is not responsible for how my provider handles it.',
];

/** What each feature sends, and what it costs — shown above the consent statement */
export const AI_FEATURE_NOTICE = {
  aiPlan: [
    'Your unscheduled tasks with their status, notes and estimates, the tasks already planned, your goals and milestones with their notes, your visions, the names of your goal categories and task types, and the names and times of your events and meetings for the next 14 days are sent. Nothing else about an event or meeting is.',
    'The AI may suggest days for tasks, new tasks and milestones, and changes to your tasks, goals and milestones: cleaner titles, better categories and types, statuses, and the dates that fill out your roadmap. For an event it may only suggest a new day or time.',
    'Each run is a paid request to your provider, sent again once if the first try asks for a longer answer than your model allows. The more tasks and goals you have, the more it costs.',
    'It runs only when you press the button on the Planner. You review every suggestion, and nothing changes until you press Apply.',
  ],
  aiInsights: [
    'The text of your Journal entries for the period you choose is sent. No other topic is.',
    'Each run is a paid request to your provider. When the reflection touches a sensitive subject, a second, smaller request checks it for safety, and it includes the reflection and the start of the writing that was sent. The more you have written, the more it costs.',
    'The reflection is written by an AI model, not a person. It is not a therapist and it can be wrong.',
    'For adults 18 and older.',
  ],
  aiKitchen: [
    'For a menu: your weekly food budget, how many people, which meals to plan, the week’s dates, anything you type about what you like, and, when you choose, the names and ingredients of your recipes are sent.',
    'For a recipe: the ingredients you list, how many servings, the meal and anything you type about what you like are sent.',
    'Your allergies (each allergen, its reaction and severity, from your Allergy entries) are sent only on a run where you tick “Include my allergies”. That box starts unticked every time.',
    'The AI can get allergens wrong. Check every ingredient yourself before you cook or eat anything.',
    'Shopping list prices are estimates. They vary by store and by where you live, and the AI may not estimate them accurately.',
    'To keep your weeks varied, the names of the meals on your last four weeks of menus are sent too.',
    'Each run is a paid request to your provider. A week with new recipes for every meal is a long answer, so it costs more than a single recipe.',
    'It runs only when you press its button on the Menu, Recipes or Kitchen page. You review everything, and nothing is saved until you choose.',
  ],
} as const;

