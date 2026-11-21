import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { LinkedHabits } from '@/components/molecules/fields/LinkedHabits';

describe('LinkedHabits (a goal’s Habits row)', () => {
  const props = () => ({
    habits: [{ id: 1, name: 'Run', target: '3 times a week', paused: false }, { id: 2, name: 'Stretch', target: 'Once a day', paused: true }],
    attachable: [{ id: 3, name: 'Read' }],
    onOpen: vi.fn(), onDetach: vi.fn(), onAttach: vi.fn(), onCreate: vi.fn(),
  });

  it('lists its habits with their target (Paused when paused), opens and takes one off', () => {
    const p = props();
    renderWithTheme(<LinkedHabits {...p} />);
    expect(screen.getByText(/3 times a week/)).toBeInTheDocument();
    expect(screen.getByText(/Paused/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Run/ }));
    expect(p.onOpen).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Take "Stretch" off this goal' }));
    expect(p.onDetach).toHaveBeenCalledWith(2);
  });

  it('attaches a habit and makes a new one by name', () => {
    const p = props();
    renderWithTheme(<LinkedHabits {...p} />);
    fireEvent.change(screen.getByLabelText('Attach a habit'), { target: { value: '3' } });
    expect(p.onAttach).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole('button', { name: /New habit/ }));
    const box = screen.getByLabelText('New habit');
    fireEvent.change(box, { target: { value: 'Meditate' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(p.onCreate).toHaveBeenCalledWith('Meditate');
  });

  it('says so when no habit is part of it, and hides Attach with nothing to attach', () => {
    renderWithTheme(<LinkedHabits {...props()} habits={[]} attachable={[]} />);
    expect(screen.getByText('No habits are part of this goal yet.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Attach a habit')).not.toBeInTheDocument();
  });
});
