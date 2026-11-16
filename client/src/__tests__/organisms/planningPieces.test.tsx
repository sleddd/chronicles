import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { PlanTimeline } from '@/components/organisms/PlanTimeline';
import { PlannerBoard, type PlannerCard } from '@/components/organisms/PlannerBoard';
import { CountBars } from '@/components/molecules/charts/CountBars';
import { DaySquares } from '@/components/molecules/DaySquares';
import { HabitFields } from '@/components/molecules/fields/HabitFields';
import { GoalFields } from '@/components/molecules/fields/GoalFields';
import { PickChips } from '@/components/molecules/fields/PickChips';
import { timelineWindow } from '@/utils/planTimeline';

// The planner cards carry a timer chip's hooks only on the Kanban board; nothing here needs the stores

describe('PlanTimeline', () => {
  const w = timelineWindow('quarter', '2026-11-01');
  const groups = [{
    key: 'Health', label: 'Health', rows: [{
      id: 1, title: 'Run a half marathon', dates: { start: '2026-11-05', end: '2026-12-20' }, progress: 0.5, note: '1 of 2',
      children: [{ id: 2, title: 'Run 10K', dates: { start: '2026-11-05', end: '2026-11-30' } }],
    }, { id: 3, title: 'Old goal', dates: { start: '2026-01-01', end: '2026-02-01' } }, { id: 4, title: 'Open goal', dates: { start: '2026-11-10', end: '' } }],
  }];
  const setup = (over: Partial<Parameters<typeof PlanTimeline>[0]> = {}) => {
    const props = { onToggle: vi.fn(), onOpen: vi.fn(), onChange: vi.fn(), onReveal: vi.fn() };
    renderWithTheme(<PlanTimeline scale="quarter" window={w} today="2026-11-12" groups={groups} open={new Set<number>()} {...props} {...over} />);
    return props;
  };

  it('shows goals under their category with month columns', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Health' })).toBeTruthy();
    expect(screen.getByText('Nov 2026')).toBeTruthy();
    expect(screen.getByText('Jan 2027')).toBeTruthy();
    expect(screen.getByText('No target date')).toBeTruthy();
    expect(screen.queryByText('Run 10K')).toBeNull();
  });

  it('opens a goal’s milestones and its entry', () => {
    const props = setup({ open: new Set([1]) });
    expect(screen.getByText('Run 10K')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hide milestones of Run a half marathon' }));
    expect(props.onToggle).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByTitle('Run 10K'));
    expect(props.onOpen).toHaveBeenCalledWith(2);
  });

  it('moves a focused bar with the arrow keys', () => {
    const props = setup();
    const bar = screen.getByRole('button', { name: /^Run a half marathon, Nov 5 to Dec 20/ });
    fireEvent.keyDown(bar, { key: 'ArrowRight' });
    expect(props.onChange).toHaveBeenCalledWith(1, { start: '2026-11-12', end: '2026-12-27' });
    fireEvent.keyDown(bar, { key: 'ArrowLeft', shiftKey: true, altKey: true });
    expect(props.onChange).toHaveBeenLastCalledWith(1, { start: '2026-11-05', end: '2026-12-19' });
  });

  it('points to a bar outside the window, and stays put when read-only', () => {
    const props = setup({ readOnly: true });
    fireEvent.click(screen.getByRole('button', { name: /^Old goal is earlier/ }));
    expect(props.onReveal).toHaveBeenCalledWith('2026-01-01');
    fireEvent.keyDown(screen.getByRole('button', { name: /^Run a half marathon, Nov 5 to Dec 20/ }), { key: 'ArrowRight' });
    expect(props.onChange).not.toHaveBeenCalled();
  });
});

describe('PlannerBoard', () => {
  const card = (id: number, title: string, over: Partial<PlannerCard> = {}): PlannerCard => ({ id, title, done: false, day: '', ...over });
  const setup = () => {
    const props = { onOpen: vi.fn(), onOpenEvent: vi.fn(), onSchedule: vi.fn(), onAdd: vi.fn(), onPickDay: vi.fn() };
    renderWithTheme(<PlannerBoard {...props}
      overdue={[card(1, 'Renew registration', { day: '2026-11-10', note: 'Tue, Nov 10' })]} open={[card(2, 'Call the dentist', { due: 'Due Nov 14' })]}
      lanes={[
        { day: '2026-11-12', label: 'Thu 12', today: true, events: [{ key: '9:2026-11-12', id: 9, title: 'Standup', when: '9:00 AM · Meeting', part: 'morning' }],
          cards: [card(3, 'Write the FAQ', { day: '2026-11-12', kicker: 'Private beta', part: 'morning' }), card(4, 'Review PR', { day: '2026-11-12', done: true })] },
        { day: '2026-11-13', label: 'Fri 13', today: false, events: [], cards: [] },
      ]} />);
    return props;
  };

  it('lists what is left to plan beside the days', () => {
    setup();
    // No counts anywhere on the planner
    expect(screen.queryByText(/to plan/)).toBeNull();
    expect(screen.getByText('Overdue')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.queryByText(/of \d+ done/)).toBeNull();
    expect(screen.getByText('Standup')).toBeTruthy();
    // A ruled grid: a row per part of the day, each task and event in its own
    expect(screen.getAllByRole('rowheader').map(r => r.textContent?.replace('chevron_right', ''))).toEqual(['MorningBefore 12 PM', 'Noon12 – 5 PM', 'NightAfter 5 PM']);
    // A part of the day folds from its name (each day shows a count instead) and opens again
    const noon = screen.getAllByRole('rowheader')[1];
    fireEvent.click(noon);
    expect(noon.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getAllByRole('cell', { name: /, Noon, folded$/ })).toHaveLength(2);
    fireEvent.click(noon);
    expect(screen.queryAllByRole('cell', { name: /, Noon, folded$/ })).toHaveLength(0);
    // The names fold away to a slim strip (still read out), and come back
    fireEvent.click(screen.getByRole('button', { name: 'Hide morning, noon and night' }));
    expect(screen.getAllByRole('rowheader').map(r => r.textContent)).toEqual(['Morning', 'Noon', 'Night']);
    expect(screen.queryByText('Before 12 PM')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show morning, noon and night' }));
    expect(screen.getByText('Before 12 PM')).toBeTruthy();
    const morning = screen.getByRole('cell', { name: 'Thu 12, Morning' });
    expect(morning.textContent).toContain('Write the FAQ');
    expect(morning.textContent).toContain('Standup');
    // A task with no part chosen sits under Morning (there is no any-time row)
    expect(morning.textContent).toContain('Review PR');
    expect(screen.getByRole('cell', { name: 'Thu 12, Noon' }).textContent).toBe('Noon');
    // An empty space names itself
    expect(screen.getByRole('cell', { name: 'Fri 13, Night' }).textContent).toBe('Night');
  });

  it('plans by date, adds and opens without dragging; no card carries a tick', () => {
    const props = setup();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Day for Call the dentist'), { target: { value: '2026-11-13' } });
    expect(props.onSchedule).toHaveBeenCalledWith(2, '2026-11-13', null);
    const add = screen.getByLabelText('Add a task on Fri 13');
    fireEvent.change(add, { target: { value: ' Buy shoes ' } });
    fireEvent.keyDown(add, { key: 'Enter' });
    expect(props.onAdd).toHaveBeenCalledWith('2026-11-13', 'Buy shoes');
    fireEvent.click(screen.getByText('Call the dentist'));
    expect(props.onOpen).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByText('Standup'));
    expect(props.onOpenEvent).toHaveBeenCalledWith(9);
    fireEvent.click(screen.getByRole('button', { name: 'Fri 13' }));
    expect(props.onPickDay).toHaveBeenCalledWith('2026-11-13');
  });
});

describe('PlannerBoard folding', () => {
  it('folds Unscheduled down to a strip and opens it again', () => {
    const onFold = vi.fn();
    const base = { onOpen: vi.fn(), onOpenEvent: vi.fn(), onSchedule: vi.fn(), onAdd: vi.fn(), onFold,
      overdue: [], open: [{ id: 2, title: 'Call the dentist', done: false, day: '' }],
      lanes: [{ day: '2026-11-13', label: 'Fri 13', today: false, events: [], cards: [] }] };
    const { rerender } = renderWithTheme(<PlannerBoard {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide unscheduled tasks' }));
    expect(onFold).toHaveBeenCalledWith(true);
    rerender(<PlannerBoard {...base} folded />);
    expect(screen.queryByText('Call the dentist')).toBeNull();
    expect(screen.getByText('Unscheduled')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show unscheduled tasks' }));
    expect(onFold).toHaveBeenLastCalledWith(false);
  });
});

describe('habit and category pieces', () => {
  it('draws a bar per value with a target line', () => {
    const { container } = renderWithTheme(<CountBars labels={['Nov 1', 'Nov 8', 'Nov 15']} values={[3, 0, 1]} target={3} ariaLabel="Balance board by week" />);
    expect(screen.getByRole('img', { name: 'Balance board by week' })).toBeTruthy();
    expect(container.querySelectorAll('rect')).toHaveLength(2);
    expect(container.querySelector('line[stroke-dasharray]')).toBeTruthy();
  });

  it('draws a square per day', () => {
    const { container } = renderWithTheme(<DaySquares colors={['red', 'blue', 'red']} label="3 days" />);
    expect(container.querySelectorAll('i')).toHaveLength(3);
  });

  it('picks, clears, adds and removes a category', () => {
    const onPick = vi.fn(), onAdd = vi.fn(), onRemove = vi.fn();
    renderWithTheme(<PickChips label="Category" value="Travel" options={['Health', 'Career']} onPick={onPick} onAdd={onAdd} onRemove={onRemove} />);
    // A value no longer in the list still shows, and tapping it again clears it
    fireEvent.click(screen.getByRole('radio', { name: 'Travel' }));
    expect(onPick).toHaveBeenCalledWith('');
    fireEvent.click(screen.getByRole('radio', { name: 'Health' }));
    expect(onPick).toHaveBeenCalledWith('Health');
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }));
    const box = screen.getByLabelText('New category');
    fireEvent.change(box, { target: { value: 'Mountains' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith('Mountains');
    expect(onPick).toHaveBeenLastCalledWith('Mountains');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Career' }));
    expect(onRemove).toHaveBeenCalledWith('Career');
  });

  it('sets a goal’s category and start date', () => {
    const onChange = vi.fn();
    renderWithTheme(<GoalFields values={{ goalType: 'short_term', goalStatus: 'new', targetDate: '2026-12-01' }} onChange={onChange} categories={['Health']} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Health' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ goalCategory: 'Health' }));
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-11-01' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ startOn: '2026-11-01' }));
  });

  it('sets a habit’s target, period and days', () => {
    const onChange = vi.fn();
    renderWithTheme(<HabitFields values={{ habitName: 'Balance board', targetCount: 3, targetPeriod: 'week', days: [], parentGoalId: null, isActive: true }}
      onChange={onChange} goalOptions={[{ id: 5, title: 'Half marathon' }]} categories={['Health']} />);
    expect(screen.getByText(/3 times a week, so 3 times makes a full week/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ targetCount: 4 }));
    fireEvent.click(screen.getByRole('radio', { name: 'Day' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ targetPeriod: 'day' }));
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ days: [1] }));
    fireEvent.change(screen.getByLabelText('Part of'), { target: { value: '5' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ parentGoalId: 5 }));
  });
});

describe('PlannerBoard — stretching a task over more of the day', () => {
  const lanes = (partEnd: PlannerCard['partEnd'] = '') => [{
    day: '2026-11-12', label: 'Thu 12', today: true, events: [],
    cards: [{ id: 3, title: 'Deep work', done: false, day: '2026-11-12', part: 'morning' as const, partEnd }],
  }];
  const props = () => ({ onOpen: vi.fn(), onOpenEvent: vi.fn(), onSchedule: vi.fn(), onAdd: vi.fn(), onSpan: vi.fn(), overdue: [], open: [] });

  it('shows a stretched task as ONE block across its rows, its title once', () => {
    renderWithTheme(<PlannerBoard {...props()} lanes={lanes('night')} />);
    // never a copy per part: one card, one title, one grip
    expect(screen.getAllByText('Deep work')).toHaveLength(1);
    expect(screen.queryByText('continued')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Stretch Deep work/ })).toHaveLength(1);
    const block = document.querySelector<HTMLElement>('[data-span="3"]')!;
    expect(block.textContent).toContain('All day');
    // placed on the grid from Morning (row 2) across all three rows of its day's column
    expect(block.style.gridRow).toBe('2 / span 3');
    expect(block.style.gridColumn).toBe('2');
    // the cells behind it hold no copy of it
    for (const name of ['Morning', 'Noon', 'Night']) expect(screen.getByRole('cell', { name: `Thu 12, ${name}` }).textContent).not.toContain('Deep work');
  });

  it('keeps room beside the block for a part\'s own cards', () => {
    const withOther = [{ ...lanes('noon')[0], cards: [...lanes('noon')[0].cards, { id: 4, title: 'Quick call', done: false, day: '2026-11-12', part: 'noon' as const }] }];
    renderWithTheme(<PlannerBoard {...props()} lanes={withOther} />);
    const block = document.querySelector<HTMLElement>('[data-span="3"]')!;
    expect(block.style.gridRow).toBe('2 / span 2');
    expect(block.style.width).toContain('50%');
    const noon = screen.getByRole('cell', { name: 'Thu 12, Noon' });
    expect(noon.textContent).toContain('Quick call');
    expect(noon.style.paddingLeft).toContain('50%');
    // a part the block doesn't cover keeps its full width
    expect(screen.getByRole('cell', { name: 'Thu 12, Night' }).style.paddingLeft).toBe('');
  });

  it('the grip\'s arrow keys lengthen and shorten it, never before its own part', () => {
    const p = props();
    const { unmount } = renderWithTheme(<PlannerBoard {...p} lanes={lanes()} />);
    const grip = () => screen.getByRole('button', { name: /^Stretch Deep work/ });
    fireEvent.keyDown(grip(), { key: 'ArrowDown' });
    expect(p.onSpan).toHaveBeenLastCalledWith(3, 'noon');
    fireEvent.keyDown(grip(), { key: 'ArrowUp' });
    expect(p.onSpan).toHaveBeenCalledTimes(1); // already one part
    expect(p.onOpen).not.toHaveBeenCalled();
    unmount();
    const q = props();
    renderWithTheme(<PlannerBoard {...q} lanes={lanes('night')} />);
    fireEvent.keyDown(grip(), { key: 'ArrowUp' });
    expect(q.onSpan).toHaveBeenLastCalledWith(3, 'noon');
    fireEvent.keyDown(grip(), { key: 'ArrowDown' });
    expect(q.onSpan).toHaveBeenCalledTimes(1); // Night is the end of the day
  });

  it('the block opens the task, and cards off a day have no grip', () => {
    const p = props();
    renderWithTheme(<PlannerBoard {...p} lanes={lanes('noon')} open={[{ id: 8, title: 'Someday', done: false, day: '' }]} />);
    fireEvent.click(document.querySelector<HTMLElement>('[data-span="3"]')!);
    expect(p.onOpen).toHaveBeenCalledWith(3);
    expect(screen.queryByRole('button', { name: /^Stretch Someday/ })).toBeNull();
  });
});
