import { describe, it, expect } from 'vitest';
import { duplicateEntryFields } from '../../utils/entryDuplicate.js';

describe('duplicateEntryFields', () => {
  it('keeps what was typed and starts a task over', () => {
    const copy = duplicateEntryFields({
      taskDescription: 'Pay the water bill', priority: 'high', deadline: '2026-11-20', taskType: 'Regular task',
      parentGoalId: 7, notes: 'Account 1234', isCompleted: true, isInReview: true, _isFavorite: true,
      taskFormat: 'list', checklist: [{ id: 'a', text: 'Find the bill', done: true }, { id: 'b', text: 'Pay it', done: false }],
      _userFields: { f1: 'x' },
    });
    expect(copy).toEqual({
      taskDescription: 'Pay the water bill', priority: 'high', deadline: '2026-11-20', taskType: 'Regular task',
      parentGoalId: 7, notes: 'Account 1234', taskFormat: 'list',
      checklist: [{ id: 'a', text: 'Find the bill', done: false }, { id: 'b', text: 'Pay it', done: false }],
      _userFields: { f1: 'x' },
    });
  });

  it('unticks shopping items and drops links to other records', () => {
    const copy = duplicateEntryFields({
      title: 'Groceries', items: [{ id: '1', name: 'Milk', checked: true }],
      _sync: { googleId: 'g' }, _changes: [{ date: '2026-10-01', kind: 'started' }], _routineLink: 'r', _doseLink: 'd', _importKey: 'k',
    });
    expect(copy).toEqual({ title: 'Groceries', items: [{ id: '1', name: 'Milk', checked: false }] });
  });

  it('a finished goal or milestone starts over, an unfinished one keeps its status', () => {
    expect(duplicateEntryFields({ goalObjective: 'Run a 10k', goalStatus: 'completed' })).toEqual({ goalObjective: 'Run a 10k' });
    expect(duplicateEntryFields({ goalStatus: 'paused' })).toEqual({ goalStatus: 'paused' });
    expect(duplicateEntryFields({ milestoneStatus: 'completed', isCompleted: true })).toEqual({});
  });

  it('a copy of an item on the public shelf is not on it', () => {
    expect(duplicateEntryFields({ mediaTitle: 'Dune', rating: 4.5, onPublicShelf: true })).toEqual({ mediaTitle: 'Dune', rating: 4.5 });
  });

  it('never changes the original', () => {
    const original = { items: [{ id: '1', name: 'Milk', checked: true }] };
    duplicateEntryFields(original);
    expect(original.items[0].checked).toBe(true);
  });
});
