/**
 * Minimal iCalendar (RFC 5545) generator for the Apple Calendar subscription feed.
 * Timed events are emitted in UTC (Z form) to avoid VTIMEZONE blocks.
 */

export interface IcsEventInput {
  uid: string;
  summary: string;
  /** Left out unless the user turned on event details for the feed */
  description?: string;
  location: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** HH:MM — empty string means all-day */
  startTime: string;
  /** YYYY-MM-DD — empty falls back to startDate */
  endDate: string;
  /** HH:MM */
  endTime: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Escape TEXT values per RFC 5545 §3.3.11. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Fold a content line to 75 octets per RFC 5545 §3.1 (UTF-8 safe). */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let currentBytes = 0;
  let limit = 75;
  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > limit) {
      out.push(current);
      current = ' ';
      currentBytes = 1;
      limit = 75;
    }
    current += char;
    currentBytes += charBytes;
  }
  if (current) out.push(current);
  return out.join('\r\n');
}

/** Parse local "YYYY-MM-DD" + "HH:MM" and format as UTC basic form (…Z). */
function toUtcStamp(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const local = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
  return `${local.getUTCFullYear()}${pad(local.getUTCMonth() + 1)}${pad(local.getUTCDate())}T${pad(local.getUTCHours())}${pad(local.getUTCMinutes())}00Z`;
}

function toDateValue(date: string): string {
  return date.replace(/-/g, '');
}

function addDaysDateValue(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}`;
}

export function generateIcs(events: IcsEventInput[], now: Date = new Date()): string {
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Chronicles//Calendar Sync//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Chronicles',
  ];

  for (const ev of events) {
    if (!ev.startDate) continue;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeIcsText(ev.uid)}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    if (ev.startTime) {
      const endDate = ev.endDate || ev.startDate;
      const endTime = ev.endTime || ev.startTime;
      lines.push(`DTSTART:${toUtcStamp(ev.startDate, ev.startTime)}`);
      // Match Google mapping: missing end means +1 hour
      const dtend = (ev.endDate || ev.endTime)
        ? toUtcStamp(endDate, endTime)
        : plusOneHour(ev.startDate, ev.startTime);
      lines.push(`DTEND:${dtend}`);
    } else {
      // All-day: DTEND is exclusive
      lines.push(`DTSTART;VALUE=DATE:${toDateValue(ev.startDate)}`);
      lines.push(`DTEND;VALUE=DATE:${addDaysDateValue(ev.endDate || ev.startDate, 1)}`);
    }
    if (ev.summary) lines.push(`SUMMARY:${escapeIcsText(ev.summary)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${escapeIcsText(ev.location)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

function plusOneHour(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const local = new Date(y, m - 1, d, (hh || 0) + 1, mm || 0, 0, 0);
  return `${local.getUTCFullYear()}${pad(local.getUTCMonth() + 1)}${pad(local.getUTCDate())}T${pad(local.getUTCHours())}${pad(local.getUTCMinutes())}00Z`;
}
