import { describe, expect, it } from 'vitest';
import { moodFields, moodOf, moodSummary } from './moodFields.js';

describe('mood fields', () => {
  it('keeps the 1–5 scale and the words apart, one clearing the other', () => {
    expect(moodFields(4)).toEqual({ moodScore: 4, moodWord: '' });
    expect(moodFields(6)).toEqual({ moodScore: 0, moodWord: 'calm' });
    expect(moodFields(7)).toEqual({ moodScore: 0, moodWord: 'stressed' });
    expect(moodFields(8)).toEqual({ moodScore: 0, moodWord: 'sick' });
    expect(moodFields(9)).toEqual({ moodScore: 0, moodWord: '' });
    expect(moodFields(0)).toEqual({ moodScore: 0, moodWord: '' });
  });

  it('reads a check-in back as the picker value', () => {
    expect(moodOf({ moodScore: 5 })).toBe(5);
    expect(moodOf({ moodScore: 0, moodWord: 'sick' })).toBe(8);
    expect(moodOf({ moodScore: 3, moodWord: 'stressed' })).toBe(3);
    expect(moodOf({ moodWord: 'grumpy' })).toBe(0);
    expect(moodOf(undefined)).toBe(0);
  });

  it('summarises for an entry line', () => {
    expect(moodSummary({ moodScore: 4 })).toBe('Mood 4/5');
    expect(moodSummary({ moodWord: 'stressed' })).toBe('Stressed');
    expect(moodSummary({})).toBe('');
  });
});
