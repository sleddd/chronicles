import { describe, it, expect } from 'vitest';
import { getTopicTrail } from '@/utils/topicBreadcrumb';

const JOURNAL = { label: 'Journal', path: '/journal' };

describe('getTopicTrail', () => {
  it('always starts at Journal', () => {
    for (const name of ['Task', 'Meals', 'Recipe', 'Music', undefined, 'Custom Topic']) {
      expect(getTopicTrail(name)[0]).toEqual(JOURNAL);
    }
  });

  it('maps planning topics to Journal / Planning', () => {
    for (const name of ['Task', 'Goal', 'Milestone', 'Priorities']) {
      expect(getTopicTrail(name)).toEqual([JOURNAL, { label: 'Planning', path: '/goals' }]);
    }
  });

  it('maps health topics to Journal / Health', () => {
    for (const name of ['Medication', 'Symptom', 'Exercise', 'Allergy', 'Wellness']) {
      expect(getTopicTrail(name)).toEqual([JOURNAL, { label: 'Health', path: '/health' }]);
    }
  });

  it('gives the food log the full Journal / Health / Meals trail', () => {
    expect(getTopicTrail('Meals')).toEqual([
      JOURNAL,
      { label: 'Health', path: '/health' },
      { label: 'Meals', path: '/health/food' },
    ]);
  });

  it('maps recipes and shopping lists to Journal / From the Kitchen', () => {
    expect(getTopicTrail('Recipe')).toEqual([JOURNAL, { label: 'From the Kitchen', path: '/kitchen' }]);
    expect(getTopicTrail('Shopping List')).toEqual([JOURNAL, { label: 'From the Kitchen', path: '/kitchen' }]);
  });

  it('maps events and meetings to Journal / Calendar', () => {
    expect(getTopicTrail('Event')).toEqual([JOURNAL, { label: 'Calendar', path: '/calendar' }]);
    expect(getTopicTrail('Meeting')).toEqual([JOURNAL, { label: 'Calendar', path: '/calendar' }]);
  });

  it('maps entertainment topics to their own views', () => {
    expect(getTopicTrail('Music')).toEqual([JOURNAL, { label: 'Entertainment', path: '/entertainment/music' }]);
    expect(getTopicTrail('Books')).toEqual([JOURNAL, { label: 'Entertainment', path: '/entertainment/books' }]);
    expect(getTopicTrail('TV/Movies')).toEqual([JOURNAL, { label: 'Entertainment', path: '/entertainment/tv' }]);
  });

  it('maps inspiration topics, with Idea non-clickable (no route)', () => {
    expect(getTopicTrail('Quote')).toEqual([JOURNAL, { label: 'Inspiration', path: '/inspiration/quotes' }]);
    expect(getTopicTrail('Idea')).toEqual([JOURNAL, { label: 'Inspiration', path: null }]);
  });

  it('falls back to Journal alone for custom, unknown, or missing topics', () => {
    expect(getTopicTrail('Books I Love')).toEqual([JOURNAL]);
    expect(getTopicTrail(undefined)).toEqual([JOURNAL]);
    expect(getTopicTrail(null)).toEqual([JOURNAL]);
  });

  it('is case-insensitive', () => {
    expect(getTopicTrail('recipe')).toEqual([JOURNAL, { label: 'From the Kitchen', path: '/kitchen' }]);
    expect(getTopicTrail('RECIPE')).toEqual([JOURNAL, { label: 'From the Kitchen', path: '/kitchen' }]);
  });
});
