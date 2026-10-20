import { describe, it, expect } from 'vitest';
import {
  extractTitle,
  buildDescription,
  parseDescription,
  toGooglePayload,
  fromGoogleEvent,
  canonicalizePayload,
  computeSyncHash,
  type MappedFields,
} from '../../services/calendarMapping.js';
import type { GoogleEvent } from '../../types/calendarSync.js';

const baseFields: MappedFields = {
  startDate: '2026-07-20',
  startTime: '10:00',
  endDate: '2026-07-20',
  endTime: '11:30',
  location: 'Blue Bottle',
  address: '123 Main St',
  phone: '555-0100',
  notes: 'Bring laptop',
};

describe('extractTitle', () => {
  it('returns the first non-empty text line of HTML', () => {
    expect(extractTitle('<h2>Dentist appointment</h2><p>Details</p>')).toBe('Dentist appointment');
    expect(extractTitle('<p></p><p>  Second line  </p>')).toBe('Second line');
  });

  it('decodes basic HTML entities', () => {
    expect(extractTitle('<p>Lunch &amp; Learn</p>')).toBe('Lunch & Learn');
  });

  it('returns empty string for empty content', () => {
    expect(extractTitle('')).toBe('');
    expect(extractTitle('<p><br></p>')).toBe('');
  });
});

describe('description round-trip', () => {
  it('builds and parses notes + phone + attendees losslessly', () => {
    const fields = { ...baseFields, attendees: 'Ana, Bo' };
    const description = buildDescription(fields);
    expect(description).toBe('Bring laptop\nPhone: 555-0100\nAttendees: Ana, Bo');
    expect(parseDescription(description)).toEqual({
      notes: 'Bring laptop',
      phone: '555-0100',
      attendees: 'Ana, Bo',
    });
  });

  it('handles a description with none of our markers', () => {
    expect(parseDescription('Just some text')).toEqual({ notes: 'Just some text', phone: '', attendees: '' });
  });
});

describe('toGooglePayload', () => {
  it('sends only the title, times and place, never notes, phone or attendees', () => {
    const payload = toGooglePayload({ ...baseFields, notes: 'Private', phone: '555-0100', attendees: 'Ana' }, '<h2>Coffee</h2>', 'meeting', 1)!;
    expect(payload).not.toHaveProperty('description');
    expect(JSON.stringify(payload)).not.toMatch(/Private|555-0100|Ana/);
  });

  it('returns null without a start date', () => {
    expect(toGooglePayload({ ...baseFields, startDate: '' }, '<p>x</p>', 'event', 1)).toBeNull();
  });

  it('builds a timed event with the browser timezone', () => {
    const payload = toGooglePayload(baseFields, '<h2>Coffee</h2>', 'event', 7)!;
    expect(payload.summary).toBe('Coffee');
    expect(payload.start).toEqual({
      dateTime: '2026-07-20T10:00:00',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    expect(payload.end.dateTime).toBe('2026-07-20T11:30:00');
    expect(payload.location).toBe('Blue Bottle, 123 Main St');
    expect(payload.extendedProperties!.private.chroniclesId).toBe('7');
  });

  it('defaults a missing end to one hour after start', () => {
    const payload = toGooglePayload({ ...baseFields, endDate: '', endTime: '' }, '<p>t</p>', 'event', 1)!;
    expect(payload.end.dateTime).toBe('2026-07-20T11:00:00');
  });

  it('crosses midnight when defaulting the end time', () => {
    const payload = toGooglePayload(
      { ...baseFields, startTime: '23:30', endDate: '', endTime: '' }, '<p>t</p>', 'event', 1,
    )!;
    expect(payload.end.dateTime).toBe('2026-07-21T00:30:00');
  });

  it('builds an all-day event with exclusive end date', () => {
    const payload = toGooglePayload(
      { ...baseFields, startTime: '', endDate: '', endTime: '' }, '<p>Trip</p>', 'event', 1,
    )!;
    expect(payload.start).toEqual({ date: '2026-07-20' });
    expect(payload.end).toEqual({ date: '2026-07-21' });
  });

  it('prefers meetingTopic as summary for meetings', () => {
    const payload = toGooglePayload(
      { ...baseFields, meetingTopic: 'Q3 Planning', attendees: 'Ana' }, '<p>ignored</p>', 'meeting', 1,
    )!;
    expect(payload.summary).toBe('Q3 Planning');
    expect(payload).not.toHaveProperty('description'); // attendees stay private
  });

  it('prefers calendarTitle over content for events', () => {
    const payload = toGooglePayload({ ...baseFields, calendarTitle: 'Renamed' }, '<h2>Original</h2>', 'event', 1)!;
    expect(payload.summary).toBe('Renamed');
  });
});

describe('fromGoogleEvent', () => {
  it('maps a timed Google event back to local fields', () => {
    // Construct an event whose UTC time equals local 2026-07-20 10:00 in this environment
    const local = new Date(2026, 6, 20, 10, 0, 0);
    const event: GoogleEvent = {
      id: 'g1',
      summary: 'Coffee',
      description: 'Bring laptop\nPhone: 555-0100',
      location: 'Blue Bottle, 123 Main St',
      start: { dateTime: local.toISOString() },
      end: { dateTime: new Date(local.getTime() + 90 * 60000).toISOString() },
    };
    const fields = fromGoogleEvent(event, 'event', { withDetails: true });
    expect(fields.startDate).toBe('2026-07-20');
    expect(fields.startTime).toBe('10:00');
    expect(fields.endTime).toBe('11:30');
    expect(fields.calendarTitle).toBe('Coffee');
    expect(fields.notes).toBe('Bring laptop');
    expect(fields.phone).toBe('555-0100');
    expect(fields.location).toBe('Blue Bottle, 123 Main St');
  });

  it('reads the description only when importing (withDetails)', () => {
    const event: GoogleEvent = { id: 'g3', summary: 'Coffee', description: 'Bring laptop\nPhone: 555-0100', start: { date: '2026-07-20' }, end: { date: '2026-07-21' } };
    const fields = fromGoogleEvent(event, 'event');
    expect(fields).not.toHaveProperty('notes');
    expect(fields).not.toHaveProperty('phone');
  });

  it('maps an all-day event with exclusive end back to inclusive dates', () => {
    const event: GoogleEvent = {
      id: 'g2', summary: 'Trip',
      start: { date: '2026-07-20' }, end: { date: '2026-07-23' },
    };
    const fields = fromGoogleEvent(event, 'event');
    expect(fields.startDate).toBe('2026-07-20');
    expect(fields.startTime).toBe('');
    expect(fields.endDate).toBe('2026-07-22');
  });

  it('leaves endDate empty for single-day all-day events', () => {
    const event: GoogleEvent = {
      id: 'g3', start: { date: '2026-07-20' }, end: { date: '2026-07-21' },
    };
    expect(fromGoogleEvent(event, 'event').endDate).toBe('');
  });

  it('maps summary to meetingTopic for meetings', () => {
    const event: GoogleEvent = { id: 'g4', summary: 'Standup', start: { date: '2026-07-20' }, end: { date: '2026-07-21' } };
    expect(fromGoogleEvent(event, 'meeting').meetingTopic).toBe('Standup');
  });
});

describe('canonicalization & hashing', () => {
  it('treats a local payload and its Google echo as equal', async () => {
    const localPayload = toGooglePayload(baseFields, '<h2>Coffee</h2>', 'event', 1)!;
    // Google echoes the event back with an offset-qualified dateTime
    const start = new Date(2026, 6, 20, 10, 0, 0);
    const end = new Date(2026, 6, 20, 11, 30, 0);
    const remote = {
      summary: 'Coffee',
      description: localPayload.description,
      location: localPayload.location,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    };
    expect(await computeSyncHash(localPayload)).toBe(await computeSyncHash(remote));
  });

  it('produces different hashes when a field changes', async () => {
    const a = toGooglePayload(baseFields, '<h2>Coffee</h2>', 'event', 1)!;
    const b = toGooglePayload({ ...baseFields, location: 'Elsewhere' }, '<h2>Coffee</h2>', 'event', 1)!;
    expect(await computeSyncHash(a)).not.toBe(await computeSyncHash(b));
  });

  it('round-trips a remote event through fromGoogleEvent → toGooglePayload with a stable hash', async () => {
    const local = new Date(2026, 6, 20, 10, 0, 0);
    const remoteEvent: GoogleEvent = {
      id: 'g1',
      summary: 'Renamed by Google',
      description: 'New notes\nPhone: 555-0100',
      location: 'New Place',
      start: { dateTime: local.toISOString() },
      end: { dateTime: new Date(local.getTime() + 3600_000).toISOString() },
    };
    const applied = { ...baseFields, ...fromGoogleEvent(remoteEvent, 'event') } as MappedFields;
    const rebuilt = toGooglePayload(applied, '<h2>Old title</h2>', 'event', 1)!;
    expect(await computeSyncHash(rebuilt)).toBe(await computeSyncHash({
      summary: remoteEvent.summary,
      description: remoteEvent.description,
      location: remoteEvent.location,
      start: remoteEvent.start,
      end: remoteEvent.end,
    }));
  });

  it('canonicalizes all-day and timed forms distinctly', () => {
    expect(canonicalizePayload({ start: { date: '2026-07-20' } }))
      .not.toBe(canonicalizePayload({ start: { dateTime: '2026-07-20T00:00:00' } }));
  });
});
