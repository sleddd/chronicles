import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { SubItemRow } from '@/components/molecules/SubItemRow';
import { renderWithTheme } from '../testUtils';
import { faCheck } from '@fortawesome/free-solid-svg-icons';

describe('SubItemRow', () => {
  const baseProps = {
    icon: faCheck,
    iconColor: '#22c55e',
    title: 'My Task',
    isCompleted: false,
    statusLabel: 'In Progress',
    onToggleStatus: vi.fn(),
    onUnlink: vi.fn(),
  };

  it('renders the title', () => {
    renderWithTheme(<SubItemRow {...baseProps} />);
    expect(screen.getByText('My Task')).toBeInTheDocument();
  });

  it('calls onToggleStatus when status button is clicked', () => {
    const onToggleStatus = vi.fn();
    renderWithTheme(<SubItemRow {...baseProps} onToggleStatus={onToggleStatus} />);
    const statusBtn = screen.getByLabelText('In Progress — click to change');
    fireEvent.click(statusBtn);
    expect(onToggleStatus).toHaveBeenCalledOnce();
  });

  it('calls onUnlink when remove button is clicked', () => {
    const onUnlink = vi.fn();
    renderWithTheme(<SubItemRow {...baseProps} onUnlink={onUnlink} />);
    const removeBtn = screen.getByLabelText('Remove item');
    fireEvent.click(removeBtn);
    expect(onUnlink).toHaveBeenCalledOnce();
  });

  it('applies completed styling when isCompleted is true', () => {
    renderWithTheme(<SubItemRow {...baseProps} isCompleted />);
    const title = screen.getByText('My Task');
    expect(title).toHaveStyle('text-decoration: line-through');
  });

  it('does not apply completed styling when isCompleted is false', () => {
    renderWithTheme(<SubItemRow {...baseProps} isCompleted={false} />);
    const title = screen.getByText('My Task');
    expect(title).toHaveStyle('text-decoration: none');
  });
});
