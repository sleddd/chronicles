import { describe, it, expect } from 'vitest';
import { taskTypeList, addTaskType, removeTaskType, taskTypeOf, taskTypeRank, sameTaskType } from '@/utils/taskTypes';

describe('task types', () => {
  it('lists the built-in types, then the owner\'s own, without repeats', () => {
    expect(taskTypeList(['Errand', ' small  victory', 'errand'])).toEqual(['Regular task', 'Small victory', 'Errand']);
    expect(taskTypeList(null)).toEqual(['Regular task', 'Small victory']);
    expect(taskTypeList(['Call', 3 as unknown as string])).toEqual(['Regular task', 'Small victory', 'Call']);
  });

  it('adds a new type once, never a built-in one', () => {
    expect(addTaskType([], '  Quick   win ')).toEqual(['Quick win']);
    expect(addTaskType(['Quick win'], 'quick win')).toEqual(['Quick win']);
    expect(addTaskType([], 'Small Victory')).toEqual([]);
    expect(addTaskType([], '   ')).toEqual([]);
  });

  it('removes the owner\'s own type, any case', () => {
    expect(removeTaskType(['Errand', 'Call'], 'errand')).toEqual(['Call']);
  });

  it('reads the type from a task\'s fields', () => {
    expect(taskTypeOf({ taskType: ' Small victory ' })).toBe('Small victory');
    expect(taskTypeOf({ taskType: 4 })).toBe('');
    expect(taskTypeOf(undefined)).toBe('');
  });

  it('ranks by the list order, unknown types next, no type last', () => {
    const list = ['Regular task', 'Small victory', 'Errand'];
    expect(taskTypeRank('small victory', list)).toBe(1);
    expect(taskTypeRank('Gone', list)).toBe(3);
    expect(taskTypeRank('', list)).toBe(4);
    expect(sameTaskType('Small  Victory', 'small victory')).toBe(true);
  });
});
