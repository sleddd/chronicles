import { describe, it, expect } from 'vitest';
import {
  isTodoList, checklistOf, checklistProgress, addChecklistItem, newTodoListFields, filterOfView, taskPassesFilter,
} from '@/utils/taskLists';
import type { SavedPlanView } from '@/utils/planningView';

describe('todo lists', () => {
  const list = { taskFormat: 'list', checklist: [
    { id: 'a', text: 'Call vet', done: true }, { id: 'b', text: 'Pay rent', done: false }, { bad: 1 },
  ] };

  it('tells a todo list from a single task', () => {
    expect(isTodoList(list)).toBe(true);
    expect(isTodoList({ taskFormat: 'single' })).toBe(false);
    expect(isTodoList(undefined)).toBe(false);
  });

  it('reads only well-formed items', () => {
    expect(checklistOf(list).map(i => i.id)).toEqual(['a', 'b']);
    expect(checklistOf({ checklist: 'x' })).toEqual([]);
  });

  it('counts progress for lists with items only', () => {
    expect(checklistProgress(list)).toEqual({ done: 1, total: 2 });
    expect(checklistProgress({ taskFormat: 'list', checklist: [] })).toBeUndefined();
    expect(checklistProgress({ checklist: list.checklist })).toBeUndefined();
  });

  it('adds items with no limit, skipping blanks', () => {
    let items = checklistOf(list);
    for (let n = 0; n < 50; n++) items = addChecklistItem(items, ` item ${n} `, `id${n}`);
    expect(items).toHaveLength(52);
    expect(items[2]).toEqual({ id: 'id0', text: 'item 0', done: false });
    expect(addChecklistItem(items, '   ', 'z')).toBe(items);
  });

  it('starts a new list named and empty', () => {
    expect(newTodoListFields(' First week of October ')).toMatchObject({
      taskDescription: 'First week of October', taskFormat: 'list', checklist: [], isCompleted: false,
    });
  });
});

describe('taskPassesFilter', () => {
  const milestoneGoal = new Map<number, number | null>([[10, 1]]);
  const linked = { parentMilestoneId: 10, isInProgress: true, taskType: 'Small victory' };
  const todo = { isCompleted: true };

  it('splits tasks (linked) from todos (unlinked)', () => {
    expect(taskPassesFilter(linked, { scope: 'tasks' }, milestoneGoal)).toBe(true);
    expect(taskPassesFilter(todo, { scope: 'tasks' }, milestoneGoal)).toBe(false);
    expect(taskPassesFilter(todo, { scope: 'todos' }, milestoneGoal)).toBe(true);
    expect(taskPassesFilter(linked, { scope: 'all' }, milestoneGoal)).toBe(true);
  });

  it('counts a task under its milestone\'s goal', () => {
    expect(taskPassesFilter(linked, { scope: 'tasks', goalId: 1 }, milestoneGoal)).toBe(true);
    expect(taskPassesFilter(linked, { scope: 'tasks', goalId: 2 }, milestoneGoal)).toBe(false);
  });

  it('filters by status and type', () => {
    expect(taskPassesFilter(linked, { scope: 'tasks', status: 'in_progress', taskType: 'small victory' }, milestoneGoal)).toBe(true);
    expect(taskPassesFilter(linked, { scope: 'tasks', status: 'done' }, milestoneGoal)).toBe(false);
    expect(taskPassesFilter(linked, { scope: 'tasks', taskType: 'Regular task' }, milestoneGoal)).toBe(false);
  });

  it('reads a saved view\'s filters', () => {
    const v: SavedPlanView = { id: 'v', name: 'Wins', tab: 'todos', view: 'list', query: '', sort: 'newest',
      goalId: null, milestoneId: null, status: '', taskType: 'Small victory' };
    expect(filterOfView(v)).toEqual({ scope: 'todos', goalId: null, milestoneId: null, status: '', taskType: 'Small victory' });
  });
});

describe('In review status', () => {
  it('sits between in progress and done', async () => {
    const { taskStatusOf, taskFieldsForStatus, TASK_COLUMNS } = await import('@/types/goals');
    expect(TASK_COLUMNS.map(c => c.key)).toEqual(['todo', 'in_progress', 'in_review', 'done']);
    expect(taskStatusOf({ isInProgress: true, isInReview: true })).toBe('in_review');
    expect(taskStatusOf({ isInReview: true, isCompleted: true })).toBe('done');
    expect(taskFieldsForStatus('in_review')).toEqual({ isInProgress: false, isInReview: true, isCompleted: false });
    expect(taskPassesFilter({ isInReview: true }, { scope: 'todos', status: 'in_review' }, new Map())).toBe(true);
  });
});
