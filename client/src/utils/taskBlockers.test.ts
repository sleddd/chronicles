import { describe, it, expect } from 'vitest';
import {
  blockersOf, withBlocker, withoutBlocker, isBlockerCleared, openBlockers, blockerLabel, blockedByText, cleanBlockerNote,
  BLOCKERS_PER_TASK, BLOCKER_NOTE_MAX, type BlockerTask,
} from './taskBlockers';

const tasks = new Map<number, BlockerTask>([
  [7, { id: 7, title: 'Call the plumber', isCompleted: false }],
  [8, { id: 8, title: 'Buy paint', isCompleted: true }],
  [9, { id: 9, title: 'Measure the wall', isCompleted: false }],
]);

describe('blockersOf', () => {
  it('missing or not a list: none', () => {
    expect(blockersOf(undefined)).toEqual([]);
    expect(blockersOf({})).toEqual([]);
    expect(blockersOf({ blockers: 'Call the plumber' })).toEqual([]);
    expect(blockersOf({ blockers: { id: 'a', taskId: 7 } })).toEqual([]);
  });

  it('keeps only well-formed ones: an id and exactly one of a task or a note', () => {
    expect(blockersOf({ blockers: [
      { id: 'a', taskId: 7 },
      { id: 'b', note: '  Waiting on   the\nlandlord ' },
      { id: 'c', taskId: 7.5 },
      { id: 'd', taskId: -1 },
      { id: 'e', taskId: '7' },
      { id: 'f', note: '   ' },
      { id: 'g', taskId: 9, note: 'both' },
      { id: 'h' },
      { taskId: 9 },
      { id: '', note: 'no id' },
      null, 'text', 3,
    ] })).toEqual([{ id: 'a', taskId: 7 }, { id: 'b', note: 'Waiting on the landlord' }]);
  });

  it('each task, note and id once, at most ten', () => {
    expect(blockersOf({ blockers: [
      { id: 'a', taskId: 7 }, { id: 'b', taskId: 7 }, { id: 'a', taskId: 9 },
      { id: 'c', note: 'Rain' }, { id: 'd', note: 'rain' },
    ] })).toEqual([{ id: 'a', taskId: 7 }, { id: 'c', note: 'Rain' }]);
    const many = Array.from({ length: 14 }, (_, i) => ({ id: `n${i}`, note: `Note ${i}` }));
    expect(blockersOf({ blockers: many })).toHaveLength(BLOCKERS_PER_TASK);
  });

  it('a note is one tidy line of at most 200 characters', () => {
    expect(cleanBlockerNote('a\tb\u0000c')).toBe('a b c');
    const long = blockersOf({ blockers: [{ id: 'a', note: 'x'.repeat(300) }] });
    expect(long[0].note).toHaveLength(BLOCKER_NOTE_MAX);
  });
});

describe('withBlocker and withoutBlocker', () => {
  it('adds a task or a note at the end, with a fresh id', () => {
    const one = withBlocker([], { taskId: 7 }, { id: 'a' });
    expect(one).toEqual([{ id: 'a', taskId: 7 }]);
    const two = withBlocker(one, { note: '  The council  ' }, { id: 'b' });
    expect(two).toEqual([{ id: 'a', taskId: 7 }, { id: 'b', note: 'The council' }]);
    const auto = withBlocker([], { note: 'Rain' });
    expect(auto[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('nothing changes for a blank note, the task itself, one already there, or a full list', () => {
    const list = [{ id: 'a', taskId: 7 }, { id: 'b', note: 'Rain' }];
    expect(withBlocker(list, { note: '   ' })).toBe(list);
    expect(withBlocker(list, { taskId: 7 })).toBe(list);
    expect(withBlocker(list, { note: 'rain' })).toBe(list);
    expect(withBlocker(list, { taskId: 5 }, { selfId: 5 })).toBe(list);
    expect(withBlocker(list, { taskId: 0 })).toBe(list);
    const full = Array.from({ length: BLOCKERS_PER_TASK }, (_, i) => ({ id: `n${i}`, note: `Note ${i}` }));
    expect(withBlocker(full, { taskId: 9 })).toBe(full);
  });

  it('takes one off by its id', () => {
    expect(withoutBlocker([{ id: 'a', taskId: 7 }, { id: 'b', note: 'Rain' }], 'a')).toEqual([{ id: 'b', note: 'Rain' }]);
  });
});

describe('cleared blockers', () => {
  it('a task blocker clears when that task is done or gone; a note never does', () => {
    expect(isBlockerCleared({ id: 'a', taskId: 7 }, tasks)).toBe(false);
    expect(isBlockerCleared({ id: 'a', taskId: 8 }, tasks)).toBe(true);
    expect(isBlockerCleared({ id: 'a', taskId: 404 }, tasks)).toBe(true);
    expect(isBlockerCleared({ id: 'a', note: 'Rain' }, tasks)).toBe(false);
  });

  it('names each one, and says what is still in the way', () => {
    const fields = { blockers: [{ id: 'a', taskId: 8 }, { id: 'b', taskId: 7 }, { id: 'c', note: 'Rain' }, { id: 'd', taskId: 404 }] };
    expect(openBlockers(fields, tasks).map(b => b.id)).toEqual(['b', 'c']);
    expect(blockerLabel({ id: 'a', taskId: 7 }, tasks)).toBe('Call the plumber');
    expect(blockerLabel({ id: 'a', taskId: 404 }, tasks)).toBe('A deleted task');
    expect(blockedByText(fields, tasks)).toBe('Blocked by Call the plumber +1');
    expect(blockedByText({ blockers: [{ id: 'c', note: 'Rain' }] }, tasks)).toBe('Blocked by Rain');
    expect(blockedByText({ blockers: [{ id: 'a', taskId: 8 }] }, tasks)).toBeUndefined();
    expect(blockedByText({}, tasks)).toBeUndefined();
  });
});
