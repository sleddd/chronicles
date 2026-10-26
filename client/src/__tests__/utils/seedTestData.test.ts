import { describe, it, expect, vi } from 'vitest';

let nextId = 1;
const created: { metadata: Record<string, unknown>; content: string }[] = [];
const doseLogs: Record<string, unknown>[] = [];
const asNeeded: Record<string, unknown>[] = [];

vi.mock('@/services/api', () => ({
  entries: { create: vi.fn(async (b: { createdAt?: string }) => ({ id: nextId++, createdAt: b.createdAt ?? new Date().toISOString() })) },
  topics: { create: vi.fn(async ({ name, icon }: { name: string; icon: string }) => ({ id: 900 + nextId++, name, icon, color: null })) },
  doses: {
    log: vi.fn(async (x: Record<string, unknown>) => { doseLogs.push(x); return { log: x }; }),
    logAsNeeded: vi.fn(async (x: Record<string, unknown>) => { asNeeded.push(x); return { log: x }; }),
  },
}));

import { seedTestData } from '@/utils/seedTestData';
import { DEFAULT_TOPICS } from '@/utils/defaultTopics';

describe('seedTestData', () => {
  it('seeds every planning status, a month of wellness, priorities and two weeks of doses', async () => {
    const topics = DEFAULT_TOPICS.map((t, i) => ({ id: i + 1, name: t.name, icon: t.icon, color: t.color }));
    const nameOf = (id: unknown) => topics.find(t => t.id === id)?.name;
    const result = await seedTestData({
      topics,
      encryptPost: async (content, metadata) => {
        created.push({ content, metadata });
        return { id: 0, contentEncrypted: '', contentIv: '', metadataEncrypted: '', metadataIv: '' };
      },
      addDecryptedEntry: () => {},
    });
    expect(result).toMatch(/^Success/);
    const cf = (topic: string) => created.filter(e => nameOf(e.metadata._taxonomyId) === topic).map(e => e.metadata._customFields as Record<string, unknown>);

    expect(new Set(cf('Goal').map(f => f.goalStatus))).toEqual(new Set(['new', 'planned', 'in_progress', 'paused', 'completed']));
    expect(new Set(cf('Milestone').map(f => f.milestoneStatus))).toEqual(new Set(['not_started', 'planned', 'in_progress', 'completed']));
    const tasks = cf('Task');
    const status = (f: Record<string, unknown>) => (f.isCompleted ? 'done' : f.isInProgress ? 'in_progress' : 'todo');
    const todos = tasks.filter(f => !f.parentGoalId && !f.parentMilestoneId);
    expect(tasks.length - todos.length).toBeGreaterThanOrEqual(12);
    expect(new Set(todos.map(status))).toEqual(new Set(['todo', 'in_progress', 'done']));
    expect(new Set(tasks.map(f => f.priority))).toEqual(new Set(['urgent', 'high', 'medium', 'low', 'none']));
    expect(tasks.every(f => typeof f.taskDescription === 'string' && f.taskDescription)).toBe(true);

    const wellness = created.filter(e => e.metadata._widgetType === 'wellness-checkin');
    expect(wellness.length).toBeGreaterThanOrEqual(25);
    expect(wellness.some(e => (e.metadata._customFields as Record<string, unknown>).periodToday)).toBe(true);
    expect(cf('Priorities').length).toBe(5);

    expect(cf('Medication').every(f => f.medicationName)).toBe(true);
    expect(cf('Symptom').every(f => f.symptomName)).toBe(true);
    expect(doseLogs.length).toBeGreaterThan(50);
    expect(new Set(doseLogs.map(d => d.status))).toEqual(new Set(['taken', 'skipped']));
    expect(asNeeded.length).toBe(6);
    // Everyday writing for the journal, not just health and finance
    const journal = created.filter(e => ['Journal', 'Idea', 'Books', 'Quote', 'Music', 'TV/Movies', 'Research'].includes(nameOf(e.metadata._taxonomyId) ?? ''));
    expect(journal.filter(e => /Slow Sunday|Rough afternoon|Gratitude/.test(e.content))).toHaveLength(3);
    expect(created[created.length - 1].content).toMatch(/^<p>Slow Sunday/); // newest, so it tops the list
  });
});

import { realisticWellness } from '@/utils/seedTestData';
import { calculateWellnessInsights } from '@/utils/correlationAnalysis';

describe('realisticWellness', () => {
  it('makes every Reports insight point the way real days do', () => {
    const days = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
    const symptomDays = new Set(['2026-09-03', '2026-09-06', '2026-09-09', '2026-09-12', '2026-09-17', '2026-09-22', '2026-09-26']);
    const exerciseDays = new Set(['2026-09-02', '2026-09-05', '2026-09-08', '2026-09-14', '2026-09-20', '2026-09-24', '2026-09-28']);
    const v = realisticWellness(days, symptomDays, exerciseDays);
    const wellness = days.map((date, id) => ({ id, date, waterGoal: 8, ...v.get(date)! }));
    const symptoms = [...symptomDays].map((d, id) => ({ id, name: 'Headache', occurredAt: `${d}T10:00:00`, severity: 4 + (id % 4) }));
    const exercises = [...exerciseDays].map((d, id) => ({ id, name: '', exerciseType: 'running', duration: 30, intensity: 'medium', performedAt: `${d}T07:00:00` }));
    const insights = calculateWellnessInsights(wellness, symptoms, exercises);
    const nums = (label: string) => {
      const i = insights.find(x => x.label === label)!;
      const f = (t: string) => Number(t.match(/avg (?:mood |severity )?([\d.]+)/)![1]);
      return { high: f(i.high), low: f(i.low), direction: i.direction };
    };
    const sleep = nums('Sleep quality → next-day mood');
    expect(sleep.high).toBeGreaterThan(sleep.low); // better mood after good sleep
    const water = nums('Water intake → symptoms');
    expect(water.high).toBeLessThan(water.low); // fewer symptoms on hydrated days
    const ex = nums('Exercise → sleep quality');
    expect(ex.high).toBeGreaterThan(ex.low); // better sleep on exercise days
    expect(insights.every(i => i.direction === 'positive' || i.label.startsWith('Mood'))).toBe(true);
  });
});

import { reportMonthPlan, yourDay } from '@/utils/seedTestData';
import { inventoryDays } from '@/utils/dailyInventory';
import { symptomDays, dayTriggers, medicationReport, exerciseReport, symptomGlance, questionRows, type ReportScope } from '@/utils/healthReport';
import { triggerEvents } from '@/utils/foodSymptoms';

describe('reportMonthPlan', () => {
  const days = Array.from({ length: 29 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
  const plan = reportMonthPlan(days, { mealsUntil: '2026-09-29', exerciseUntil: '2026-09-29' });
  const symptomSet = new Set(plan.symptoms.map(s => s.day));
  const exerciseSet = new Set(plan.exercise.map(x => x.day));
  const wellness = realisticWellness(days, symptomSet, exerciseSet);
  const range = { from: days[0], to: days[days.length - 1] };
  const scope: ReportScope = {
    today: range.to, range,
    inventory: inventoryDays(
      days.map(date => ({ date, ...wellness.get(date)!, ...yourDay(date, wellness.get(date)!) })),
      plan.meals.map(m => ({ day: m.day, mealType: m.mealType, healthiness: Number(m.healthiness) })),
      plan.exercise.map(x => ({ day: x.day, minutes: x.minutes })),
      range,
    ),
    symptoms: symptomDays(plan.symptoms.map(s => ({ name: s.name, severity: s.severity, occurredAt: `${s.day}T${s.time}:00` }))),
  };
  const foods = plan.meals.map((m, id) => ({ id, name: m.name, consumedAt: `${m.day}T${m.time}:00`, ingredients: [], mealType: m.mealType }));

  it('gives Reports a trigger for a food and for a drink', () => {
    const found = dayTriggers(triggerEvents(foods, [], []), scope, 1).triggers.map(t => `${t.trigger} → ${t.symptom}`);
    expect(found).toEqual(expect.arrayContaining(['Dairy latte → Bloating', 'Red wine → Headache']));
  });

  it('gives each medication section something to say', () => {
    const doses = plan.meals.filter(m => m.mealType === 'supplement').map(m => ({ name: m.name, day: m.day }));
    const rows = Object.fromEntries(medicationReport(scope, doses).map(r => [r.name, r]));
    expect(rows['Iron supplement'].moreOften).toContain('Bloating');
    expect(rows['Antihistamine'].lessOften).toContain('Runny nose');
    expect(rows['Magnesium'].note).toMatch(/almost every day/);
  });

  it('gives exercise, the symptom grid and the questions enough to compare', () => {
    expect(exerciseReport(scope, plan.exercise.map(x => ({ day: x.day, minutes: x.minutes }))).lessOften).toContain('Fatigue');
    expect(symptomGlance(scope).clusters.map(c => c.names).join(' | ')).toMatch(/Cough/);
    const rows = questionRows(scope, { kind: 'mood' });
    expect(rows.map(r => r.key)).toEqual(expect.arrayContaining(['breakfast', 'lunch', 'dinner', 'social', 'work', 'eating']));
    expect(rows.find(r => r.key === 'breakfast')!.compare?.ready).toBe(true);
  });
});

import { nutritionFor } from '@/utils/seedTestData';

describe('nutritionFor', () => {
  it('gives a seeded meal its calories, macros and vitamins as form strings', () => {
    expect(nutritionFor('Salmon and rice')).toEqual({
      calories: '600', protein: '38', carbs: '60', fat: '20', iron: '1.8', vitaminD: '12', vitaminB12: '4', vitaminC: '5',
    });
    expect(nutritionFor('Iron supplement')).toEqual({ iron: '18' });
    expect(nutritionFor('Something new')).toEqual({});
  });
});
