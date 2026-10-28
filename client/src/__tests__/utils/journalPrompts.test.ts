import { describe, it, expect, beforeEach } from 'vitest';
import { nextPrompt, nextReflectivePrompt, REFLECTIVE_PROMPTS, INVENTORY_PROMPTS } from '@/utils/journalPrompts';

describe('writing prompts', () => {
  beforeEach(() => { localStorage.removeItem('journal-prompt-v1'); localStorage.removeItem('quick-prompt-v1'); });

  it('gives the Quick entry reflective prompts only, each visit the next, wrapping round', () => {
    const seen = Array.from({ length: REFLECTIVE_PROMPTS.length + 1 }, () => nextReflectivePrompt());
    expect(seen.every(p => REFLECTIVE_PROMPTS.includes(p))).toBe(true);
    expect(seen.some(p => INVENTORY_PROMPTS.includes(p))).toBe(false);
    expect(new Set(seen.slice(0, REFLECTIVE_PROMPTS.length)).size).toBe(REFLECTIVE_PROMPTS.length);
    expect(seen[REFLECTIVE_PROMPTS.length]).toBe(seen[0]);
  });

  it('keeps the journal\'s own place, apart from the Quick entry\'s', () => {
    const first = nextPrompt();
    nextReflectivePrompt();
    nextReflectivePrompt();
    expect(INVENTORY_PROMPTS).toContain(first);
    expect(REFLECTIVE_PROMPTS).toContain(nextPrompt()); // the journal's next turn, not moved by the Quick entry
  });

  it('writes the prompts as plain questions (no semicolons)', () => {
    expect(REFLECTIVE_PROMPTS.length).toBeGreaterThanOrEqual(30);
    expect(REFLECTIVE_PROMPTS.some(p => p.includes(';'))).toBe(false);
  });
});
