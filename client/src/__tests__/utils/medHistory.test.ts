import { describe, it, expect } from 'vitest';
import { buildMedHistory, medPeriodRange, searchMedHistory, medHistoryTotals } from '@/utils/medHistory';
import type { DoseLogRecord } from '@/services/api';
import type { FoodRow } from '@/utils/foodLog';

const dose = (id: string, medicationPostId: number, date: string, status: string, scheduledTime = '08:00', takenAt: string | null = null): DoseLogRecord =>
  ({ id, medicationPostId, date, status, scheduledTime, takenAt, createdAt: '' });

const food = (id: number, day: string, item: string, mealType: string, cf: Record<string, unknown> = {}): FoodRow =>
  ({ id, day, item, mealType, notes: '', values: {} as FoodRow['values'], cf, createdAt: 0 });

const meds = [
  { id: 1, name: 'Vitamin D3', dosage: '2000 IU' },
  { id: 2, name: 'Metformin', dosage: '500mg' },
];
const october = { from: '2026-10-01', to: '2026-10-31' };

describe('medPeriodRange', () => {
  const today = new Date(2026, 9, 19);
  it('gives calendar bounds for each period', () => {
    expect(medPeriodRange('month', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(medPeriodRange('last-month', today)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(medPeriodRange('3-months', today)).toEqual({ from: '2026-08-01', to: '2026-10-31' });
    expect(medPeriodRange('year', today)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(medPeriodRange('custom', today, { from: '2026-10-20', to: '2026-10-05' })).toEqual({ from: '2026-10-05', to: '2026-10-20' });
  });
});

describe('buildMedHistory', () => {
  it('counts taken and skipped doses per medication, in the range only', () => {
    const rows = buildMedHistory([
      dose('a', 1, '2026-10-02', 'taken'),
      dose('b', 1, '2026-10-03', 'taken'),
      dose('c', 1, '2026-10-03', 'taken', '20:00'),
      dose('d', 2, '2026-10-03', 'skipped'),
      dose('e', 2, '2026-10-04', 'pending'),
      dose('f', 1, '2026-09-30', 'taken'),
    ], meds, [], october);
    const d3 = rows.find(r => r.name === 'Vitamin D3')!;
    expect(d3).toMatchObject({ taken: 3, skipped: 0, days: 2, lastTaken: '2026-10-03', dosage: '2000 IU' });
    expect(rows.find(r => r.name === 'Metformin')).toMatchObject({ taken: 0, skipped: 1, days: 0, lastTaken: null });
    expect(rows[0].name).toBe('Vitamin D3'); // most taken first
  });

  it('adds medications and supplements logged in Meals, merged by name, without double-counting synced doses', () => {
    const rows = buildMedHistory([dose('a', 1, '2026-10-02', 'taken')], meds, [
      food(10, '2026-10-05', 'vitamin d3', 'supplement'),
      food(11, '2026-10-02', 'Vitamin D3', 'medication', { _doseLink: '1|2026-10-02|08:00' }),
      food(12, '2026-10-06', 'Ibuprofen', 'medication', { consumedTime: '14:30' }),
      food(13, '2026-10-06', 'Oatmeal', 'breakfast'),
    ], october);
    expect(rows.find(r => r.key === 'vitamin d3')).toMatchObject({ taken: 2, days: 2 });
    const ibu = rows.find(r => r.name === 'Ibuprofen')!;
    expect(ibu.taken).toBe(1);
    expect(ibu.events[0]).toMatchObject({ day: '2026-10-06', time: '14:30', source: 'meals' });
    expect(rows.some(r => r.name === 'Oatmeal')).toBe(false);
  });

  it('keeps doses of a deleted medication', () => {
    const rows = buildMedHistory([dose('a', 99, '2026-10-02', 'taken')], meds, [], october);
    expect(rows[0]).toMatchObject({ name: 'Deleted medication', taken: 1 });
  });
});

describe('searchMedHistory and totals', () => {
  const rows = buildMedHistory([
    dose('a', 1, '2026-10-02', 'taken'), dose('b', 2, '2026-10-02', 'taken'), dose('c', 2, '2026-10-03', 'skipped'),
  ], meds, [], october);
  it('matches every word against name and dosage', () => {
    expect(searchMedHistory(rows, 'vit').map(r => r.name)).toEqual(['Vitamin D3']);
    expect(searchMedHistory(rows, '500mg metf').map(r => r.name)).toEqual(['Metformin']);
    expect(searchMedHistory(rows, '  ')).toHaveLength(2);
  });
  it('totals doses taken, skipped and medications taken', () => {
    expect(medHistoryTotals(rows)).toEqual({ taken: 2, skipped: 1, medications: 2 });
  });
});
