/* Voice commands: a spoken sentence ("add task call the dentist due Friday,
   high priority") turned into the same save the chat's `/save` makes — the
   topic, then its main text and "key: value" parts for chatSaveEntry. Spoken
   dates ("Friday", "October 30th", "in 3 days") and times ("7 p.m.") are
   written out here first, since /save only reads plain ones. No topic named
   = Journal. Pure. */

import { toDateStr } from './dateUtils.js';

export interface VoiceTopic { id: number; name: string }

/** Goals and milestones a task or milestone can be linked to by name */
export interface VoicePlan {
  goals: { id: number; title: string }[];
  milestones: { id: number; title: string; goalId: number | null }[];
}

/** The goal / milestone a spoken "part of …" found, as the fields to set */
export interface VoiceLink {
  fields: { parentGoalId?: number | null; parentMilestoneId?: number | null };
  label: string;
}

export interface VoiceCommand {
  topic: VoiceTopic;
  /** The text for chatSaveEntry: main, then " | key: value" parts */
  text: string;
  /** What will be saved, for the preview */
  main: string;
  parts: { key: string; value: string; label: string }[];
  /** "… and save" / "… save it" at the end: save without a tap */
  saveNow: boolean;
  /** "part of Chronicles": the goal / milestone it's linked to */
  link?: VoiceLink;
  /** Said "part of …" but nothing by that name: kept in the text, noted here */
  unmatchedLink?: string;
  /** "Add to-do list …": a task in the To-do list format with these items */
  list?: string[];
}

const LEADING_VERB = /^(?:(?:please|ok|okay|hey chronicles)[,\s]+)?(?:add|new|create|log|save|record|make|put|start)\s+(?:(?:a|an|the|new|my)\s+)*/i;
/* "… and save" / "… then save" / "… save it": save without a tap. A bare
   trailing "save" isn't enough ("remember to save"); said on its own as the
   next phrase, the panel takes it as Save. */
const TRAILING_SAVE = /(?:^|[\s,.]+)(?:(?:and|then)\s+save(?:\s+it)?|save\s+it)[.!]?\s*$/i;

/* Spoken words for a topic that isn't its name */
const TOPIC_ALIASES: Record<string, string[]> = {
  task: ['to do', 'to-do', 'todo', 'reminder'],
  meals: ['meal', 'food'],
  symptom: ['symptoms'],
  'exercise routine': ['routine'],
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, sixty: 60,
};

const num = (s: string) => (/^\d+(?:\.\d+)?$/.test(s) ? Number(s) : NUMBER_WORDS[s.toLowerCase()]);

const NUM = String.raw`(\d+(?:\.\d+)?|${Object.keys(NUMBER_WORDS).join('|')})`;
const MONTH = String.raw`(${MONTHS.join('|')}|${MONTHS.map(m => m.slice(0, 3)).join('|')})\.?`;
const DAY_OF_MONTH = String.raw`(\d{1,2})(?:st|nd|rd|th)?`;
/** A spoken date phrase, as a regex source (no capture of its own) */
const DATE = String.raw`(?:today|tonight|tomorrow|yesterday|day after tomorrow|in\s+${NUM}\s+(?:days?|weeks?)|(?:next|this)\s+week|(?:(?:next|this|on)\s+)?(?:${WEEKDAYS.join('|')})|${MONTH}\s+${DAY_OF_MONTH}|(?:the\s+)?${DAY_OF_MONTH}\s+of\s+${MONTH}|\d{4}-\d{2}-\d{2})`;
const TIME = String.raw`(?:\d{1,2}(?::\d{2})?\s*(?:a\.?\s?m\.?|p\.?\s?m\.?|o'?clock)?|noon|midnight)`;

/** A spoken date → YYYY-MM-DD ('' when it isn't one). Weekdays mean the next one (today counts). */
export function spokenDate(phrase: string, now = new Date()): string {
  const p = phrase.trim().toLowerCase().replace(/^on\s+/, '').replace(/[.,]$/, '');
  const day = (n: number) => toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
  if (p === 'today' || p === 'tonight') return day(0);
  if (p === 'tomorrow') return day(1);
  if (p === 'yesterday') return day(-1);
  if (p === 'day after tomorrow') return day(2);
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
  let m = p.match(new RegExp(String.raw`^in\s+${NUM}\s+(days?|weeks?)$`));
  if (m) return day((num(m[1]) ?? 0) * (m[2].startsWith('week') ? 7 : 1));
  if (p === 'next week') return day(7);
  if (p === 'this week') return day(0);
  m = p.match(new RegExp(String.raw`^(next|this)?\s*(${WEEKDAYS.join('|')})$`));
  if (m) {
    let ahead = (WEEKDAYS.indexOf(m[2]) - now.getDay() + 7) % 7;
    if (m[1] === 'next' && ahead === 0) ahead = 7;
    return day(ahead);
  }
  m = p.match(new RegExp(String.raw`^${MONTH}\s+${DAY_OF_MONTH}$`)) ?? null;
  let month = -1;
  let date = 0;
  if (m) { month = MONTHS.findIndex(x => x.startsWith(m![1].slice(0, 3))); date = Number(m[2]); }
  const m2 = p.match(new RegExp(String.raw`^(?:the\s+)?${DAY_OF_MONTH}\s+of\s+${MONTH}$`));
  if (m2) { month = MONTHS.findIndex(x => x.startsWith(m2[2].slice(0, 3))); date = Number(m2[1]); }
  if (month >= 0 && date >= 1 && date <= 31) {
    // The next one: a date already past this year means next year
    let d = new Date(now.getFullYear(), month, date);
    if (toDateStr(d) < toDateStr(now)) d = new Date(now.getFullYear() + 1, month, date);
    return toDateStr(d);
  }
  return '';
}

/** "7 p.m." / "7:30am" / "noon" → "HH:MM" ('' when it isn't one; a bare "7" needs a.m./p.m.) */
export function spokenTime(phrase: string): string {
  const p = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
  if (p === 'noon') return '12:00';
  if (p === 'midnight') return '00:00';
  const m = p.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|o'?clock)?$/);
  if (!m || (!m[2] && !m[3])) return '';
  let h = Number(m[1]);
  const min = Number(m[2] ?? '0');
  const pm = m[3]?.startsWith('p');
  const am = m[3]?.startsWith('a');
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  if (h > 23 || min > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* "to-do list" / "to do list" / "todo list" / "checklist" right after the verb */
const LIST_START = /^(?:to[\s-]?do\s+list|todo\s+list|check\s*list)\b[\s,:.-]*/i;
/* Where the items begin: "items …", "first item …", "with …" */
const ITEMS_START = /(?:^|[\s,]+)(?:(?:and\s+)?(?:with\s+)?(?:the\s+)?(?:items?|(?:first|1st)\s+(?:item|thing|one))\b[\s,:]*|with\s+)/i;
/* Between items: commas, "and", "then", "second item", "next item"… */
const ITEM_SPLIT = /\s*(?:[,;]|\band\b|\bthen\b|\b(?:next|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|another|last|\d+(?:st|nd|rd|th))\s+(?:item|thing|one)\b)[\s,:]*/i;

/** "laundry second item dishes, vacuum and mop" → ["Laundry", "Dishes", "Vacuum", "Mop"] */
export function listItems(said: string): string[] {
  return said.split(ITEM_SPLIT).map(i => i.replace(/^[\s,.:-]+|[\s,.:-]+$/g, '')).filter(Boolean).map(cap);
}

const plainWords = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** The item whose title best fits what was said (exact, then starts with, then contains); null when none does */
export function matchPlanItem<T extends { title: string }>(said: string, items: T[]): T | null {
  const want = plainWords(said);
  if (want.length < 2) return null;
  let best: T | null = null;
  let score = 0;
  for (const item of items) {
    const title = plainWords(item.title);
    if (!title) continue;
    const s = title === want ? 3 : title.startsWith(want) || want.startsWith(title) ? 2 : title.includes(want) || want.includes(title) ? 1 : 0;
    if (s > score) { best = item; score = s; }
  }
  return best;
}

/* "part of Chronicles" / "goal Chronicles" / "milestone Beta" at
   the end of a task or milestone: the link clause, then its kind and name */
const LINK_START = /(?:^|[\s,]+)(?:and\s+)?(?:it'?s\s+)?(?:part\s+of|for\s+(?:the\s+)?(?=goal\b|milestone\b)|goal\b|milestone\b)/i;

function linkClause(rest: string, kind: string, plan: VoicePlan | undefined): { main: string; link?: VoiceLink; unmatched?: string } {
  const at = rest.search(LINK_START);
  if (at < 0 || !plan) return { main: rest };
  const clause = rest.slice(at);
  // Segments: "part of X", "goal X", "milestone X" — the last one of each kind wins
  const segs = [...clause.matchAll(/\b(part\s+of|goal|milestone)\s+(?:the\s+)?(?:(goal|milestone)\s+)?(.+?)(?=\s+(?:and\s+)?(?:part\s+of|goal|milestone)\b|$)/gi)];
  let goal: VoicePlan['goals'][number] | null = null;
  let milestone: VoicePlan['milestones'][number] | null = null;
  for (const m of segs) {
    const word = (m[2] ?? m[1]).toLowerCase();
    const name = m[3].replace(/[\s,.]+$/, '').replace(/\s+and$/i, '');
    const wantMilestone = word === 'milestone' && kind.startsWith('task');
    const wantGoal = word === 'goal';
    if (wantMilestone || (!wantGoal && kind.startsWith('task'))) {
      const ms = matchPlanItem(name, plan.milestones);
      if (ms) { milestone = ms; continue; }
    }
    if (wantMilestone) continue;
    const g = matchPlanItem(name, plan.goals);
    if (g) goal = g;
  }
  if (!goal && !milestone) {
    const said = segs.map(m => m[3]).pop()?.trim();
    return { main: rest, unmatched: said };
  }
  const main = rest.slice(0, at).replace(/[\s,]+(?:and)?$/i, '');
  if (milestone && kind.startsWith('task')) {
    const goalId = milestone.goalId ?? goal?.id ?? null;
    const goalTitle = plan.goals.find(g => g.id === goalId)?.title;
    return { main, link: {
      fields: { parentMilestoneId: milestone.id, parentGoalId: goalId },
      label: `Part of milestone: ${milestone.title}${goalTitle ? ` (${goalTitle})` : ''}`,
    } };
  }
  return { main, link: { fields: { parentGoalId: goal!.id }, label: `Part of goal: ${goal!.title}` } };
}

/** The topic the sentence starts with (longest name or alias first), and the rest */
function matchTopic(rest: string, topics: VoiceTopic[]): { topic: VoiceTopic; text: string } | null {
  const names: { topic: VoiceTopic; said: string }[] = [];
  for (const t of topics) {
    const name = t.name.trim().toLowerCase();
    names.push({ topic: t, said: name });
    if (name.endsWith('s')) names.push({ topic: t, said: name.slice(0, -1) });
    else names.push({ topic: t, said: `${name}s` });
    for (const alias of TOPIC_ALIASES[name] ?? TOPIC_ALIASES[name.replace(/s$/, '')] ?? []) names.push({ topic: t, said: alias });
  }
  names.sort((a, b) => b.said.length - a.said.length);
  const lower = rest.toLowerCase();
  for (const { topic, said } of names) {
    if (!said || !lower.startsWith(said)) continue;
    const next = rest.charAt(said.length);
    if (next && !/[\s,:.-]/.test(next)) continue;
    return { topic, text: rest.slice(said.length).replace(/^[\s,:.-]+/, '') };
  }
  return null;
}

/* The spoken phrases each kind of topic reads (its form's fields); any other
   topic is plain and keeps every word */
const FIELDS_BY_KIND: Record<string, string[]> = {
  task: ['priority', 'day'],
  goal: ['day'],
  milestone: ['day'],
  symptom: ['severity', 'minutes', 'day', 'time'],
  allergy: ['severity', 'day', 'time'],
  meal: ['mealType', 'day', 'time'],
  exercise: ['minutes', 'distance', 'day', 'time'],
  event: ['day', 'time'],
  meeting: ['with', 'day', 'time'],
  change: ['day'],
};

const LABELS: Record<string, (v: string) => string> = {
  meal: v => cap(v),
  due: v => `Due ${v}`,
  by: v => `By ${v}`,
  date: v => v,
  time: v => `At ${v}`,
  priority: v => `${cap(v)} priority`,
  severity: v => `Severity ${v}`,
  minutes: v => `${v} min`,
  miles: v => `${v} mi`,
  km: v => `${v} km`,
  with: v => `With ${v}`,
  notes: v => `Notes: ${v}`,
};

/** How a date reads in the preview: "Fri, Oct 30" */
function readableDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * The save a spoken sentence asks for, or null when nothing's left to save.
 * `journal` is the topic to use when none is named.
 */
export function parseVoiceCommand(transcript: string, topics: VoiceTopic[], journal: VoiceTopic, now = new Date(), plan?: VoicePlan): VoiceCommand | null {
  let said = transcript.trim().replace(/\s+/g, ' ');
  const saveNow = TRAILING_SAVE.test(said);
  if (saveNow) said = said.replace(TRAILING_SAVE, '').trim();
  if (!said) return null;
  said = said.replace(LEADING_VERB, '');
  // "Add to-do list …": a task holding the items (title first, then the items)
  let listItemsSaid: string | undefined;
  const taskTopic = topics.find(t => ['task', 'tasks'].includes(t.name.trim().toLowerCase()));
  const listStart = taskTopic ? said.match(LIST_START) : null;
  // "Log breakfast eggs and toast": a meal word first means Meals (the word
  // stays, to be read as the meal type)
  const mealsTopic = topics.find(t => ['meals', 'meal'].includes(t.name.trim().toLowerCase()));
  const mealFirst = mealsTopic && /^(?:my\s+)?(?:breakfast|lunch|dinner|supper|snack)\b/i.test(said);
  const matched = listStart && taskTopic
    ? { topic: taskTopic, text: said.slice(listStart[0].length) }
    : mealFirst ? { topic: mealsTopic!, text: said } : matchTopic(said, topics);
  const topic = matched?.topic ?? journal;
  let rest = matched ? matched.text : said;
  if (listStart) {
    const at = rest.search(ITEMS_START);
    if (at >= 0) {
      listItemsSaid = rest.slice(at).replace(ITEMS_START, '');
      rest = rest.slice(0, at);
    }
    // "title my list" / "called groceries" / "named …"
    rest = rest.replace(/^(?:(?:with\s+)?(?:the\s+)?(?:title|titled|called|named|name)\b[\s,:]*)/i, '');
  }
  const kind = topic.name.trim().toLowerCase();
  const plain = !FIELDS_BY_KIND[kind.replace(/ies$/, 'y').replace(/s$/, '')];

  const parts: Record<string, string> = {};
  const take = (re: RegExp, key: string, value: (m: RegExpMatchArray) => string) => {
    const m = rest.match(re);
    if (!m) return;
    const v = value(m);
    if (!v) return;
    parts[key] = v;
    rest = (rest.slice(0, m.index) + ' ' + rest.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, ' ').trim();
  };

  // Plain topics (Journal, Mantra, Idea…) keep every word as written. The
  // rest read only the phrases their form has fields for, so "under 30
  // minutes" stays in a milestone's name
  const base = kind.replace(/ies$/, 'y').replace(/s$/, '');
  const reads = new Set<string>(plain ? [] : ['notes', ...(FIELDS_BY_KIND[base] ?? [])]);
  // A goal / milestone's day is its target ("by"); a task's is its deadline
  const dayKey = base === 'task' ? 'due' : base === 'goal' || base === 'milestone' ? 'by' : 'date';
  // "breakfast" / "for lunch" / "supper" → the meal type (else the time of day picks one)
  if (reads.has('mealType')) take(/(?:^|[,\s]+)(?:my\s+|for\s+|at\s+)?(breakfast|lunch|dinner|supper|snack)\b[\s,:-]*/i, 'meal', m => (m[1].toLowerCase() === 'supper' ? 'dinner' : m[1].toLowerCase()));
  if (reads.has('notes')) take(/[,\s]*\bnotes?\b[:,]?\s+(.+)$/i, 'notes', m => m[1].trim());
  if (reads.has('with')) take(/[,\s]*\bwith\s+(.+?)(?=[,.]|$)/i, 'with', m => m[1].trim());
  if (reads.has('priority')) take(/[,\s]*\b(?:it'?s\s+)?(?:priority\s+(low|medium|high|urgent)|(low|medium|high|urgent)\s+priority|(urgent))\b/i, 'priority', m => (m[1] ?? m[2] ?? m[3]).toLowerCase());
  if (reads.has('severity')) take(new RegExp(String.raw`[,\s]*\b(?:severity|level)\s+(?:of\s+)?${NUM}\b(?:\s*(?:out of|/)\s*10)?`, 'i'), 'severity', m => String(Math.min(10, Math.round(num(m[1]) ?? 0)) || ''));
  if (reads.has('day')) take(new RegExp(String.raw`[,\s]*\b(?:due|deadline|by)\s+(${DATE})\b`, 'i'), dayKey, m => spokenDate(m[1], now));
  if (reads.has('minutes')) take(new RegExp(String.raw`[,\s]*\b(?:for\s+)?${NUM}\s*(?:minutes?|mins?)\b`, 'i'), 'minutes', m => String(num(m[1]) ?? ''));
  if (reads.has('distance')) take(new RegExp(String.raw`[,\s]*\b${NUM}\s*(miles?|kilometers?|kilometres?|km)\b`, 'i'), 'distance', m => `${num(m[1])}|${/^mi/i.test(m[2]) ? 'miles' : 'km'}`);
  if (reads.has('time')) take(new RegExp(String.raw`[,\s]*\b(?:at|@)\s+(${TIME})(?=[\s,.]|$)`, 'i'), 'time', m => spokenTime(m[1]));
  // A day said without "due" / "by"
  if (reads.has('day') && !parts[dayKey]) take(new RegExp(String.raw`[,\s]*\b(?:on\s+)?(${DATE})\b`, 'i'), dayKey, m => spokenDate(m[1], now));
  // Tasks and milestones: "part of Chronicles" links to that goal / milestone
  let link: VoiceLink | undefined;
  let unmatchedLink: string | undefined;
  if (kind.startsWith('task') || kind.startsWith('milestone')) {
    const found = linkClause(rest, kind, plan);
    rest = found.main;
    link = found.link;
    unmatchedLink = found.unmatched;
  }
  if (parts.distance) {
    const [v, unit] = parts.distance.split('|');
    delete parts.distance;
    parts[unit] = v;
  }

  const list = listStart ? listItems(listItemsSaid ?? '') : undefined;
  const main = cap(rest.replace(/^[\s,.:-]+|[\s,.:-]+$/g, '')) || (list ? 'To-do list' : '');
  if (!main && !Object.keys(parts).length) return null;
  const order = ['meal', 'due', 'by', 'date', 'time', 'priority', 'severity', 'minutes', 'miles', 'km', 'with', 'notes'];
  const listed = order.filter(k => parts[k]).map(k => ({
    key: k, value: parts[k],
    label: LABELS[k](k === 'due' || k === 'by' || k === 'date' ? readableDate(parts[k]) : parts[k]),
  }));
  return {
    topic, main, parts: listed, saveNow,
    ...(link ? { link } : {}),
    ...(unmatchedLink ? { unmatchedLink } : {}),
    ...(list ? { list } : {}),
    text: [main, ...listed.map(p => `${p.key}: ${p.value}`)].join(' | '),
  };
}
