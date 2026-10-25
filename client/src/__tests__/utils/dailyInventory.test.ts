import { describe, it, expect } from 'vitest';
import { betterDays, inventoryDays, summarizeInventory } from '@/utils/dailyInventory';

const range = { from: '2026-10-01', to: '2026-10-31' };

describe('daily inventory', () => {
  it('scores a day the way the sheet does, with waking and procrastinating turned round', () => {
    const [d] = inventoryDays(
      [{ date: '2026-10-05', moodScore: 3, sleepQuality: 4, sleepHours: 11, waterGlasses: 8, wokeAtNight: true, eating: 'just_right', workDay: 1, social: 1, procrastination: 5 }],
      [{ day: '2026-10-05', mealType: 'breakfast', healthiness: 3 }, { day: '2026-10-05', mealType: 'lunch', healthiness: 4 }, { day: '2026-10-05', mealType: 'supplement' }],
      [],
      range,
    );
    expect(d.scores).toEqual({
      day: 60, rested: 80, sleep: 100, water: 100, woke: 0, eating: 100, work: 20, social: 20, procrastination: 20,
      breakfast: 100, breakfastHealth: 60, lunch: 100, lunchHealth: 80, dinner: 0, exercised: 0, exerciseMinutes: 0,
    });
    expect(d.score).toBe(Math.round((60 + 80 + 100 + 100 + 0 + 100 + 20 + 20 + 20 + 100 + 60 + 100 + 80 + 0 + 0 + 0) / 16));
  });

  it('counts only what was answered', () => {
    const days = inventoryDays(
      [{ date: '2026-10-02', moodScore: 0, sleepHours: 0, waterGlasses: 0, wokeAtNight: null, eating: '' }],
      [],
      [{ day: '2026-10-03', minutes: 45 }, { day: '2026-09-30', minutes: 20 }],
      range,
    );
    expect(days.map(d => [d.date, d.scores])).toEqual([
      ['2026-10-02', { exercised: 0, exerciseMinutes: 0 }],
      ['2026-10-03', { exercised: 100, exerciseMinutes: 100 }],
    ]);
  });

  it('summarises each question and what goes with better days', () => {
    const w = (date: string, mood: number, sleep: number) => ({ date, moodScore: mood, sleepHours: sleep });
    const days = inventoryDays(
      [w('2026-10-01', 5, 8), w('2026-10-02', 4, 7.5), w('2026-10-03', 2, 5), w('2026-10-04', 2, 6)],
      [],
      [{ day: '2026-10-01', minutes: 30 }, { day: '2026-10-03', minutes: 20 }],
      range,
    );
    const summary = summarizeInventory(days);
    expect(summary.find(s => s.key === 'sleep')).toMatchObject({ answered: 4, answer: '6.6 h' });
    expect(summary.find(s => s.key === 'exercised')).toMatchObject({ answer: 'Yes on 2 of 4 days', score: 50 });
    expect(summary.find(s => s.key === 'day')).toMatchObject({ answer: '3.3 / 5', score: 65 });
    const better = betterDays(days);
    expect(better[0]).toMatchObject({ label: 'Slept 7 hours or more', withIt: 4.5, without: 2 });
    expect(better.find(b => b.label === 'Exercised')).toMatchObject({ withIt: 3.5, without: 3 });
  });
});
