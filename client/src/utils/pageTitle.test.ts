import { describe, it, expect } from 'vitest';
import { pageTitleFor } from './pageTitle.js';

describe('pageTitleFor', () => {
  it('names each page in the tab, the most specific match first', () => {
    expect(pageTitleFor('/health')).toBe('Health · Chronicles');
    expect(pageTitleFor('/health/med-history')).toBe('Med history · Chronicles');
    expect(pageTitleFor('/health/exercise/training')).toBe('Exercise · Chronicles');
    expect(pageTitleFor('/goals/overview')).toBe('Vision · Chronicles');
    expect(pageTitleFor('/menu/recipes')).toBe('Recipes · Chronicles');
    expect(pageTitleFor('/topics/12')).toBe('Topics · Chronicles');
    expect(pageTitleFor('/somewhere-else')).toBe('Chronicles');
  });
  it('leaves the home page its own title', () => {
    expect(pageTitleFor('/')).toBeNull();
  });
});
