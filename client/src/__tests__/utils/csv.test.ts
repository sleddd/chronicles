import { describe, it, expect } from 'vitest';

describe('isReservedImportColumn', () => {
  it('refuses the app’s own keys, the public-shelf flag and object names — and lets ordinary columns through', async () => {
    const { isReservedImportColumn } = await import('../../utils/csv.js');
    for (const name of ['_doseLink', '_importKey', '__proto__', 'onPublicShelf', ' ONPUBLICSHELF ', 'constructor', 'prototype']) {
      expect(isReservedImportColumn(name)).toBe(true);
    }
    for (const name of ['Author', 'Rating', 'notes', 'On shelf']) {
      expect(isReservedImportColumn(name)).toBe(false);
    }
  });
});

describe('safeAccent', () => {
  it('takes only a hex colour, else the default accent', async () => {
    const { safeAccent, DEFAULT_ACCENT_COLOR } = await import('../../styles/accent.js');
    expect(safeAccent('#C0FFEE')).toBe('#C0FFEE');
    expect(safeAccent('#abc')).toBe('#abc');
    for (const bad of ['red; background:url(/api/x)', '#12345', 'transparent', '', null, 7]) {
      expect(safeAccent(bad)).toBe(DEFAULT_ACCENT_COLOR);
    }
  });

  it('opens a retuned preset saved in its old shade as the new one (Taupe)', async () => {
    const { safeAccent } = await import('../../styles/accent.js');
    expect(safeAccent('#8a7564')).toBe('#a39080');
    expect(safeAccent('#8A7564')).toBe('#a39080');
    expect(safeAccent('#9c8877')).toBe('#a39080');
  });
});

describe('guardImportedFields', () => {
  it('starts an Event / Meeting row with calendar sync off, whatever the file says', async () => {
    const { guardImportedFields } = await import('../../utils/csv.js');
    const out = guardImportedFields({ startDate: '2026-12-01', location: 'Cafe', noCalendarSync: false }, { calendarTopic: true });
    expect(out).toEqual({ startDate: '2026-12-01', location: 'Cafe', noCalendarSync: true });
    expect(guardImportedFields({ dueDate: '2026-12-01' }, { calendarTopic: false })).toEqual({ dueDate: '2026-12-01' });
  });

  it('drops a date or time field that is not a date or a time', async () => {
    const { guardImportedFields } = await import('../../utils/csv.js');
    const out = guardImportedFields({
      startDate: '2026-12-01\r\nEND:VEVENT', endDate: '12/02/2026', startTime: '9am', endTime: '10:30',
      repeatUntil: 'never', startOn: '2026-01-05', notes: 'Bring 2026-12-01\nnotes', allDay: true,
    }, { calendarTopic: false });
    expect(out).toEqual({ endTime: '10:30', startOn: '2026-01-05', notes: 'Bring 2026-12-01\nnotes', allDay: true });
  });
});
