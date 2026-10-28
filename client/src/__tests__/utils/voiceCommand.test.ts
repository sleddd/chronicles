import { describe, it, expect } from 'vitest';
import { parseVoiceCommand, spokenDate, spokenTime, matchPlanItem, listItems } from '@/utils/voiceCommand';
import { chatSaveEntry } from '@/utils/chatSaveFields';

// Tuesday, October 27, 2026, 9 AM
const NOW = new Date(2026, 9, 27, 9);
const topics = [
  { id: 1, name: 'Task' }, { id: 2, name: 'Symptom' }, { id: 3, name: 'Mantra' }, { id: 4, name: 'Event' },
  { id: 5, name: 'Exercise' }, { id: 6, name: 'Meeting' }, { id: 7, name: 'Shopping List' }, { id: 8, name: 'Journal' },
  { id: 11, name: 'Meals' },
];
const journal = topics[7];
const parse = (s: string) => parseVoiceCommand(s, topics, journal, NOW);

describe('spoken dates and times', () => {
  it('reads the ways people say a day', () => {
    expect(spokenDate('today', NOW)).toBe('2026-10-27');
    expect(spokenDate('tomorrow', NOW)).toBe('2026-10-28');
    expect(spokenDate('Friday', NOW)).toBe('2026-10-30');
    expect(spokenDate('on Tuesday', NOW)).toBe('2026-10-27');
    expect(spokenDate('next Tuesday', NOW)).toBe('2026-11-03');
    expect(spokenDate('October 30th', NOW)).toBe('2026-10-30');
    expect(spokenDate('the 2nd of November', NOW)).toBe('2026-11-02');
    expect(spokenDate('Jan 5', NOW)).toBe('2027-01-05');
    expect(spokenDate('in 3 days', NOW)).toBe('2026-10-30');
    expect(spokenDate('in two weeks', NOW)).toBe('2026-11-10');
    expect(spokenDate('sometime', NOW)).toBe('');
  });
  it('reads times, but not a bare number', () => {
    expect(spokenTime('7 p.m.')).toBe('19:00');
    expect(spokenTime('7:30am')).toBe('07:30');
    expect(spokenTime('12 a.m.')).toBe('00:00');
    expect(spokenTime('noon')).toBe('12:00');
    expect(spokenTime('7')).toBe('');
  });
});

describe('parseVoiceCommand', () => {
  it('turns a task sentence into the /save shape, with its due date and priority', () => {
    const c = parse('Add task call the dentist due Friday, high priority')!;
    expect(c.topic.name).toBe('Task');
    expect(c.text).toBe('Call the dentist | due: 2026-10-30 | priority: high');
    expect(c.parts.map(p => p.label)).toEqual(['Due Fri, Oct 30', 'High priority']);
    const saved = chatSaveEntry('Task', c.text, [], NOW);
    expect(saved.customFields).toMatchObject({ taskDescription: 'Call the dentist', deadline: '2026-10-30', priority: 'high' });
  });

  it('hears "to do" as a task and a bare day as its deadline', () => {
    const c = parse('new to do pick up the dry cleaning tomorrow')!;
    expect(c.topic.name).toBe('Task');
    expect(c.text).toBe('Pick up the dry cleaning | due: 2026-10-28');
  });

  it('reads a symptom with its severity in words', () => {
    const c = parse('log symptom headache and nausea severity six')!;
    expect(c.text).toBe('Headache and nausea | severity: 6');
    expect(chatSaveEntry('Symptom', c.text, [], NOW).customFields).toMatchObject({ symptomName: 'Headache, Nausea', severity: 6 });
  });

  it('reads an event\'s day and time, leaving the place in the name', () => {
    const c = parse('add event dinner at Luce on Saturday at 7 p.m.')!;
    expect(c.text).toBe('Dinner at Luce | date: 2026-10-31 | time: 19:00');
  });

  it('reads exercise minutes and distance', () => {
    expect(parse('log exercise walking for 30 minutes 2 miles')!.text).toBe('Walking | minutes: 30 | miles: 2');
  });

  it('keeps a plain topic\'s words exactly, even ones that look like fields', () => {
    const c = parse('add mantra I am at peace today')!;
    expect(c.topic.name).toBe('Mantra');
    expect(c.text).toBe('I am at peace today');
    expect(c.parts).toEqual([]);
  });

  it('matches multi-word topics and plurals', () => {
    expect(parse('add shopping list eggs')!.topic.name).toBe('Shopping List');
    expect(parse('add tasks water the plants')!.topic.name).toBe('Task');
  });

  it('saves to Journal when no topic is named', () => {
    const c = parse('Had a lovely walk by the river')!;
    expect(c.topic.name).toBe('Journal');
    expect(c.text).toBe('Had a lovely walk by the river');
  });

  it('notices "… and save" / "save it" at the end, but not a sentence ending in "save"', () => {
    const c = parse('add task book flights save it')!;
    expect(c.saveNow).toBe(true);
    expect(c.text).toBe('Book flights');
    expect(parse('add task pay rent and save')!.text).toBe('Pay rent');
    const kept = parse('add mantra spend less and save')!;
    expect(kept.saveNow).toBe(true);
    const plain = parse('add mantra remember to save')!;
    expect(plain.saveNow).toBe(false);
    expect(plain.text).toBe('Remember to save');
    expect(parse('save it')).toBeNull();
    expect(parse('   ')).toBeNull();
  });
});

describe('linking to a goal or milestone by name', () => {
  const plan = {
    goals: [{ id: 50, title: 'Chronicles' }, { id: 51, title: 'Run a 10K' }],
    milestones: [{ id: 60, title: 'Private beta', goalId: 50 }],
  };
  const withPlan = (s: string) => parseVoiceCommand(s, [...topics, { id: 9, name: 'Milestone' }, { id: 10, name: 'Goal' }], journal, NOW, plan);

  it('reads "part of …" and "goal …" (the sentence that didn\'t work)', () => {
    const c = withPlan('add task save delete option chronicles and part of chronicles and goal chronicles')!;
    expect(c.main).toBe('Save delete option chronicles');
    expect(c.link).toEqual({ fields: { parentGoalId: 50 }, label: 'Part of goal: Chronicles' });
    expect(withPlan('add task fix the delete option, part of Chronicles, due Friday')!).toMatchObject({
      main: 'Fix the delete option', text: 'Fix the delete option | due: 2026-10-30', link: { fields: { parentGoalId: 50 } },
    });
  });

  it('links a task to a milestone, and its goal with it', () => {
    expect(withPlan('add task invite testers milestone private beta')!.link).toEqual({
      fields: { parentMilestoneId: 60, parentGoalId: 50 }, label: 'Part of milestone: Private beta (Chronicles)',
    });
    // "part of" finds a milestone first for a task
    expect(withPlan('add task invite testers part of the private beta')!.link?.fields.parentMilestoneId).toBe(60);
  });

  it('links a milestone to its goal, keeping words that are only fields elsewhere', () => {
    const c = withPlan('add milestone first 5K under 30 minutes part of run a 10k by December 1st')!;
    expect(c.main).toBe('First 5K under 30 minutes');
    expect(c.text).toBe('First 5K under 30 minutes | by: 2026-12-01');
    expect(c.link).toEqual({ fields: { parentGoalId: 51 }, label: 'Part of goal: Run a 10K' });
    expect(chatSaveEntry('Milestone', c.text, [], NOW).customFields).toMatchObject({ targetDate: '2026-12-01' });
  });

  it('keeps the words when nothing has that name, and says so', () => {
    const c = withPlan('add task tidy desk part of spring cleaning')!;
    expect(c.link).toBeUndefined();
    expect(c.unmatchedLink).toBe('spring cleaning');
    expect(c.main).toBe('Tidy desk part of spring cleaning');
  });

  it('matches names loosely enough for speech', () => {
    expect(matchPlanItem('chronicles', plan.goals)?.id).toBe(50);
    expect(matchPlanItem('the chronicles app', plan.goals)?.id).toBe(50);
    expect(matchPlanItem('10k', plan.goals)?.id).toBe(51);
    expect(matchPlanItem('x', plan.goals)).toBeNull();
  });
});

describe('to-do lists', () => {
  it('reads "title …, first item …" (the way it was said)', () => {
    const c = parse('add todo list title my list first item laundry')!;
    expect(c.topic.name).toBe('Task');
    expect(c.main).toBe('My list');
    expect(c.list).toEqual(['Laundry']);
  });

  it('reads several items, however they\'re joined', () => {
    expect(parse('add to-do list weekend chores, first item laundry second item dishes, third item vacuum')!.list)
      .toEqual(['Laundry', 'Dishes', 'Vacuum']);
    expect(parse('add to do list groceries items milk, eggs and bread')!).toMatchObject({ main: 'Groceries', list: ['Milk', 'Eggs', 'Bread'] });
    expect(parse('new checklist called packing with passport then charger')!).toMatchObject({ main: 'Packing', list: ['Passport', 'Charger'] });
  });

  it('keeps the title\'s due date, and makes a list with no items yet', () => {
    expect(parse('add todo list first week of October due Friday')!).toMatchObject({
      main: 'First week of October', text: 'First week of October | due: 2026-10-30', list: [],
    });
  });

  it('is not a list when only "to do" is said', () => {
    expect(parse('add to do buy milk')!.list).toBeUndefined();
  });

  it('splits spoken items', () => {
    expect(listItems('laundry next item dishes 3rd item mop')).toEqual(['Laundry', 'Dishes', 'Mop']);
  });
});

describe('meals', () => {
  it('reads the meal type, however it\'s said (it went to dinner before)', () => {
    const c = parse('log meal breakfast eggs and toast')!;
    expect(c.topic.name).toBe('Meals');
    expect(c.text).toBe('Eggs and toast | meal: breakfast');
    expect(chatSaveEntry('Meals', c.text, [], new Date(2026, 9, 27, 19)).customFields).toMatchObject({ mealType: 'breakfast', mealDescription: 'Eggs and toast' });
    expect(parse('log breakfast eggs and toast')!).toMatchObject({ topic: { name: 'Meals' }, text: 'Eggs and toast | meal: breakfast' });
    expect(parse('add meal oatmeal for lunch')!.text).toBe('Oatmeal | meal: lunch');
    expect(parse('log meal soup for supper')!.text).toBe('Soup | meal: dinner');
    expect(parse('log meal breakfast')!.parts.map(p => p.label)).toEqual(['Breakfast']);
  });
});

