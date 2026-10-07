/**
 * House style for the AI chat: banned words/phrases and an emoji cap, checked
 * on every reply. The system prompt asks the model to follow these; this is
 * the safety net when it doesn't. Text inside `code` spans (e.g. a suggested
 * `/save …` with the user's own words) is never checked or changed.
 */

export const BANNED_PHRASES = [
  'got it', 'ha', 'haha', 'hahaha', 'my bad', 'gotcha', 'I got it', 'nah', 'yeah', 'noted',
  'understood', 'I hear you', 'still here', 'I am available', 'I am here', "I'm here",
  'fair enough', 'okay, okay', 'I know, I know', 'ok, ok', 'right back at you', 'fair',
  "you're right", 'my apologies', 'apologies', 'I know', 'that matters', 'that is real',
  'the loss is real', 'sit with', 'just be here', "I'm here for you", 'lovely', 'wonderful',
  'there it is', 'there she is',
] as const;

/** Most emojis allowed in one reply — the persona emotes in *asterisks* instead. */
export const MAX_EMOJIS = 1;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Longest first so "I'm here for you" wins over "I'm here", "hahaha" over "ha". */
const ORDERED = [...BANNED_PHRASES].sort((a, b) => b.length - a.length);

function phraseRe(phrase: string, flags = 'gi'): RegExp {
  // Apostrophes may arrive straight or curly; whitespace may vary
  const body = escapeRe(phrase).replace(/'/g, "['’]").replace(/\s+/g, '\\s+').replace(/,/g, ',\\s*');
  return new RegExp(`(?<![\\w'’])${body}(?![\\w'’])`, flags);
}

const ANY_BANNED = new RegExp(ORDERED.map(p => phraseRe(p, '').source).join('|'), 'gi');

/** Run `fn` on the prose parts of `text`, leaving `code` spans untouched. */
function mapProse(text: string, fn: (prose: string) => string): string {
  return text.split(/(`[^`]*`)/g).map(part => (part.startsWith('`') && part.endsWith('`') && part.length > 1 ? part : fn(part))).join('');
}

function proseOf(text: string): string {
  return text.split(/(`[^`]*`)/g).filter(p => !(p.startsWith('`') && p.endsWith('`') && p.length > 1)).join(' ');
}

/** The banned phrases used in a reply (lower-cased, unique, in list order). */
export function findBanned(text: string): string[] {
  const prose = proseOf(text);
  return ORDERED.filter(p => phraseRe(p).test(prose)).map(p => p.toLowerCase())
    .filter((p, i, all) => all.indexOf(p) === i);
}

/**
 * Last resort: remove banned phrases and tidy what's left — stray commas,
 * doubled spaces, empty lines and lower-case sentence starts.
 */
export function scrubBanned(text: string): string {
  return mapProse(text, prose => {
    let s = prose.replace(ANY_BANNED, '');
    s = s
      .replace(/^[ \t]*[,;:—–-]+[ \t]*/gm, '')          // leftover punctuation at line start
      .replace(/([.!?])[ \t]*[,;:—–-]+[ \t]*/g, '$1 ')     // ... after a sentence end
      .replace(/[ \t]+([,.!?;:])/g, '$1')                 // space before punctuation
      .replace(/([,;:])\s*([.!?])/g, '$2')                // ", ." → "."
      .replace(/^[ \t]*[.!?]+[ \t]*/gm, '')               // a line that is now just "!"
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/(^|[.!?]\s+|\n)([a-z])/g, (_m, pre: string, c: string) => pre + c.toUpperCase());
    return s.split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n');
  }).trim();
}

const EMOJI = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*/gu;

/** Keep at most `max` emojis (the first ones); drop the rest. */
export function limitEmojis(text: string, max = MAX_EMOJIS): string {
  let seen = 0;
  return mapProse(text, prose => prose.replace(EMOJI, m => (++seen <= max ? m : '')).replace(/[ \t]{2,}/g, ' '));
}

/** Instruction for a one-time rewrite when a reply used banned phrases. */
export function rewriteInstruction(found: string[]): string {
  return [
    `Rewrite your last reply without these words or phrases: ${found.map(p => `"${p}"`).join(', ')}.`,
    'Keep the meaning, warmth and any `/save …` suggestion exactly as they were.',
    'Reply with the rewritten message only — no preface, no mention of the rewrite.',
  ].join(' ');
}
