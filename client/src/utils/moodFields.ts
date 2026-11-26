/* Mood on a wellness check-in. Five faces form the 1–5 scale (`moodScore`,
   which reports average and compare with sleep and symptoms); three more —
   Calm, Stressed and Sick — are words beside it (`moodWord`), kept off the scale so
   they never skew it. A day has one or the other: picking either clears the
   other. The mood picker counts them on as 6, 7 and 8 (saved as the word, never the number); only these helpers
   turn that into what's saved. */

export const MOOD_WORDS = ['calm', 'stressed', 'sick'] as const;
export type MoodWord = typeof MOOD_WORDS[number];

/** The picker's value for a check-in: its score 1–5, a word as 6–8, or 0 */
export function moodOf(cf: { moodScore?: unknown; moodWord?: unknown } | null | undefined): number {
  const score = Number(cf?.moodScore) || 0;
  if (score >= 1 && score <= 5) return score;
  const i = MOOD_WORDS.indexOf(cf?.moodWord as MoodWord);
  return i >= 0 ? 6 + i : 0;
}

/** What to save for a picker value: the score or the word, the other cleared */
export function moodFields(v: number): { moodScore: number; moodWord: MoodWord | '' } {
  if (v >= 1 && v <= 5) return { moodScore: v, moodWord: '' };
  const word = MOOD_WORDS[v - 6];
  return word ? { moodScore: 0, moodWord: word } : { moodScore: 0, moodWord: '' };
}

/** "Mood 4/5", "Stressed", or '' — for an entry's one-line summary */
export function moodSummary(cf: { moodScore?: unknown; moodWord?: unknown }): string {
  const v = moodOf(cf);
  if (v >= 1 && v <= 5) return `Mood ${v}/5`;
  const word = MOOD_WORDS[v - 6];
  return word ? word[0].toUpperCase() + word.slice(1) : '';
}
