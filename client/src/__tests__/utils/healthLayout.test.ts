import { describe, it, expect } from 'vitest';
import { DEFAULT_HEALTH_LAYOUT, HEALTH_WIDGETS, moveBeside, moveToRow, normalizeLayout, rowColumns, type HealthWidget } from '@/utils/healthLayout';

const all = [...HEALTH_WIDGETS];

describe('normalizeLayout', () => {
  it('starts from the default when nothing is saved', () => {
    expect(normalizeLayout(undefined, all)).toEqual(DEFAULT_HEALTH_LAYOUT);
  });

  it('drops hidden, unknown and repeated widgets and empty rows', () => {
    const saved = [['wellness', 'nope'], ['meds'], ['quickLog', 'quickLog', 'symptom'], []];
    const shown = all.filter(k => k !== 'meds');
    // Habits, Log a change and the exercise schedule aren't in the saved layout: each joins at its default row
    expect(normalizeLayout(saved, shown)).toEqual([['wellness'], ['quickLog', 'symptom'], ['habits'], ['change'], ['exercise']]);
  });

  it('splits a row over two widgets', () => {
    const saved = [['quickLog', 'symptom', 'habits']];
    expect(normalizeLayout(saved, ['quickLog', 'symptom', 'habits'])).toEqual([['quickLog', 'symptom'], ['habits']]);
  });
});

describe('rowColumns', () => {
  it('fills the row with one, halves two one-column widgets, gives a wide one two thirds', () => {
    expect(rowColumns(['wellness'])).toBe('minmax(0, 1fr)');
    expect(rowColumns(['habits'])).toBe('minmax(0, 1fr)');
    expect(rowColumns(['habits', 'change'])).toBe('minmax(0, 1fr) minmax(0, 1fr)');
    expect(rowColumns(['wellness', 'habits'])).toBe('minmax(0, 2fr) minmax(0, 1fr)');
    expect(rowColumns(['symptom', 'meds'])).toBe('minmax(0, 1fr) minmax(0, 2fr)');
  });
});

describe('moving widgets', () => {
  const layout: HealthWidget[][] = [['wellness'], ['quickLog', 'symptom'], ['habits', 'change']];

  it('puts one beside a wide widget, sharing its row', () => {
    expect(moveBeside(layout, 'habits', 'wellness', 'after')).toEqual([['wellness', 'habits'], ['quickLog', 'symptom'], ['change']]);
    expect(moveBeside(layout, 'habits', 'wellness', 'before')).toEqual([['habits', 'wellness'], ['quickLog', 'symptom'], ['change']]);
  });

  it('a full row keeps the two that meet and moves the other under them', () => {
    expect(moveBeside(layout, 'habits', 'quickLog', 'after')).toEqual([['wellness'], ['quickLog', 'habits'], ['symptom'], ['change']]);
  });

  it('swaps sides within a row', () => {
    expect(moveBeside(layout, 'quickLog', 'symptom', 'after')).toEqual([['wellness'], ['symptom', 'quickLog'], ['habits', 'change']]);
  });

  it('drops one on a row of its own', () => {
    expect(moveToRow(layout, 'symptom', 0)).toEqual([['symptom'], ['wellness'], ['quickLog'], ['habits', 'change']]);
    expect(moveToRow(layout, 'wellness', 3)).toEqual([['quickLog', 'symptom'], ['habits', 'change'], ['wellness']]);
  });
});
