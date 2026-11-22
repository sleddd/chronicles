import { describe, it, expect } from 'vitest';

describe('isReservedImportColumn', () => {
  it('refuses the app’s own keys, the public-shelf flag and object names — and lets ordinary columns through', async () => {
    const { isReservedImportColumn } = await import('../../utils/csv.js');
    for (const name of ['_doseLink', '_importKey', '__proto__', 'onPublicShelf', ' ONPUBLICSHELF ', 'constructor', 'prototype']) {
      expect(isReservedImportColumn(name)).toBe(true);
    }
    // List-valued fields: a column of text there would crash the form that reads it
    for (const name of ['tags', 'Tags', 'items', 'linkedRecipeIds', 'checklist']) {
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

describe('csvFieldText', () => {
  it('writes lists and objects out in words, never [object Object]', async () => {
    const { csvFieldText } = await import('../../utils/csv.js');
    // Recipe ingredients and steps
    expect(csvFieldText([{ id: 'a', amount: '2 cups', name: 'rice' }, { id: 'b', amount: '', name: 'salt', checked: true }])).toBe('2 cups rice | [x] salt');
    expect(csvFieldText([{ id: 's', title: 'Rinse', text: 'Until clear' }, { id: 't', title: '', text: 'Simmer' }])).toBe('Rinse: Until clear | Simmer');
    // Shopping list items, a to-do list, wins and priorities
    expect(csvFieldText([{ id: '1', name: 'Milk', category: 'dairy', checked: false }])).toBe('[ ] Milk (category: dairy)');
    expect(csvFieldText([{ id: '1', text: 'Laundry', done: true }, { id: '2', text: 'Dishes', done: false }])).toBe('[x] Laundry | [ ] Dishes');
    expect(csvFieldText([{ id: 'w', text: 'Finished the draft' }])).toBe('Finished the draft');
    // A meal's nutrient sources
    expect(csvFieldText({ iron: 'ai', vitaminD: 'manual' })).toBe('iron: ai, vitaminD: manual');
    // A media cover: where it came from, never the picture
    expect(csvFieldText({ dataUrl: 'data:image/jpeg;base64,AAAA', source: 'Open Library' })).toBe('source: Open Library');
    // Plain values as before
    expect(csvFieldText(true)).toBe('Yes');
    expect(csvFieldText(null)).toBe('');
    expect(csvFieldText(['a', 'b'])).toBe('a | b');
  });

  it('names a training phase’s hours by category', async () => {
    const { csvFieldText } = await import('../../utils/csv.js');
    const row = {
      categories: [{ id: 'c1', name: 'Aerobic', exerciseTypes: ['running', 'walking'] }, { id: 'c2', name: 'Core', exerciseTypes: [] }],
      phases: [{ id: 'p1', name: 'Phase 1', weeks: '6', targets: { c1: '5', c2: '0.5' } }],
    };
    expect(csvFieldText(row.categories, row)).toBe('Aerobic (exerciseTypes: running, walking) | Core');
    expect(csvFieldText(row.phases, row)).toBe('Phase 1 (weeks: 6, targets: Aerobic: 5, Core: 0.5)');
  });
});
