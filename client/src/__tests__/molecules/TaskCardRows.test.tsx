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
