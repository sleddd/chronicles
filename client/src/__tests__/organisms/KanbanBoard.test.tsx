import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { KanbanBoard } from '@/components/organisms/KanbanBoard';
import { taskStatusOf, taskFieldsForStatus } from '@/types/goals';
import { renderWithTheme } from '../testUtils';

const columns = [
  { key: 'todo' as const, label: 'To Do', items: [
    { id: 1, title: 'Write tests', badge: { label: 'High', color: 'red' }, date: 'Jul 2', detail: 'Launch' },
    { id: 2, title: 'Fix filters' },
  ] },
  { key: 'done' as const, label: 'Done', items: [] },
];

describe('KanbanBoard', () => {
  it('renders each column with its card count and cards', () => {
    renderWithTheme(<KanbanBoard columns={columns} noun="task" onOpen={() => {}} onMove={() => {}} />);
    expect(screen.getByText('To Do')).toBeInTheDocument();
    expect(screen.getByText('2 cards')).toBeInTheDocument();
    expect(screen.getByText('0 cards')).toBeInTheDocument();
    expect(screen.getByText('Write tests')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Jul 2')).toBeInTheDocument();
    expect(screen.getByText('Drop tasks here')).toBeInTheDocument();
  });

  it('a task still waiting on something is struck through with a Blocked tag; a finished one isn’t tagged', () => {
    const blocked = [{ key: 'todo' as const, label: 'To Do', items: [
      { id: 3, title: 'Paint the hall', blockedBy: 'Blocked by Buy paint +1' },
      { id: 4, title: 'Hang the mirror', blockedBy: 'Blocked by Paint the hall', completed: true },
    ] }];
    renderWithTheme(<KanbanBoard columns={blocked} noun="task" onOpen={() => {}} onMove={() => {}} />);
    expect(screen.getByTitle('Blocked by Buy paint +1')).toHaveTextContent('Blocked');
    expect(screen.getByText('by Buy paint +1')).toBeInTheDocument();
    expect(screen.getByText('Paint the hall')).toHaveStyle({ textDecoration: 'line-through' });
    expect(screen.queryByTitle('Blocked by Paint the hall')).toBeNull();
  });

  it('the column + starts a new entry in that column', () => {
    const onAdd = vi.fn();
    renderWithTheme(<KanbanBoard columns={columns} noun="task" onOpen={() => {}} onMove={() => {}} onAdd={onAdd} />);
    fireEvent.click(screen.getByLabelText('New task in Done'));
    expect(onAdd).toHaveBeenCalledWith('done');
  });

  it('clicking a card opens it', () => {
    const onOpen = vi.fn();
    renderWithTheme(<KanbanBoard columns={columns} noun="task" onOpen={onOpen} onMove={() => {}} />);
    fireEvent.click(screen.getByText('Fix filters'));
    expect(onOpen).toHaveBeenCalledWith(2);
  });

  it('Enter opens a card, Space picks it up for dnd-kit without opening it', () => {
    const onOpen = vi.fn();
    renderWithTheme(<KanbanBoard columns={columns} noun="task" onOpen={onOpen} onMove={() => {}} />);
    const card = screen.getByText('Fix filters').closest('[aria-roledescription]') as HTMLElement;
    fireEvent.keyDown(card, { key: 'Enter', code: 'Enter' });
    expect(onOpen).toHaveBeenCalledTimes(1);
    card.focus();
    fireEvent.keyDown(card, { key: ' ', code: 'Space' });
    // The keyboard sensor took it: the card is being dragged
    expect(card).toHaveAttribute('aria-pressed', 'true');
    // Enter drops it and doesn't open it
    fireEvent.keyDown(card, { key: 'Enter', code: 'Enter' });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('task board status', () => {
  it('maps stored flags to a column and back', () => {
    expect(taskStatusOf({})).toBe('todo');
    expect(taskStatusOf({ isInProgress: true })).toBe('in_progress');
    expect(taskStatusOf({ isInProgress: true, isCompleted: true })).toBe('done');
    // The old "In review" flag reads as In progress
    expect(taskStatusOf({ isInReview: true })).toBe('in_progress');
    expect(taskFieldsForStatus('in_progress')).toEqual({ isBacklog: false, isInProgress: true, isInReview: false, isCompleted: false });
    expect(taskFieldsForStatus('done')).toEqual({ isBacklog: false, isInProgress: false, isInReview: false, isCompleted: true });
    // Idea / Backlog: kept for later; starting or finishing it wins over the flag
    expect(taskStatusOf({ isBacklog: true })).toBe('backlog');
    expect(taskStatusOf({ isBacklog: true, isInProgress: true })).toBe('in_progress');
    expect(taskFieldsForStatus('backlog')).toEqual({ isBacklog: true, isInProgress: false, isInReview: false, isCompleted: false });
    expect(taskFieldsForStatus('todo').isBacklog).toBe(false);
  });
});
