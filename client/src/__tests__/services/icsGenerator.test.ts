import { describe, it, expect } from 'vitest';
import { generateIcs, escapeIcsText, foldIcsLine, type IcsEventInput } from '../../services/icsGenerator.js';

const baseEvent: IcsEventInput = {
  uid: 'chronicles-1@chronicles',
  summary: 'Coffee',
  description: 'Bring laptop',
  location: 'Blue Bottle',
  startDate: '2026-07-20',
  startTime: '10:00',
  endDate: '2026-07-20',
  endTime: '11:00',
};

describe('escapeIcsText', () => {
  it('escapes backslashes, commas, semicolons, and newlines', () => {
    expect(escapeIcsText('a\\b')).toBe('a\\\\b');
    expect(escapeIcsText('a,b;c')).toBe('a\\,b\\;c');
    expect(escapeIcsText('line1\nline2')).toBe('line1\\nline2');
    expect(escapeIcsText('line1\r\nline2')).toBe('line1\\nline2');
  });
});

describe('foldIcsLine', () => {
  it('leaves short lines untouched', () => {
    expect(foldIcsLine('SUMMARY:Short')).toBe('SUMMARY:Short');
  });

  it('folds long lines at 75 octets with a leading space on continuations', () => {
    const line = 'DESCRIPTION:' + 'x'.repeat(200);
    const folded = foldIcsLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].length).toBeLessThanOrEqual(75);
    for (const cont of parts.slice(1)) {
      expect(cont.startsWith(' ')).toBe(true);
      expect(new TextEncoder().encode(cont).length).toBeLessThanOrEqual(75);
    }
    // Unfolding reproduces the original
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });

  it('never splits a multi-byte character across fold boundaries', () => {
    const line = 'SUMMARY:' + '🎉é'.repeat(40);
    const folded = foldIcsLine(line);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });
});

describe('generateIcs', () => {
  it('produces a valid VCALENDAR wrapper', () => {
    const ics = generateIcs([]);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('X-WR-CALNAME:Chronicles');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('emits timed events in UTC', () => {
    const ics = generateIcs([baseEvent]);
    const start = new Date(2026, 6, 20, 10, 0, 0); // local
    const expected = start.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    expect(ics).toContain(`DTSTART:${expected}`);
    expect(ics).toContain('UID:chronicles-1@chronicles');
    expect(ics).toContain('SUMMARY:Coffee');
  });

  it('defaults a missing end to one hour after start', () => {
    const ics = generateIcs([{ ...baseEvent, endDate: '', endTime: '' }]);
    const end = new Date(2026, 6, 20, 11, 0, 0);
    const expected = end.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    expect(ics).toContain(`DTEND:${expected}`);
  });

  it('emits all-day events with VALUE=DATE and exclusive end', () => {
    const ics = generateIcs([{ ...baseEvent, startTime: '', endDate: '', endTime: '' }]);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260720');
    expect(ics).toContain('DTEND;VALUE=DATE:20260721');
  });

  it('escapes text fields', () => {
    const ics = generateIcs([{ ...baseEvent, summary: 'Lunch, then; more', location: '' }]);
    expect(ics).toContain('SUMMARY:Lunch\\, then\\; more');
    expect(ics).not.toContain('LOCATION:');
  });

  it('skips events without a start date', () => {
    const ics = generateIcs([{ ...baseEvent, startDate: '' }]);
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('is deterministic for a fixed timestamp', () => {
    const now = new Date('2026-07-13T12:00:00Z');
    expect(generateIcs([baseEvent], now)).toBe(generateIcs([baseEvent], now));
  });
});

describe('dates and times that are not dates and times', () => {
  const base = { uid: 'e1', summary: 'Dentist', location: '', startDate: '2026-12-01', startTime: '', endDate: '', endTime: '' };

  it('leaves out an event whose start date carries lines of its own', () => {
    const ics = generateIcs([
      { ...base, startDate: '2026-12-01\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:x\r\nURL:https://evil.example' },
      { ...base, uid: 'e2', summary: 'Kept' },
    ]);
    expect(ics).not.toContain('evil.example');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain('SUMMARY:Kept');
  });

  it.each([
    ['startDate', '12/01/2026'],
    ['endDate', '2026-12-02\nX'],
    ['startTime', '9am'],
    ['endTime', '10:00\r\nATTACH:x'],
  ])('leaves out an event with a malformed %s', (field, value) => {
    const ics = generateIcs([{ ...base, startTime: '09:00', [field]: value }]);
    expect(ics).not.toContain('BEGIN:VEVENT');
  });
});
