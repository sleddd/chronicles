import { describe, it, expect } from 'vitest';
import { dailyMantraIndex, stepIndex, isMantraTopic } from '@/utils/mantras';
import { missingDefaultTopics } from '@/utils/defaultTopics';

describe('mantras', () => {
  it('moves to the next mantra each day, in turn', () => {
    const a = dailyMantraIndex(5, new Date(2026, 9, 27, 8));
    expect(dailyMantraIndex(5, new Date(2026, 9, 27, 23))).toBe(a); // same all day
    expect(dailyMantraIndex(5, new Date(2026, 9, 28, 8))).toBe((a + 1) % 5);
    expect(dailyMantraIndex(0)).toBe(0);
  });

  it('steps round the list both ways', () => {
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });

  it('is a default topic, recognised singular or plural', () => {
    expect(missingDefaultTopics([]).map(t => t.name)).toContain('Mantra');
    expect(missingDefaultTopics([{ name: 'Mantras' }]).map(t => t.name)).not.toContain('Mantra');
    expect(isMantraTopic(' mantras ')).toBe(true);
  });
});
