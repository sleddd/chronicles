import { describe, it, expect } from 'vitest';
import { topRowSpans } from './dashboardRows.js';

const spans = (keys: string[]) => keys.map(k => topRowSpans(keys).get(k));

describe('topRowSpans', () => {
  it('puts the wellness check-in at two thirds beside Shortcuts, else full width', () => {
    expect(spans(['shortcuts', 'wellness', 'quote', 'menu'])).toEqual([1, 2, 3, 3]);
    expect(spans(['wellness', 'shortcuts'])).toEqual([2, 1]);
    expect(spans(['wellness', 'menu'])).toEqual([3, 3]);
  });

  it('gives Shortcuts two thirds beside the quote, and the full width on its own', () => {
    expect(spans(['shortcuts', 'quote'])).toEqual([2, 1]);
    expect(spans(['menu', 'shortcuts', 'focus'])).toEqual([3, 3, 3]);
  });

  it('pairs cards in order, each once', () => {
    expect(spans(['wellness', 'shortcuts', 'quote'])).toEqual([2, 1, 3]);
    expect(spans(['quote', 'wellness'])).toEqual([1, 2]);
  });
});
