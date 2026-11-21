import { describe, it, expect } from 'vitest';
import { parseEstimate, estimateLabel } from '@/utils/planner';

describe('parseEstimate', () => {
  it('reads minutes, hours, days and mixes', () => {
    expect(parseEstimate('45')).toBe(45);
    expect(parseEstimate('45 min')).toBe(45);
    expect(parseEstimate('1.5 h')).toBe(90);
    expect(parseEstimate('1 h 30 min')).toBe(90);
    expect(parseEstimate('1h30')).toBe(90);
    expect(parseEstimate('1:30')).toBe(90);
    expect(parseEstimate('2 days')).toBe(960);
    expect(parseEstimate('3 hours')).toBe(180);
  });
  it('blank clears; nonsense and over a week are refused', () => {
    expect(parseEstimate('  ')).toBeNull();
    expect(parseEstimate('soon')).toBeUndefined();
    expect(parseEstimate('0')).toBeUndefined();
    expect(parseEstimate('30 days')).toBeUndefined();
    expect(parseEstimate('7 days')).toBe(3360);
    expect(parseEstimate('8 days')).toBeUndefined();
    expect(parseEstimate('57 h')).toBeUndefined();
  });
  it('reads back what estimateLabel writes', () => {
    for (const m of [15, 45, 60, 90, 135, 360, 960, 2400, 3360]) expect(parseEstimate(estimateLabel(m))).toBe(m);
  });
});
