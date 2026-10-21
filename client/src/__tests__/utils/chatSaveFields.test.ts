import { describe, it, expect } from 'vitest';
import { chatSaveEntry, chatSaveFormats, chatTime, splitSaveText } from '@/utils/chatSaveFields';
import { chatSystemPrompt } from '@/utils/chatSave';

const now = new Date(2026, 9, 20, 14, 5);

describe('chat saves take the topic\'s shape', () => {
  it('splits the main part from key: value parts', () => {
    expect(splitSaveText('Headache | severity: 6 | Notes: after lunch | stray bit')).toEqual({
      main: 'Headache', parts: { severity: '6', notes: 'after lunch stray bit' },
    });
  });

  it('a symptom becomes chips, a severity and today', () => {
    const { content, customFields } = chatSaveEntry('Symptom', 'headache and nausea | severity: 12 | notes: after skipping lunch', [], now);
    expect(customFields).toMatchObject({
      symptomName: 'Headache, Nausea', severity: 10, occurredDate: '2026-10-20', occurredTime: '14:05', notes: 'after skipping lunch',
    });
    expect(content).toBe('<p>Headache, Nausea</p>');
  });

  it('a paragraph never lands in a name field — its first words do, the rest goes to notes', () => {
    const para = 'I have had a pounding headache since this morning that got worse after lunch and it will not let up at all today.';
    const { customFields } = chatSaveEntry('Symptom', para, [], now);
    expect((customFields!.symptomName as string).split(/\s+/).length).toBeLessThanOrEqual(8);
    expect(customFields!.notes).toBe(para);
  });

  it('tasks, goals, events and exercise fill their own fields', () => {
    expect(chatSaveEntry('Task', 'Call the dentist | priority: High | due: tomorrow', [], now).customFields)
      .toMatchObject({ taskDescription: 'Call the dentist', priority: 'high', deadline: '2026-10-21', isCompleted: false });
    expect(chatSaveEntry('Goal', 'Run a 10K | type: long-term | by: 2027-03-01', [], now).customFields)
      .toMatchObject({ goalObjective: 'Run a 10K', goalType: 'long_term', targetDate: '2027-03-01', goalStatus: 'new' });
    expect(chatSaveEntry('Event', 'Dinner with Sam | date: 2026-10-24 | time: 7pm | where: Luce', [], now).customFields)
      .toMatchObject({ eventName: 'Dinner with Sam', startDate: '2026-10-24', startTime: '19:00', location: 'Luce' });
    const ex = chatSaveEntry('Exercise', 'Walking | minutes: 30 | miles: 2 | intensity: easy', [], now);
    expect(ex.customFields).toMatchObject({ exerciseType: 'walking', duration: '30', distance: '2', intensity: 'low' });
    expect(ex.content).toContain('Walking');
  });

  it('a meal keeps just what was eaten as its name', () => {
    expect(chatSaveEntry('Meals', 'Turkey sandwich | meal: lunch', [], now).customFields)
      .toMatchObject({ mealDescription: 'Turkey sandwich', mealType: 'lunch', consumedDate: '2026-10-20' });
  });

  it('a topic with its own fields fills them by label; plain topics stay text', () => {
    const defs = [{ id: 'a', label: 'Title', type: 'text' }, { id: 'b', label: 'Author', type: 'text' }] as never;
    const books = chatSaveEntry('Books', 'Piranesi | Author: Susanna Clarke', defs, now);
    expect(books.customFields).toEqual({ _userFields: { a: 'Piranesi', b: 'Susanna Clarke' } });
    expect(books.content).toBe('<p>Piranesi — Susanna Clarke</p>');
    expect(chatSaveEntry('Journal', 'A calm day.', [], now).customFields).toBeNull();
  });

  it('reads times', () => {
    expect(chatTime('19:00')).toBe('19:00');
    expect(chatTime('7:30 am')).toBe('07:30');
    expect(chatTime('12pm')).toBe('12:00');
    expect(chatTime('7')).toBe('');
  });

  it('the system prompt gives the shape for each topic with fields and asks for short saves', () => {
    const formats = chatSaveFormats([{ id: 1, name: 'Symptom' }, { id: 2, name: 'Journal' }], {});
    expect(formats).toHaveLength(1);
    expect(formats[0]).toMatch(/^- Symptom: `\/save Symptom Headache, Nausea \| severity: 6/);
    const prompt = chatSystemPrompt(['Symptom', 'Journal'], '', false, false, formats, now);
    expect(prompt).toContain('today is 2026-10-20');
    expect(prompt).toContain('never a sentence');
    expect(prompt).toContain(formats[0].slice(2));
  });
});
