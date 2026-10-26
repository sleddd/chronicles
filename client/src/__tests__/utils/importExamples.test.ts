import { describe, it, expect } from 'vitest';
import { EXAMPLE_ENTRIES_CSV, EXAMPLE_DAILY_LOG } from '@/utils/importExamples';
import { parseCsvRow, splitCsvLines } from '@/utils/csv';
import { planDailyLogImport } from '@/utils/dailyLogImport';

describe('import example files', () => {
  it('entries CSV has the required columns and every row parses with a valid date', () => {
    const lines = splitCsvLines(EXAMPLE_ENTRIES_CSV);
    const headers = parseCsvRow(lines[0]);
    expect(headers).toEqual(['Date', 'Topic', 'Content', 'Bookmarked']);
    expect(lines).toHaveLength(4);
    for (const line of lines.slice(1)) {
      const [date, , content] = parseCsvRow(line);
      expect(Number.isNaN(new Date(date).getTime())).toBe(false);
      expect(content.trim()).not.toBe('');
    }
    // Quoted commas and line breaks stay inside one field
    expect(parseCsvRow(lines[1])[2]).toBe('Slow morning, coffee on the porch.');
    expect(parseCsvRow(lines[3])[2]).toContain('\n');
  });

  it('daily log JSON maps to Meals, Symptom and Journal entries plus goals', () => {
    const plan = planDailyLogImport(JSON.stringify(EXAMPLE_DAILY_LOG));
    expect(plan.days).toBe(1);
    expect(plan.entries.map(e => e.topic).sort()).toEqual(['Journal', 'Meals', 'Meals', 'Symptom']);
    expect(plan.goals?.calories).toBe(2000);
  });
});

import { EXAMPLE_TRAINING_CSV } from '@/utils/importExamples';
import { parseTrainingCsv } from '@/utils/trainingImport';

describe('training tracker example', () => {
  it('imports with the real parser: the phase, its categories and hours, sessions and skipped cells', () => {
    const r = parseTrainingCsv(EXAMPLE_TRAINING_CSV);
    expect(r).toMatchObject({ phaseName: 'Phase 1', weeks: 6, totalHours: 10, firstDate: '2026-10-12' });
    expect(r.categories.map(c => [c.name, c.hours])).toEqual([
      ['Aerobic', 5], ['Leg & Glute', 2], ['Core Stability', 1.5], ['Ankle Mobility & Balance', 1], ['Anaerobic Power', 0.5],
    ]);
    expect(r.sessions.find(s => s.date === '2026-10-12' && s.category === 'Aerobic')).toMatchObject({ minutes: 60, distance: 4.7 });
    expect(r.sessions.find(s => s.date === '2026-10-17' && s.category === 'Aerobic')).toMatchObject({ minutes: 120, distance: 6 });
    expect(r.skipped).toEqual([{ date: '2026-10-15', category: 'Aerobic', text: 'SICK' }]);
    expect(r.sessions.length).toBeGreaterThan(20);
  });
});
