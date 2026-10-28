import { describe, it, expect } from 'vitest';
import { dueReminders, relativeLabel, clockLabel, loadDismissed, saveDismissed } from '@/utils/dueReminders';

const now = new Date(2026, 9, 27, 9, 25);
const doses = [
  { medicationPostId: 1, medicationName: 'Oregano oil', dosage: '1 drop', time: '08:00' },
  { medicationPostId: 2, medicationName: 'Vitamin D', dosage: '1,000 IU', time: '09:00' },
  { medicationPostId: 1, medicationName: 'Oregano oil', dosage: '1 drop', time: '20:00' },
];
const slots = [
  { key: 'r1|2026-10-27|07:00', time: '07:00', routine: { id: 9, name: 'Ocean breathing', minutes: 5 } },
  { key: 'r2|2026-10-27|18:30', time: '18:30', routine: { id: 8, name: 'Evening walk', minutes: 30 } },
];

describe('dueReminders', () => {
  it('splits today into due (time passed, not ticked) and later, oldest first', () => {
    const r = dueReminders({ doses, isTaken: d => d.medicationPostId === 2, slots, isDone: () => false, now });
    expect(r.due.map(i => i.name)).toEqual(['Ocean breathing', 'Oregano oil']);
    expect(r.later.map(i => `${i.name} ${i.time}`)).toEqual(['Evening walk 18:30', 'Oregano oil 20:00']);
    expect(r.due[0]).toMatchObject({ kind: 'exercise', detail: '5 min' });
  });

  it('leaves out what\'s ticked and what\'s switched off', () => {
    const r = dueReminders({ doses, isTaken: () => true, slots, isDone: s => s.time === '07:00', now, exercise: true });
    expect(r.due).toEqual([]);
    expect(dueReminders({ doses, isTaken: () => false, slots, isDone: () => false, now, meds: false }).due.map(i => i.kind)).toEqual(['exercise']);
  });

  it('labels times', () => {
    expect(clockLabel('08:00')).toBe('8:00 AM');
    expect(clockLabel('20:30')).toBe('8:30 PM');
    expect(relativeLabel(new Date(2026, 9, 27, 9, 0), now)).toBe('25 min ago');
    expect(relativeLabel(new Date(2026, 9, 27, 7, 0), now)).toBe('2 h ago');
    expect(relativeLabel(new Date(2026, 9, 27, 10, 5), now)).toBe('in 40 min');
    expect(relativeLabel(now, now)).toBe('now');
  });
});

describe('dismissed reminders', () => {
  it('last the day they were dismissed, then start fresh', () => {
    saveDismissed('2026-10-27', new Set(['med-1-08:00']));
    expect([...loadDismissed('2026-10-27')]).toEqual(['med-1-08:00']);
    expect(loadDismissed('2026-10-28').size).toBe(0);
  });
});


describe('meetings, events, bills and tasks', () => {
  const base = { doses: [], isTaken: () => false, slots: [], isDone: () => false, now };
  it('makes a meeting due 15 minutes before it starts, for an hour, and lists the rest of the day\'s', () => {
    const r = dueReminders({ ...base, events: [
      { id: 1, name: 'Standup', kind: 'meeting', time: '09:35', detail: 'Meeting' },  // in 10 min → due
      { id: 2, name: 'Dentist', kind: 'event', time: '15:00', detail: 'Event' },      // later
      { id: 3, name: 'Breakfast club', kind: 'event', time: '08:00', detail: '' },    // 85 min ago → over
      { id: 4, name: 'Birthday', kind: 'event', time: null, detail: '' },             // all day → later
    ] });
    expect(r.due.map(i => i.name)).toEqual(['Standup']);
    expect(r.later.map(i => `${i.name}${i.note ? ` (${i.note})` : ''}`)).toEqual(['Birthday (All day)', 'Dentist']);
  });

  it('makes bills and tasks due today or overdue, oldest first', () => {
    const r = dueReminders({ ...base,
      bills: [{ id: 'b1', name: 'Electric', due: '2026-10-25', detail: '$95.00' }, { id: 'b2', name: 'Rent', due: '2026-11-01', detail: '' }],
      tasks: [{ id: 7, name: 'Call the dentist', deadline: '2026-10-27' }, { id: 8, name: 'Taxes', deadline: '2027-04-15' }],
    });
    expect(r.due.map(i => `${i.name}: ${i.note}`)).toEqual(['Electric: Overdue · Oct 25', 'Call the dentist: Due today']);
    expect(r.due.map(i => i.key)).toEqual(['bill-b1-2026-10-25', 'task-7-2026-10-27']);
  });
});
