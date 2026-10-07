import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { Toggle } from '@/components/atoms/Toggle';
import { renderWithTheme } from '../testUtils';

describe('Toggle', () => {
  it('renders without crashing', () => {
    renderWithTheme(<Toggle checked={false} onChange={() => {}} />);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('renders with a label', () => {
    renderWithTheme(<Toggle checked={false} onChange={() => {}} label="Dark Mode" />);
    expect(screen.getByText('Dark Mode')).toBeInTheDocument();
  });

  it('does not render label when not provided', () => {
    const { container } = renderWithTheme(<Toggle checked={false} onChange={() => {}} />);
    // Only the track + thumb render; no label text
    expect(container.textContent).toBe('');
  });

  it('reflects checked state', () => {
    renderWithTheme(<Toggle checked={true} onChange={() => {}} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('reflects unchecked state', () => {
    renderWithTheme(<Toggle checked={false} onChange={() => {}} />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('calls onChange with new value when toggled', () => {
    const onChange = vi.fn();
    renderWithTheme(<Toggle checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when unchecking', () => {
    const onChange = vi.fn();
    renderWithTheme(<Toggle checked={true} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
