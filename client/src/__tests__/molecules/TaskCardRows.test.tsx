import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { TaskCardRows } from '@/components/molecules/fields/TaskCardFields';
import type { TaskFieldValues } from '@/types/fields';

const base = { isInProgress: false, isCompleted: false, isAutoMigrating: false, parentGoalId: null, parentMilestoneId: null, priority: 'none', deadline: '' } as unknown as TaskFieldValues;
const goals = [{ id: 1, title: 'Get healthy' }, { id: 2, title: 'Write the book' }];
const milestones = [
  { id: 10, title: 'Walk daily', parentGoalId: 1 },
  { id: 20, title: 'First draft', parentGoalId: 2 },
];

describe('TaskCardRows — Category', () => {
  it('has separate Goal, Milestone and Type pickers', () => {
    renderWithTheme(<TaskCardRows values={base} onChange={vi.fn()} goalOptions={goals} milestoneOptions={milestones as never} />);
    for (const label of ['Goal', 'Milestone', 'Type']) expect(screen.getByLabelText(label)).toBeInTheDocument();
  });

  it('picking a milestone sets its goal', () => {
    const onChange = vi.fn();
    renderWithTheme(<TaskCardRows values={base} onChange={onChange} goalOptions={goals} milestoneOptions={milestones as never} />);
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: '20' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ parentMilestoneId: 20, parentGoalId: 2 }));
  });

  it('lists only the chosen goal’s milestones, and a new goal drops one that isn’t under it', () => {
    const onChange = vi.fn();
    renderWithTheme(<TaskCardRows values={{ ...base, parentGoalId: 1, parentMilestoneId: 10 }} onChange={onChange} goalOptions={goals} milestoneOptions={milestones as never} />);
    const options = [...(screen.getByLabelText('Milestone') as HTMLSelectElement).options].map(o => o.textContent);
    expect(options).toEqual(['None', 'Walk daily']);
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: '2' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ parentGoalId: 2, parentMilestoneId: null }));
  });
});

describe('TaskCardRows — Blocked by', () => {
  const tasks = [
    { id: 5, title: 'This task', isCompleted: false },
    { id: 7, title: 'Call the plumber', isCompleted: false },
    { id: 8, title: 'Buy paint', isCompleted: true },
    { id: 9, title: 'Measure the wall', isCompleted: false },
  ];

  it('offers the other open tasks only, and picking one adds it', () => {
    const onChange = vi.fn();
    renderWithTheme(<TaskCardRows values={base} onChange={onChange} blockerTasks={tasks} selfId={5} />);
    const picker = screen.getByLabelText('Blocked by a task') as HTMLSelectElement;
    expect([...picker.options].map(o => o.textContent)).toEqual(['Pick a task', 'Call the plumber', 'Measure the wall']);
    fireEvent.change(picker, { target: { value: '9' } });
    const next = onChange.mock.calls.at(-1)![0] as TaskFieldValues;
    expect(next.blockers).toEqual([{ id: expect.any(String), taskId: 9 }]);
  });

  it('a short note is added on Enter, tidied to one line', () => {
    const onChange = vi.fn();
    renderWithTheme(<TaskCardRows values={base} onChange={onChange} blockerTasks={tasks} selfId={5} />);
    const box = screen.getByLabelText('Blocked by a note');
    fireEvent.change(box, { target: { value: '  Waiting on   the landlord ' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect((onChange.mock.calls.at(-1)![0] as TaskFieldValues).blockers).toEqual([{ id: expect.any(String), note: 'Waiting on the landlord' }]);
  });

  it('lists each blocker with × to take it off; a task that is done is marked as such', () => {
    const onChange = vi.fn();
    const values = { ...base, blockers: [{ id: 'a', taskId: 8 }, { id: 'b', note: 'Rain' }, { id: 'c', taskId: 7 }] } as TaskFieldValues;
    renderWithTheme(<TaskCardRows values={values} onChange={onChange} blockerTasks={tasks} selfId={5} />);
    expect(screen.getByText('Buy paint')).toBeInTheDocument();
    expect(screen.getByText('(done)', { exact: false })).toBeInTheDocument();
    // A task already blocking isn't offered again
    expect([...(screen.getByLabelText('Blocked by a task') as HTMLSelectElement).options].map(o => o.textContent)).toEqual(['Pick a task', 'Measure the wall']);
    fireEvent.click(screen.getByLabelText('Take “Rain” off Blocked by'));
    expect((onChange.mock.calls.at(-1)![0] as TaskFieldValues).blockers).toEqual([{ id: 'a', taskId: 8 }, { id: 'c', taskId: 7 }]);
  });

  it('nothing more can be added once there are ten', () => {
    const blockers = Array.from({ length: 10 }, (_, i) => ({ id: `n${i}`, note: `Note ${i}` }));
    renderWithTheme(<TaskCardRows values={{ ...base, blockers } as TaskFieldValues} onChange={vi.fn()} blockerTasks={tasks} selfId={5} />);
    expect(screen.queryByLabelText('Blocked by a note')).toBeNull();
    expect(screen.queryByLabelText('Blocked by a task')).toBeNull();
  });
});
