import { describe, it, expect } from 'vitest';
import {
  EMPTY_GOAL_CATEGORIES, DEFAULT_GOAL_CATEGORIES, goalCategoryList, addGoalCategory, removeGoalCategory,
  parseGoalCategories, goalCategoryOf, categoriesInUse, categoryRank, groupByCategory,
} from './goalCategories.js';

describe('goalCategories', () => {
  it('offers the built-in list by default', () => {
    expect(goalCategoryList(EMPTY_GOAL_CATEGORIES)).toEqual([...DEFAULT_GOAL_CATEGORIES]);
    expect(goalCategoryList(null)).toEqual([...DEFAULT_GOAL_CATEGORIES]);
  });

  it('adds the person’s own once, whatever the case', () => {
    let c = addGoalCategory(EMPTY_GOAL_CATEGORIES, '  Mountain   climbing ');
    c = addGoalCategory(c, 'mountain climbing');
    expect(c.added).toEqual(['Mountain climbing']);
    expect(goalCategoryList(c).at(-1)).toBe('Mountain climbing');
    expect(addGoalCategory(c, '   ')).toBe(c);
  });

  it('hides a built-in one and brings it back when added again', () => {
    const hidden = removeGoalCategory(EMPTY_GOAL_CATEGORIES, 'Home');
    expect(goalCategoryList(hidden)).not.toContain('Home');
    expect(removeGoalCategory(hidden, 'home')).toBe(hidden);
    const back = addGoalCategory(hidden, 'home');
    expect(goalCategoryList(back)).toContain('Home');
    expect(back.added).toEqual([]);
  });

  it('deletes the person’s own', () => {
    const c = removeGoalCategory(addGoalCategory(EMPTY_GOAL_CATEGORIES, 'Travel'), 'travel');
    expect(c.added).toEqual([]);
  });

  it('reads only a well-formed setting', () => {
    expect(parseGoalCategories(null)).toEqual(EMPTY_GOAL_CATEGORIES);
    expect(parseGoalCategories({ added: ['A', 3], hidden: 'x' })).toEqual({ added: ['A'], hidden: [] });
  });

  it('reads a goal’s category', () => {
    expect(goalCategoryOf({ goalCategory: ' Health ' })).toBe('Health');
    expect(goalCategoryOf({ goalCategory: 4 })).toBe('');
    expect(goalCategoryOf(undefined)).toBe('');
  });

  it('keeps a category still in use pickable', () => {
    expect(categoriesInUse(['Health'], ['health', 'Travel', ''])).toEqual(['Health', 'Travel']);
  });

  it('ranks by the list, unknown after it, none last', () => {
    const list = ['Health', 'Career'];
    expect(categoryRank('career', list)).toBe(1);
    expect(categoryRank('Travel', list)).toBe(2);
    expect(categoryRank('', list)).toBe(3);
  });

  it('groups in the list’s order with no category last', () => {
    const items = [{ n: 'a', c: '' }, { n: 'b', c: 'Career' }, { n: 'c', c: 'health' }, { n: 'd', c: 'Travel' }, { n: 'e', c: 'Career' }];
    const groups = groupByCategory(items, i => i.c, ['Health', 'Career', 'Home']);
    expect(groups.map(g => g.category)).toEqual(['Health', 'Career', 'Travel', '']);
    expect(groups[1].items.map(i => i.n)).toEqual(['b', 'e']);
  });
});
