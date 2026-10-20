/**
 * Field mapping between Chronicles Event/Meeting entries and Google Calendar events.
 * DOM-free (regex-based HTML stripping) so it runs in vitest's node environment.
 */
import type { GoogleEvent, GoogleEventPayload, GoogleEventTime } from '../types/calendarSync.js';

export type SyncTopicType = 'event' | 'meeting';

/** The custom-field keys the mapper reads/writes (subset of Event/MeetingFieldValues). */
export interface MappedFields {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  address: string;
  phone: string;
  notes: string;
  meetingTopic?: string;
  attendees?: string;
  calendarTitle?: string;
  noCalendarSync?: boolean;
  /** Built-in name fields — the primary label when the entry has no text. */
  eventName?: string;
  meetingName?: string;
}

const PHONE_PREFIX = 'Phone: ';
const ATTENDEES_PREFIX = 'Attendees: ';

/** Strip HTML to plain text and return the first non-empty line (max 200 chars). */
export function extractTitle(html: string): string {
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed) return trimmed.slice(0, 200);
  }
  return '';
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatLocalTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse "YYYY-MM-DD" (+ optional "HH:MM") as a local-time Date. */
function parseLocal(date: string, time?: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

function addDays(date: string, days: number): string {
  const d = parseLocal(date);
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
}

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Build the Google event description from the notes/phone/attendees fields. */
export function buildDescription(fields: MappedFields): string {
  const parts: string[] = [];
  if (fields.notes?.trim()) parts.push(fields.notes.trim());
  if (fields.phone?.trim()) parts.push(`${PHONE_PREFIX}${fields.phone.trim()}`);
  if (fields.attendees?.trim()) parts.push(`${ATTENDEES_PREFIX}${fields.attendees.trim()}`);
  return parts.join('\n');
}

/** Inverse of buildDescription — extracts Phone/Attendees lines back into fields. */
export function parseDescription(description: string): { notes: string; phone: string; attendees: string } {
  const noteLines: string[] = [];
  let phone = '';
  let attendees = '';
  for (const line of (description || '').split('\n')) {
    if (line.startsWith(PHONE_PREFIX) && !phone) {
      phone = line.slice(PHONE_PREFIX.length);
    } else if (line.startsWith(ATTENDEES_PREFIX) && !attendees) {
      attendees = line.slice(ATTENDEES_PREFIX.length);
    } else {
      noteLines.push(line);
    }
  }
  return { notes: noteLines.join('\n').trim(), phone, attendees };
}

function buildLocation(fields: MappedFields): string {
  const location = fields.location?.trim() || '';
  const address = fields.address?.trim() || '';
  if (location && address) return `${location}, ${address}`;
  return location || address;
}

/**
 * Build the Google event payload for an entry. Returns null when the entry has
 * no startDate (not syncable).
 */
export function toGooglePayload(
  fields: MappedFields,
  content: string,
  topicType: SyncTopicType,
  entryId: number,
): GoogleEventPayload | null {
  if (!fields.startDate) return null;

  const title = topicType === 'meeting'
    ? (fields.meetingName?.trim() || fields.meetingTopic?.trim() || fields.calendarTitle?.trim() || extractTitle(content))
    : (fields.eventName?.trim() || fields.calendarTitle?.trim() || extractTitle(content));

  let start: GoogleEventTime;
  let end: GoogleEventTime;
  if (fields.startTime) {
    const tz = browserTimeZone();
    start = { dateTime: `${fields.startDate}T${fields.startTime}:00`, timeZone: tz };
    if (fields.endDate || fields.endTime) {
      const endDate = fields.endDate || fields.startDate;
      const endTime = fields.endTime || fields.startTime;
      end = { dateTime: `${endDate}T${endTime}:00`, timeZone: tz };
    } else {
      const plusHour = new Date(parseLocal(fields.startDate, fields.startTime).getTime() + 60 * 60 * 1000);
      end = { dateTime: `${formatLocalDate(plusHour)}T${formatLocalTime(plusHour)}:00`, timeZone: tz };
    }
  } else {
    // All-day event — Google end date is exclusive
    start = { date: fields.startDate };
    end = { date: addDays(fields.endDate || fields.startDate, 1) };
  }

  // Only the title, times and place go to Google — never notes, attendees or
  // phone (the description is left out, so an update never touches it)
  return {
    summary: title || (topicType === 'meeting' ? 'Meeting' : 'Event'),
    location: buildLocation(fields),
    start,
    end,
    extendedProperties: { private: { chroniclesId: String(entryId) } },
  };
}

/**
 * Map a Google event back onto Chronicles custom-field values. The event's
 * description (notes, phone, attendees) is read only when importing a new
 * event (`withDetails`) — a linked entry's own details are never overwritten
 * from Google, since Chronicles doesn't send them there.
 */
export function fromGoogleEvent(event: GoogleEvent, topicType: SyncTopicType, { withDetails = false } = {}): Partial<MappedFields> {
  const fields: Partial<MappedFields> = {};

  if (event.start?.date) {
    fields.startDate = event.start.date;
    fields.startTime = '';
    fields.endTime = '';
    // Google all-day end is exclusive; single-day events keep endDate empty
    const inclusiveEnd = event.end?.date ? addDays(event.end.date, -1) : event.start.date;
    fields.endDate = inclusiveEnd !== event.start.date ? inclusiveEnd : '';
  } else if (event.start?.dateTime) {
    const start = new Date(event.start.dateTime);
    fields.startDate = formatLocalDate(start);
    fields.startTime = formatLocalTime(start);
    if (event.end?.dateTime) {
      const end = new Date(event.end.dateTime);
      fields.endDate = formatLocalDate(end);
      fields.endTime = formatLocalTime(end);
    }
  }

  const location = event.location || '';
  fields.location = location;
  fields.address = '';

  if (withDetails) {
    const { notes, phone, attendees } = parseDescription(event.description || '');
    fields.notes = notes;
    fields.phone = phone;
    if (topicType === 'meeting') fields.attendees = attendees;
  }
  if (topicType === 'meeting') {
    fields.meetingTopic = event.summary || '';
  } else {
    fields.calendarTitle = event.summary || '';
  }

  return fields;
}

/**
 * Canonicalize a payload for hashing so that local payloads (naive dateTime +
 * timeZone name) and Google responses (dateTime with UTC offset) compare equal.
 * Timed values are reduced to epoch minutes; all-day values stay date strings.
 */
export function canonicalizePayload(payload: {
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
}): string {
  const timeKey = (t?: GoogleEventTime): string => {
    if (!t) return '';
    if (t.date) return `d:${t.date}`;
    if (t.dateTime) {
      // Local payloads have no offset — parse as local time (the payload's
      // timeZone is always the browser zone). Google responses include an offset.
      const ms = /[zZ]|[+-]\d\d:\d\d$/.test(t.dateTime)
        ? Date.parse(t.dateTime)
        : parseLocalDateTime(t.dateTime);
      return `t:${Math.round(ms / 60000)}`;
    }
    return '';
  };
  return JSON.stringify([
    payload.summary || '',
    '', // description: not synced (kept as a blank slot so earlier hashes still match)
    payload.location || '',
    timeKey(payload.start),
    timeKey(payload.end),
  ]);
}

function parseLocalDateTime(dateTime: string): number {
  const [datePart, timePart] = dateTime.split('T');
  return parseLocal(datePart, timePart?.slice(0, 5)).getTime();
}

/** SHA-256 hex of the canonicalized payload. */
export async function computeSyncHash(payload: Parameters<typeof canonicalizePayload>[0]): Promise<string> {
  const data = new TextEncoder().encode(canonicalizePayload(payload));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
