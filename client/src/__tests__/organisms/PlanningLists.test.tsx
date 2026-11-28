import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { GoalTable, MilestoneTable, TaskTable } from '@/components/organisms/PlanningLists';
import type { GoalEntry, MilestoneEntryData, TaskEntryData } from '@/types/goals';

const created = new Date('2026-11-01');
const goal = (id: number, title: string, category: string, cf: Record<string, unknown> = {}): GoalEntry => ({
  id, content: title, title, goalType: 'short_term', goalStatus: 'in_progress', targetDate: '2026-12-31',
  customFields: { goalCategory: category, ...cf }, taxonomyId: 1, createdAt: created,
});
const milestone = (id: number, title: string, goalId: number, done = false): MilestoneEntryData => ({
  id, content: title, title, milestoneStatus: done ? 'completed' : 'in_progress', isCompleted: done, targetDate: '',
  parentGoalId: goalId, customFields: {}, taxonomyId: 2, createdAt: created,
});
const task = (id: number, title: string, goalId: number | null, cf: Record<string, unknown> = {}, done = false, milestoneId: number | null = null): TaskEntryData => ({
  id, content: title, title, isCompleted: done, parentGoalId: goalId, parentMilestoneId: milestoneId,
  priority: (cf.priority as string) ?? 'none', customFields: cf, taxonomyId: 3, createdAt: created,
});
const shared = () => ({ today: '2026-11-21', accentColor: '#34a5a2', onOpen: vi.fn(), onDelete: vi.fn(), onToggleTask: vi.fn() });

describe('TaskTable', () => {
  const goals = [goal(1, 'Run a 10K', 'Health')];
  const tasks = [
    task(10, 'Tempo run', 1, { priority: 'high', scheduledDate: '2026-11-21', deadline: '2026-11-27', estimatedMinutes: 40 }),
    task(11, 'Book the race', 1, { deadline: '2026-11-09' }, true),
    task(12, 'Call the dentist', null, { priority: 'medium' }),
  ];

  it('a task still waiting on something gets a Blocked tag after its note; a finished one doesn’t', () => {
    renderWithTheme(<TaskTable tasks={tasks} allTasks={tasks} goals={goals} milestones={[]} group="none" titleOf={t => t.title}
      blockedByOf={() => 'Blocked by Buy shoes'} {...shared()} />);
    const tempo = screen.getByText('Tempo run').closest('[role="row"]') as HTMLElement;
    expect(within(tempo).getByText('Run a 10K')).toBeTruthy();
    expect(within(tempo).getByTitle('Blocked by Buy shoes')).toHaveTextContent('Blockedby Buy shoes');
    const race = screen.getByText('Book the race').closest('[role="row"]') as HTMLElement;
    expect(within(race).queryByTitle(/Blocked by/)).toBeNull();
  });

  it('groups by goal with its progress, "No goal" last, and reads each column', () => {
    renderWithTheme(<TaskTable tasks={tasks} allTasks={tasks} goals={goals} milestones={[]} group="goal" titleOf={t => t.title} {...shared()} />);
    const groups = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
    expect(groups).toEqual(['Run a 10K', 'No goal']);
    expect(screen.getByText('1 of 2')).toBeTruthy();
    const tempo = screen.getByText('Tempo run').closest('[role="row"]') as HTMLElement;
    expect(within(tempo).getByText('High')).toBeTruthy();
    expect(within(tempo).getByText('Today')).toBeTruthy();
    expect(within(tempo).getByText('in 6 days')).toBeTruthy();
    expect(within(tempo).getByText('40 min')).toBeTruthy();
    const dentist = screen.getByText('Call the dentist').closest('[role="row"]') as HTMLElement;
    expect(within(dentist).getByText('Unplanned')).toBeTruthy();
    expect(within(dentist).getByText('No deadline')).toBeTruthy();
    expect(within(dentist).getByText('None')).toBeTruthy();
  });

  it('ticks a task, opens it from its title, and folds a group', () => {
    const props = shared();
    renderWithTheme(<TaskTable tasks={tasks} allTasks={tasks} goals={goals} milestones={[]} group="goal" titleOf={t => t.title} {...props} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tempo run: done' }));
    expect(props.onToggleTask).toHaveBeenCalledWith(10, true);
    fireEvent.click(screen.getByRole('button', { name: 'Call the dentist' }));
    expect(props.onOpen).toHaveBeenCalledWith(12);
    fireEvent.click(screen.getByRole('button', { name: 'Fold Run a 10K' }));
    expect(screen.queryByText('Tempo run')).toBeNull();
  });
});

describe('deleted parents', () => {
  it('puts a task whose goal was deleted under "No goal", never dropping it', () => {
    const tasks = [task(10, 'Orphan', 99), task(11, 'Loose', null)];
    renderWithTheme(<TaskTable tasks={tasks} allTasks={tasks} goals={[goal(1, 'Run a 10K', 'Health')]} milestones={[]} group="goal" titleOf={t => t.title} {...shared()} />);
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(['No goal']);
    expect(screen.getByText('Orphan')).toBeTruthy();
    expect(screen.getByText('Loose')).toBeTruthy();
  });

  it('puts a milestone whose goal was deleted under "No goal", and counts all of a goal’s milestones', () => {
    const goals = [goal(1, 'Run a 10K', 'Health')];
    const all = [milestone(5, 'Shown', 1, true), milestone(6, 'Filtered out', 1), milestone(7, 'Orphan', 99)];
    renderWithTheme(<MilestoneTable milestones={[all[0], all[2]]} allMilestones={all} goals={goals} tasks={[]} categories={[]} group="goal" {...shared()} />);
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(['Run a 10K', 'No goal']);
    expect(screen.getByText('1 of 2')).toBeTruthy();
    expect(screen.getByText('Orphan')).toBeTruthy();
  });
});

describe('GoalTable', () => {
  it('groups goals by area and opens a goal to its milestones', () => {
    const goals = [goal(1, 'Run a 10K', 'Health'), goal(2, 'Read twelve books', 'Personal')];
    const milestones = [milestone(5, 'Run 5K without stopping', 1, true)];
    const tasks = [task(10, 'a', 1, {}, true), task(11, 'b', null, {}, false, 5), task(12, 'c', 1)];
    renderWithTheme(<GoalTable goals={goals} milestones={milestones} tasks={tasks} categories={['Health', 'Personal']} group="category" {...shared()} />);
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(['Health', 'Personal']);
    const run = screen.getByRole('button', { name: 'Run a 10K' }).closest('[role="row"]') as HTMLElement;
    // Its tasks: one directly under it, one through its milestone, one more directly — 1 of 3 done
    expect(within(run).getByText('1 / 3')).toBeTruthy();
    expect(within(run).getByText('33%')).toBeTruthy();
    expect(screen.queryByText('Run 5K without stopping')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open Run a 10K' }));
    expect(screen.getByText('Run 5K without stopping')).toBeTruthy();
  });
});
