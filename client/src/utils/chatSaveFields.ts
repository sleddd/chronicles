/**
 * `/save <topic> …` from the AI chat, shaped like the topic's own form.
 *
 * The model writes the save as a short main part, then optional
 * `key: value` parts split by " | ":
 *
 *   /save Symptom Headache, Nausea | severity: 6 | notes: after skipping lunch
 *
 * `chatSaveEntry` turns that into the topic's fields (symptom chips, severity,
 * when…) and the entry text the journal would give it, so a chat save looks
 * like one made in the editor — never a paragraph in a name field.
 * `chatSaveFormats` describes the format of each of the user's topics for the
 * system prompt. Pure — no stores, no network.
 */

import type { UserFieldDef } from '../types/userFields.js';
import { exerciseSummary, EXERCISE_TYPES } from './exerciseSummary.js';
import { generatedEntryText } from './entryText.js';
import { mealForNow, nowTime } from './foodLog.js';
import { toDateStr } from './dateUtils.js';

type Kind =
  | 'symptom' | 'meals' | 'exercise' | 'task' | 'goal' | 'milestone' | 'event' | 'meeting'
  | 'medication' | 'allergy' | 'change';

const KIND_BY_TOPIC: Record<string, Kind> = {
  symptom: 'symptom', symptoms: 'symptom',
  meals: 'meals', meal: 'meals',
  exercise: 'exercise',
  task: 'task', tasks: 'task', todo: 'task', todos: 'task',
  goal: 'goal', goals: 'goal',
  milestone: 'milestone', milestones: 'milestone',
  event: 'event', events: 'event',
  meeting: 'meeting', meetings: 'meeting',
  medication: 'medication', medications: 'medication',
  allergy: 'allergy', allergies: 'allergy',
  change: 'change', changes: 'change',
};

/** The longest a name may be before it's treated as a paragraph */
const MAX_NAME = 80;

/** "Headache, Nausea | severity: 6 | notes: …" → main + lower-cased keys */
export function splitSaveText(text: string): { main: string; parts: Record<string, string> } {
  const [first, ...rest] = text.split(/\s*\|\s*/);
  const parts: Record<string, string> = {};
  const loose: string[] = [];
  for (const seg of rest) {
    const m = seg.match(/^([^:]{1,30}):\s*([\s\S]*)$/);
    if (m && m[2].trim()) parts[m[1].trim().toLowerCase()] = m[2].trim();
    else if (seg.trim()) loose.push(seg.trim());
  }
  // A part with no "key:" is kept as a note rather than lost
  if (loose.length) parts.notes = [parts.notes, ...loose].filter(Boolean).join(' ');
  return { main: (first ?? '').trim(), parts };
}

const pick = (parts: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) if (parts[k]) return parts[k];
  return '';
};

/** "2026-10-24", "today", "tomorrow" → a date string; anything else → '' */
export function chatDate(value: string, now: Date): string {
  const v = value.trim().toLowerCase();
  if (v === 'today') return toDateStr(now);
  if (v === 'tomorrow') return toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  if (v === 'yesterday') return toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
}

/** "19:00", "7pm", "7:30 am" → "HH:MM"; anything else → '' */
export function chatTime(value: string): string {
  const m = value.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return '';
  let h = Number(m[1]);
  const min = Number(m[2] ?? '0');
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59 || (!m[2] && !m[3])) return '';
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const number = (value: string) => {
  const m = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m ? m[0] : '';
};

const severity = (value: string): number | undefined => {
  const n = Math.round(Number(number(value)));
  return n >= 1 ? Math.min(10, n) : undefined;
};

/** A paragraph where a name belongs: its first clause, a few words, as the
    name — the whole text goes to the notes so nothing is lost */
function nameAndNotes(main: string, notes: string): { name: string; notes: string } {
  if (main.length <= MAX_NAME) return { name: main, notes };
  const clause = main.split(/[.;:\n!?]/)[0].trim();
  const words = clause.split(/\s+/);
  const name = words.length > 8 ? `${words.slice(0, 8).join(' ')}…` : clause;
  return { name, notes: [notes, main].filter(Boolean).join('\n') };
}

/** "Headache and nausea" / "headache; nausea" → "Headache, Nausea" (chips) */
function symptomNames(main: string): string {
  return main
    .split(/\s*(?:,|;|\/|\band\b|&)\s*/i)
    .map(s => s.trim().replace(/\.$/, ''))
    .filter(Boolean)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(', ');
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface ChatSaveEntry {
  /** The entry's text as HTML ('' = none, e.g. fields-only) */
  content: string;
  /** The topic's fields, or null for a plain text topic */
  customFields: Record<string, unknown> | null;
}

/**
 * The fields and text a chat save writes for this topic. `null` fields means
 * a plain text topic (Journal, Idea…): the caller saves the text as it is.
 */
export function chatSaveEntry(topicName: string, text: string, defs: UserFieldDef[] = [], now = new Date()): ChatSaveEntry {
  const t = topicName.trim().toLowerCase();
  const kind = KIND_BY_TOPIC[t];
  const { main, parts } = splitSaveText(text);
  const notesIn = pick(parts, 'notes', 'note', 'details');
  const date = (...keys: string[]) => chatDate(pick(parts, ...keys), now);
  const time = (...keys: string[]) => chatTime(pick(parts, ...keys));
  const titled = (name: string) => (name ? `<p>${escapeHtml(name)}</p>` : '');

  if (!kind) {
    if (defs.length === 0) return { content: '', customFields: null };
    // A topic with fields set in Topics: the main part fills the title-like
    // field, "Label: value" parts fill the field with that label
    const values: Record<string, unknown> = {};
    const titleDef = defs.find(d => /title|name|quote/i.test(d.label)) ?? defs[0];
    const byLabel = new Map(defs.map(d => [d.label.trim().toLowerCase(), d]));
    if (main) values[titleDef.id] = main;
    for (const [key, value] of Object.entries(parts)) {
      const def = byLabel.get(key);
      if (!def) continue;
      if (def.type === 'boolean') values[def.id] = /^(y|yes|true)$/i.test(value);
      else if (def.type === 'number') values[def.id] = number(value);
      else if (def.type === 'date') values[def.id] = chatDate(value, now);
      else values[def.id] = value;
    }
    const fields = { _userFields: values };
    const summary = generatedEntryText(t, fields, defs);
    return { content: titled(summary), customFields: fields };
  }

  if (kind === 'symptom') {
    const { name, notes } = nameAndNotes(main, notesIn);
    const symptomName = symptomNames(name);
    const sev = severity(pick(parts, 'severity', 'level'));
    return {
      content: titled(symptomName),
      customFields: {
        symptomName,
        ...(sev ? { severity: sev } : {}),
        occurredDate: date('date', 'when', 'day') || toDateStr(now),
        occurredTime: time('time', 'at') || nowTime(now),
        duration: number(pick(parts, 'minutes', 'lasted', 'duration')),
        notes,
      },
    };
  }
  if (kind === 'meals') {
    const { name, notes } = nameAndNotes(main, notesIn);
    return {
      content: titled(name),
      customFields: {
        mealDescription: name,
        mealType: pick(parts, 'meal', 'type').toLowerCase() || mealForNow(now),
        consumedDate: date('date', 'when', 'day') || toDateStr(now),
        consumedTime: time('time', 'at') || nowTime(now),
        ingredients: pick(parts, 'ingredients'),
        notes,
      },
    };
  }
  if (kind === 'exercise') {
    const typeText = main.toLowerCase();
    const type = EXERCISE_TYPES.find(x => typeText.includes(x.value) || typeText.includes(x.label.toLowerCase()))?.value ?? 'other';
    const intensityText = pick(parts, 'intensity', 'effort').toLowerCase();
    const intensity = /easy|low|light/.test(intensityText) ? 'low' : /hard|high|intense/.test(intensityText) ? 'high' : intensityText ? 'medium' : '';
    const km = !!parts.km;
    const fields: Record<string, unknown> = {
      exerciseType: type,
      duration: number(pick(parts, 'minutes', 'duration', 'min')),
      distance: number(pick(parts, 'miles', 'km', 'distance')),
      distanceUnit: km ? 'km' : 'miles',
      ...(intensity ? { intensity } : {}),
      performedDate: date('date', 'when', 'day') || toDateStr(now),
      performedTime: time('time', 'at') || nowTime(now),
      // An activity the chips don't name ("Pilates") stays in the notes
      notes: [type === 'other' && main ? main : '', notesIn].filter(Boolean).join(' · '),
    };
    return { content: titled(exerciseSummary(fields)), customFields: fields };
  }
  if (kind === 'task') {
    const { name, notes } = nameAndNotes(main, notesIn);
    const p = pick(parts, 'priority').toLowerCase();
    return {
      content: titled(name),
      customFields: {
        taskDescription: name,
        ...(['low', 'medium', 'high', 'urgent'].includes(p) ? { priority: p } : {}),
        ...(date('due', 'deadline', 'by', 'date') ? { deadline: date('due', 'deadline', 'by', 'date') } : {}),
        isCompleted: false,
        notes,
      },
    };
  }
  if (kind === 'goal') {
    const { name, notes } = nameAndNotes(main, notesIn);
    const type = pick(parts, 'type').toLowerCase();
    return {
      content: titled(name),
      customFields: {
        goalObjective: name,
        goalStatus: 'new',
        ...(/long/.test(type) ? { goalType: 'long_term' } : /short/.test(type) ? { goalType: 'short_term' } : {}),
        ...(date('by', 'target', 'date') ? { targetDate: date('by', 'target', 'date') } : {}),
        notes,
      },
    };
  }
  if (kind === 'milestone') {
    const { name, notes } = nameAndNotes(main, notesIn);
    return {
      content: titled(name),
      customFields: {
        milestoneObjective: name,
        ...(date('by', 'target', 'date') ? { targetDate: date('by', 'target', 'date') } : {}),
        notes,
      },
    };
  }
  if (kind === 'event' || kind === 'meeting') {
    const { name, notes } = nameAndNotes(main, notesIn);
    const startDate = date('date', 'day', 'on', 'when') || toDateStr(now);
    const startTime = time('time', 'at', 'start', 'starts');
    const endTime = time('end', 'ends', 'until');
    return {
      content: titled(name),
      customFields: {
        [kind === 'meeting' ? 'meetingName' : 'eventName']: name,
        startDate, endDate: startDate,
        ...(startTime ? { startTime } : {}),
        ...(endTime ? { endTime } : {}),
        ...(startTime ? {} : { allDay: true }),
        location: pick(parts, 'where', 'location', 'place'),
        ...(kind === 'meeting' && pick(parts, 'with', 'attendees') ? { attendees: pick(parts, 'with', 'attendees') } : {}),
        notes,
      },
    };
  }
  if (kind === 'medication') {
    const { name, notes } = nameAndNotes(main, notesIn);
    const often = pick(parts, 'how often', 'frequency', 'often').toLowerCase();
    const frequency = /twice|2x/.test(often) ? 'twice_daily' : /need/.test(often) ? 'as_needed' : /week/.test(often) ? 'weekly' : often ? 'once_daily' : '';
    return {
      content: titled(name),
      customFields: {
        medicationName: name,
        dosage: pick(parts, 'dosage', 'dose'),
        ...(frequency ? { frequency } : {}),
        isActive: true,
        notes,
      },
    };
  }
  if (kind === 'allergy') {
    const { name, notes } = nameAndNotes(main, notesIn);
    const sev = severity(pick(parts, 'severity', 'level'));
    return {
      content: titled(name),
      customFields: {
        allergen: name,
        reaction: pick(parts, 'reaction'),
        ...(sev ? { severity: sev } : {}),
        occurredDate: date('date', 'when', 'day') || toDateStr(now),
        occurredTime: time('time', 'at') || nowTime(now),
        notes,
      },
    };
  }
  // kind === 'change'
  const { name, notes } = nameAndNotes(main, notesIn);
  return {
    content: titled(name),
    customFields: { changeWhat: name, changeDate: date('date', 'when', 'day') || toDateStr(now), notes },
  };
}

/** The save format for one topic, for the system prompt ('' = plain text) */
function formatFor(topicName: string, defs: UserFieldDef[]): string {
  const n = topicName;
  switch (KIND_BY_TOPIC[n.trim().toLowerCase()]) {
    case 'symptom': return `\`/save ${n} Headache, Nausea | severity: 6 | notes: after skipping lunch\` — symptom names only (1–3 words each, comma-separated, never a sentence); severity 1–10`;
    case 'meals': return `\`/save ${n} Turkey sandwich and an apple | meal: lunch\` — what was eaten in a few words; meal is breakfast, lunch, dinner or snack`;
    case 'exercise': return `\`/save ${n} Walking | minutes: 30 | miles: 2 | intensity: easy\` — one of ${EXERCISE_TYPES.map(x => x.label).join(', ')}; intensity easy, medium or hard`;
    case 'task': return `\`/save ${n} Call the dentist | priority: high | due: 2026-10-24\` — a short to-do; priority low, medium, high or urgent`;
    case 'goal': return `\`/save ${n} Run a 10K | type: long-term | by: 2027-03-01\` — the goal in a few words; type short-term or long-term`;
    case 'milestone': return `\`/save ${n} First 5K under 30 minutes | by: 2026-12-01\``;
    case 'event': return `\`/save ${n} Dinner with Sam | date: 2026-10-24 | time: 19:00 | where: Luce\``;
    case 'meeting': return `\`/save ${n} Project check-in | date: 2026-10-24 | time: 10:00 | with: Sam, Priya\``;
    case 'medication': return `\`/save ${n} Vitamin D3 | dosage: 1,000 IU | how often: once daily\` — how often is once daily, twice daily, as needed or weekly`;
    case 'allergy': return `\`/save ${n} Peanuts | reaction: hives | severity: 7\``;
    case 'change': return `\`/save ${n} Started magnesium at night | date: 2026-10-20\` — what changed, in a few words`;
  }
  if (defs.length === 0) return '';
  const [first, ...rest] = defs;
  const example = rest.slice(0, 4).map(d => `${d.label}: …`).join(' | ');
  return `\`/save ${n} <${first.label}>${example ? ` | ${example}` : ''}\` — one short value per field`;
}

/**
 * One line per topic that has fields, telling the model how to word a save
 * for it. Topics without fields take short plain text.
 */
export function chatSaveFormats(topics: { id: number; name: string }[], fieldsByTopic: Record<number, UserFieldDef[]>): string[] {
  return topics
    .map(t => ({ name: t.name, line: formatFor(t.name, fieldsByTopic[t.id] ?? []) }))
    .filter(x => x.line)
    .map(x => `- ${x.name}: ${x.line}`);
}
