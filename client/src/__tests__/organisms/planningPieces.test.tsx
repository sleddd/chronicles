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
  const card = (id: number, title: string, over: Partial<PlannerCard> = {}): PlannerCard => ({ id, title, done: false, day: '', hours: 1, ...over });
  const setup = () => {
    const props = { onOpen: vi.fn(), onOpenEvent: vi.fn(), onSchedule: vi.fn(), onAdd: vi.fn(), onPickDay: vi.fn() };
    renderWithTheme(<PlannerBoard {...props}
      overdue={[card(1, 'Renew registration', { day: '2026-11-10', note: 'Tue, Nov 10' })]} open={[card(2, 'Call the dentist', { due: 'Due Nov 14' })]}
      lanes={[
        { day: '2026-11-12', label: 'Thu 12', today: true, events: [
            { key: '9:2026-11-12', id: 9, title: 'Standup', when: '9:00 AM · Meeting', start: 9 * 60, end: 9 * 60 + 30 },
            { key: '7:2026-11-12', id: 7, title: 'Holiday party', when: 'All day · Event' },
          ],
          cards: [card(3, 'Write the FAQ', { day: '2026-11-12', kicker: 'Private beta', hours: 2 }), card(4, 'Review PR', { day: '2026-11-12', done: true })] },
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
    // One lane per day, the hours marked down the left
    const scale = screen.getByRole('rowheader', { name: 'Hours' });
    expect(scale.textContent).toContain('8 AM');
    expect(scale.textContent).toContain('10 PM');
    const thu = screen.getByRole('cell', { name: 'Thu 12' });
    expect(thu.textContent).toContain('Write the FAQ');
    expect(thu.textContent).toContain('Standup');
    expect(thu.textContent).toContain('Review PR');
    // An all-day event sits under the day's name, not on the scale
    expect(thu.textContent).not.toContain('Holiday party');
    expect(screen.getByRole('columnheader', { name: /Thu 12/ }).textContent).toContain('Holiday party');
    // Tasks sit one after another from 8 AM, never over the 9:00 event: 8–10 would cross it, so the FAQ starts at 9:30
    // (The hours can stretch so no card is cut off, so check the order and that nothing overlaps)
    const box = (el: HTMLElement) => ({ top: parseFloat(el.style.top), bottom: parseFloat(el.style.top) + parseFloat(el.style.height) });
    const card = (title: string) => box(screen.getByText(title).closest('article') as HTMLElement);
    const standup = box(screen.getByText('Standup').closest('button') as HTMLElement);
    expect(card('Write the FAQ').top).toBeGreaterThanOrEqual(standup.bottom);           // after the 9:00 event, never over it
    expect(card('Review PR').top).toBeGreaterThanOrEqual(card('Write the FAQ').bottom); // straight after the two-hour FAQ
    // An empty day says so
    expect(screen.getByRole('cell', { name: 'Fri 13' }).textContent).toBe('Nothing planned');
    // The hours always show — there's no button to fold them away
    expect(screen.queryByRole('button', { name: 'Hide the hours' })).toBeNull();
    expect(scale.textContent).toContain('8 AM');
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
      overdue: [], open: [{ id: 2, title: 'Call the dentist', done: false, day: '', hours: 1 }],
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
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Health' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ goalCategory: 'Health' }));
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-11-01' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ startOn: '2026-11-01' }));
  });

  it('sets a habit’s target, period and days', () => {
    const onChange = vi.fn();
    renderWithTheme(<HabitFields values={{ habitName: 'Balance board', targetCount: 3, targetPeriod: 'week', days: [], parentGoalId: null, isActive: true }}
      onChange={onChange} goalOptions={[{ id: 5, title: 'Half marathon' }]} categories={['Health']} />);
    // The note is On my habits' tooltip now
    expect(screen.getByTitle(/3 times a week, so 3 times makes a full week/)).toBeTruthy();
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

describe('PlannerBoard — the tick on a card', () => {
  const props = () => ({ onOpen: vi.fn(), onOpenEvent: vi.fn(), onSchedule: vi.fn(), onAdd: vi.fn(), onToggleDone: vi.fn(), overdue: [], open: [] });
  const lane = (done: boolean) => [{ day: '2026-11-12', label: 'Thu 12', today: true, events: [],
    cards: [{ id: 3, title: 'Deep work', done, day: '2026-11-12', hours: 2 }] }];

  it('marks the task done without opening it, and a done one stays ticked to undo', () => {
    const p = props();
    const { rerender } = renderWithTheme(<PlannerBoard {...p} lanes={lane(false)} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark “Deep work” done' }));
    expect(p.onToggleDone).toHaveBeenCalledWith(3);
    expect(p.onOpen).not.toHaveBeenCalled();
    rerender(<PlannerBoard {...p} lanes={lane(true)} />);
    expect(screen.getByRole('checkbox', { name: 'Mark “Deep work” not done' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('PlannerBoard — a task\'s length', () => {
  const lanes = (hours = 1) => [{
    day: '2026-11-12', label: 'Thu 12', today: true, events: [],
    cards: [{ id: 3, title: 'Deep work', done: false, day: '2026-11-12', hours }],
  }];
  const props = () => ({ onOpen: vi.fn(), onOpenEvent: vi.fn(), onSchedule: vi.fn(), onAdd: vi.fn(), onResize: vi.fn(), overdue: [], open: [] });

  it('is as tall as its hours, and its grip\'s arrow keys change it by half an hour', () => {
    const p = props();
    renderWithTheme(<PlannerBoard {...p} lanes={lanes(2)} />);
    expect((screen.getByText('Deep work').closest('article') as HTMLElement).style.height).toBe('108px'); // 2 h at 60px an hour, less 12px of room between cards
    expect(screen.getByText('2 h')).toBeTruthy();
    const grip = screen.getByRole('button', { name: /^Length of Deep work: 2 h/ });
    fireEvent.keyDown(grip, { key: 'ArrowDown' });
    expect(p.onResize).toHaveBeenLastCalledWith(3, 2.5);
    fireEvent.keyDown(grip, { key: 'ArrowUp' });
    expect(p.onResize).toHaveBeenLastCalledWith(3, 1.5);
    expect(p.onOpen).not.toHaveBeenCalled();
  });

  it('never goes under half an hour, and cards off a day have no grip', () => {
    const p = props();
    renderWithTheme(<PlannerBoard {...p} lanes={lanes(0.5)} open={[{ id: 8, title: 'Someday', done: false, day: '', hours: 1 }]} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /^Length of Deep work/ }), { key: 'ArrowUp' });
    expect(p.onResize).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Length of Someday/ })).toBeNull();
    fireEvent.click(screen.getByText('Deep work'));
    expect(p.onOpen).toHaveBeenCalledWith(3);
  });
});
