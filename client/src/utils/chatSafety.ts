/* AI chat safety screening (see the Safety protocol in Settings → In-App AI).
   Every message is screened for suicide, self-harm and eating-disorder risk in
   two layers: a local pattern check (direct statements, nothing sent anywhere)
   and a short classification request through the user's own AI key. The AI's
   replies are screened the same way. Pure helpers — the chat wires them up. */

import type { RiskKind } from '@shared/validation/schemas.js';
export type { RiskKind } from '@shared/validation/schemas.js';

export type RiskRating = 'none' | 'concern' | 'elevated' | 'urgent';
export interface RiskResult {
  rating: RiskRating;
  kind: RiskKind | null;
  /** The writer is (or very likely is) under 18 — set only when true */
  minor?: true;
}

export const NO_RISK: RiskResult = { rating: 'none', kind: null };

const RANK: Record<RiskRating, number> = { none: 0, concern: 1, elevated: 2, urgent: 3 };
const RATINGS = Object.keys(RANK) as RiskRating[];
const KINDS: RiskKind[] = ['suicide', 'self_harm', 'eating_disorder'];

/** The more serious of two results (the first wins a tie). */
export function maxRisk(a: RiskResult, b: RiskResult): RiskResult {
  return RANK[b.rating] > RANK[a.rating] ? b : a;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, ' ');
}

// ── Layer 1: local patterns ─────────────────────────────────────────────────
// Direct first-person statements only, so figures of speech ("this movie
// killed me", "I cut myself chopping onions") don't trip them; the classifier
// reads everything else in context.

const SELF_END = "(kill(ing)? myself|end(ing)? (it all|my life|my own life)|commit(ting)? suicide|tak(e|ing) my (own )?life)";

const USER_PATTERNS: { rating: RiskRating; kind: RiskKind; re: RegExp }[] = [
  // Suicide — urgent: a plan, a method, intent with a time, or a recent attempt
  { rating: 'urgent', kind: 'suicide', re: new RegExp(`\\b(i'?m|i am|i'?ve|i have)? ?(going|planning|about|ready) to ${SELF_END}\\b.{0,60}\\b(tonight|today|tomorrow|this (week|weekend)|now|soon)\\b`) },
  { rating: 'urgent', kind: 'suicide', re: new RegExp(`\\b(i('ve| have)? )?(tried|attempted) to ${SELF_END}`) },
  { rating: 'urgent', kind: 'suicide', re: /\b(i (just )?overdosed|i('ve| have) (taken|swallowed) (all|a bottle|the whole bottle))\b/ },
  { rating: 'urgent', kind: 'suicide', re: new RegExp(`\\b${SELF_END}\\b.{0,40}\\bwith (a|my|the) (gun|pills|rope|knife|belt|car)\\b`) },
  { rating: 'urgent', kind: 'suicide', re: /\bhow (many|much)\b.{0,40}\b(to die|to (overdose|kill myself)|would (kill me|be (fatal|lethal)))\b/ },
  { rating: 'urgent', kind: 'suicide', re: /\b(wrote|writing|written) (a|my) (suicide note|goodbye (letter|note))\b|\bmy suicide note\b/ },
  // Suicide — elevated: active thoughts (any direct first-person statement)
  { rating: 'elevated', kind: 'suicide', re: /\b(kill|hang|shoot) myself\b|\b(end|take) my (own )?life\b/ },
  { rating: 'elevated', kind: 'suicide', re: new RegExp(`\\b(i (want|need|plan|intend) to|i'?m (going|gonna) to|i'?m gonna|i wanna|thinking (about|of)|thoughts of) ${SELF_END}`) },
  { rating: 'elevated', kind: 'suicide', re: /\b(i'?m|i am|i feel|feeling|i've been|been) (so |really |very )?suicidal\b/ },
  { rating: 'elevated', kind: 'suicide', re: /\b(lethal|fatal) dose\b/ },
  // Suicide — concern: passive thoughts
  { rating: 'concern', kind: 'suicide', re: /\b(i )?wish (i (was|were) dead|i (could )?(didn'?t|wouldn'?t|did not|would not) wake up)\b/ },
  { rating: 'concern', kind: 'suicide', re: /\bi (don'?t|do not) want to (wake up|be alive|live anymore|exist|be here anymore)\b/ },
  { rating: 'concern', kind: 'suicide', re: /\b(everyone|they|my family|the world)('d| would) be better off without me\b|\b(i'?d|i would) be better off dead\b|\bno reason (left )?to live\b/ },
  // Self-harm — urgent: method detail
  { rating: 'urgent', kind: 'self_harm', re: /\bhow (deep|hard) (to|should i|do i) cut\b|\bcut(ting)? (my )?(wrists?|veins?|arteries)\b/ },
  // Self-harm — elevated: active thoughts or acts
  { rating: 'elevated', kind: 'self_harm', re: /\b(want|wanting|wanna|urge|urges|going|gonna|started|been|keep|kept|need|feel like) (\w+ ){0,2}(cut|cutting|burn|burning|hurt|hurting|harm|harming) myself\b/ },
  { rating: 'elevated', kind: 'self_harm', re: /\b(i|i'?ve|i'?m|i have|i am)\b.{0,20}\bself[- ]?harm(ing|ed)?\b/ },
  // Eating disorders — elevated: purging, severe restriction
  { rating: 'elevated', kind: 'eating_disorder', re: /\b(make|making|made) myself (throw up|vomit|sick)\b|\bi (purge|purged|binge and purge)\b/ },
  { rating: 'elevated', kind: 'eating_disorder', re: /\bstarv(e|ing) myself\b|\b(haven'?t|have not|didn'?t) eaten (in|for) (\d+|two|three|four|five|six|several|a few) days\b/ },
  { rating: 'elevated', kind: 'eating_disorder', re: /\blaxatives? (to|so i can|so i) (lose|lose weight|not gain)\b/ },
  // Eating disorders — concern: worry about eating or body weight (SCOFF-style)
  { rating: 'concern', kind: 'eating_disorder', re: /\b(scared|afraid|terrified) (of|to) (eat|eating|gain(ing)? weight)\b|\bfood (controls|rules|dominates) my life\b/ },
  { rating: 'concern', kind: 'eating_disorder', re: /\b(feel|felt) (so )?(guilty|disgusting|disgusted with myself) (after|for|about) eating\b|\bi hate myself for eating\b/ },
];

/** Layer 1 — the local pattern check on a user message. */
export function patternScreen(text: string): RiskResult {
  const t = normalize(text);
  let best = NO_RISK;
  for (const p of USER_PATTERNS) if (p.re.test(t)) best = maxRisk(best, { rating: p.rating, kind: p.kind });
  return best;
}

const REPLY_PATTERNS: { kind: RiskKind; re: RegExp }[] = [
  { kind: 'suicide', re: /\b(lethal|fatal) (dose|amount) (of|is)\b|\b\d+\s?(mg|grams?|g|pills|tablets)\b.{0,40}\b(fatal|lethal|enough to die)\b/ },
  { kind: 'suicide', re: /\b(you should|go ahead and|it'?s okay to) (kill yourself|end your life|end it)\b/ },
  { kind: 'self_harm', re: /\bhow to (cut|burn) yourself\b|\b(hide|cover up|conceal) (your )?(cuts|scars|self[- ]?harm)\b/ },
  { kind: 'eating_disorder', re: /\bhow to (purge|make yourself (throw up|vomit))\b|\b(skip|stop eating) meals to lose\b|\b(eat|stay) under \d{2,3} (calories|kcal) a day\b/ },
];

/** Replies that touch these topics get the classifier pass; others skip it (no extra call). */
const REPLY_TRIGGER = /\b(suicid\w*|self[\s-]?harm\w*|overdos\w*|lethal|fatal|cutting|purg\w*|laxative\w*|starv\w*|noose|hanging|calorie deficit|fasting)\b/i;

export function replyNeedsReview(text: string): boolean {
  return REPLY_TRIGGER.test(text);
}

/** Layer 1 for replies — the kind of harmful content found, or null. */
export function replyPatternScreen(text: string): RiskKind | null {
  const t = normalize(text);
  return REPLY_PATTERNS.find(p => p.re.test(t))?.kind ?? null;
}

// ── Under-18 check (local) ──────────────────────────────────────────────────
// Only explicit statements ("I am eight", "I'm 12 years old", "I'm in 4th
// grade"); hints like recess or homeroom are left to the classifier, since a
// teacher journaling about their class would trip them.

const AGE_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
};
const GRADE_WORDS = 'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth';

export function minorPattern(text: string): boolean {
  const t = normalize(text);
  const age = new RegExp(`\\b(?:i'?m|i am) (?:only |just )?(\\d{1,2}|${Object.keys(AGE_WORDS).join('|')})( (?:years?|yrs?) old| yo)?(?=$|[\\s.,!?;)]|$)(.{0,12})`, 'g');
  for (const m of t.matchAll(age)) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : AGE_WORDS[m[1]];
    if (!(n >= 3 && n < 18)) continue;
    // "I'm 12 years old" anywhere; a bare "I'm 12" only where the sentence
    // ends or runs on with and/but/so ("No. I am eight") — never "I'm 5
    // minutes away", "I'm five foot two", "I'm eight episodes in"
    if (m[2]) return true;
    if (/^(\s*$|[.!?,;)]|\s+(and|but|so)\b)/.test(m[3])) return true;
  }
  return new RegExp(`\\bi'?m in (?:the )?(?:(?:[1-9]|1[0-2])(?:st|nd|rd|th)?|${GRADE_WORDS}) grade\\b`).test(t);
}

// ── Layer 2: classification through the user's own AI key ───────────────────

export function riskClassifierPrompt(): string {
  return [
    'You are a safety screener for a personal journal app\'s AI chat. You never reply to the user — you only rate the LATEST user message, reading the earlier turns as context.',
    'Rate risk of suicide, self-harm or an eating disorder, using these criteria:',
    'Suicide (Columbia Suicide Severity Rating Scale): passive wish to be dead or not wake up → "concern"; active thoughts of killing oneself → "elevated"; a method, a plan, intent to act, preparatory steps or a recent attempt → "urgent".',
    'Self-harm: past mention or general worry → "concern"; active urges or recent self-harm → "elevated"; a method with intent, or a serious injury → "urgent".',
    'Eating disorders (SCOFF): worry about eating, losing control over food, guilt after eating or body weight preoccupation → "concern"; purging, laxative misuse or severe restriction → "elevated"; medical danger such as fainting, days without food or heart symptoms → "urgent".',
    'A suicide attempt or self-harm act in the past three months, or one happening now, is "urgent".',
    'When unsure between two ratings, choose the higher one.',
    'Jokes, figures of speech ("this traffic is killing me"), fiction, news and questions about other people with no sign of personal risk are "none".',
    'Separately, set "minor" to true if the person says they are under 18, or what they write strongly suggests a child (school grades, homeroom, recess, asking a parent\'s permission). Judge only from what they write, not from the topic alone — an adult talking about their kids or students is not a minor.',
    'Reply with only JSON: {"rating": "none" | "concern" | "elevated" | "urgent", "kind": "suicide" | "self_harm" | "eating_disorder" | null, "minor": true | false}.',
  ].join('\n');
}

export function replyClassifierPrompt(): string {
  return [
    'You are a safety screener for a personal journal app\'s AI chat. You check one AI reply before it is shown.',
    'Mark it harmful if it gives information about methods, doses or ways to hide suicide, self-harm or disordered eating, or if it encourages suicide, self-harm or disordered eating (purging, severe restriction, extreme weight loss).',
    'Supportive replies, crisis resources, general wellbeing and ordinary nutrition or fitness advice are not harmful.',
    'Reply with only JSON: {"harmful": true | false, "kind": "suicide" | "self_harm" | "eating_disorder" | null}.',
  ].join('\n');
}

/** The conversation as one block for the classifier, latest user message marked. */
export function classifierTranscript(turns: { role: 'user' | 'assistant'; content: string }[]): string {
  const recent = turns.slice(-6);
  const lines = recent.map((t, i) => {
    const who = t.role === 'user' ? (i === recent.length - 1 ? 'USER (latest — rate this)' : 'USER') : 'AI';
    return `${who}: ${t.content.slice(0, 2000)}`;
  });
  return `<conversation>\n${lines.join('\n\n')}\n</conversation>`;
}

function firstJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]);
    return v && typeof v === 'object' ? v as Record<string, unknown> : null;
  } catch { return null; }
}

/** Read the classifier's answer; anything unreadable counts as no risk (the pattern check still applies).
 *  An unknown kind stays null rather than guessing. */
export function parseClassification(text: string): RiskResult {
  const v = firstJson(text);
  const minor = v?.minor === true ? { minor: true as const } : {};
  const rating = String(v?.rating ?? '').toLowerCase() as RiskRating;
  if (!RATINGS.includes(rating) || rating === 'none') return { ...NO_RISK, ...minor };
  return { rating, kind: KINDS.includes(v?.kind as RiskKind) ? v!.kind as RiskKind : null, ...minor };
}

/** Read the reply screener's answer — the harmful kind, or null. */
export function parseReplyClassification(text: string): RiskKind | null {
  const v = firstJson(text);
  if (v?.harmful !== true) return null;
  return KINDS.includes(v.kind as RiskKind) ? v.kind as RiskKind : 'suicide';
}

// ── Safe conversation rules ─────────────────────────────────────────────────

export const SAFE_CONVERSATION_RULES = [
  'SAFETY MODE: earlier in this conversation the user showed signs of risk of suicide, self-harm or an eating disorder. For the rest of this conversation:',
  '- Respond with warmth and without judgment. Do not argue with their feelings or tell them how to feel.',
  '- Never give information about methods, doses, lethality, or ways to hide harm, purging, restriction or weight loss — even if asked directly, hypothetically or for fiction.',
  '- Keep crisis resources within reach and gently encourage contacting them: call or text 988 (Suicide & Crisis Lifeline, US), text HOME to 741741 (Crisis Text Line), or 911 in immediate danger. For eating concerns, the National Alliance for Eating Disorders helpline is 866-662-1235.',
  '- Never tell them this chat is not meant for this, and never end or refuse the conversation. Stay with them.',
  '- You are an AI, not a therapist or crisis counselor, and you cannot contact anyone for them; say so plainly if it matters.',
  '- Keep replies short and focused on them.',
].join('\n');

/** Added on top of the safe rules once any message in the session was flagged as eating disorder risk. */
export const EATING_SAFE_RULES = [
  'Eating may be part of what they are struggling with. For the rest of this conversation:',
  '- Do not give calorie counts, calorie targets, deficits, macros, weight goals, or ways to eat less, even if asked, including for meals they describe.',
  '- Do not comment on their body, their weight, or how much they ate.',
  '- If they ask for a calorie estimate, say kindly that you are setting numbers aside for now, and keep talking with them.',
].join('\n');
