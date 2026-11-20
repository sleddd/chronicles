import type { DecryptedPost } from '@shared/crypto/types';
import { calendarDayFor, isEventTopic } from './calendarItems.js';
import { repeatRuleOf, occurrencesBetween } from './recurrence.js';

/*
 * Events and meetings on a range of days, repeats included (pure). The Planner
 * draws them on its lanes; AI task planning reads only their times, as the
 * hours that are already taken.
 */

export interface EventOccurrence {
  entry: DecryptedPost;
  /** The entry's topic ("Event", "Meeting") */
  topicName: string;
  fields: Record<string, unknown>;
  day: string;
  /** "HH:MM", or '' for an all-day event */
  time: string;
  /** Minutes from midnight; undefined = all day. An hour long when it has no end, or an end before its start */
  start?: number;
  end?: number;
}

export function minutesOf(hhmm: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return undefined;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return mins >= 0 && mins < 24 * 60 ? mins : undefined;
}

export function eventOccurrences(entries: readonly DecryptedPost[], topics: readonly { id: number; name: string }[], from: string, to: string): EventOccurrence[] {
  const names = new Map(topics.map(t => [t.id, t.name]));
  const out: EventOccurrence[] = [];
  for (const entry of entries) {
    const meta = entry.metadata as Record<string, unknown> | undefined;
    const topicName = names.get(meta?._taxonomyId as number);
    if (!topicName || !isEventTopic(topicName)) continue;
    const first = calendarDayFor(entry, topicName);
    if (!first) continue;
    const fields = (meta?._customFields as Record<string, unknown>) ?? {};
    const rule = repeatRuleOf(fields);
    const days = rule ? occurrencesBetween(first, rule, from, to) : first >= from && first <= to ? [first] : [];
    const time = typeof fields.startTime === 'string' && fields.startTime && !fields.allDay ? fields.startTime : '';
    const start = minutesOf(time);
    const endAt = minutesOf(typeof fields.endTime === 'string' ? fields.endTime : '');
    const end = start === undefined ? undefined : endAt !== undefined && endAt > start ? endAt : start + 60;
    for (const day of days) out.push({ entry, topicName, fields, day, time, start, end });
  }
  return out;
}
