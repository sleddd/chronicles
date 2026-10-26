import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { EventFields } from '@/components/molecules/fields/EventFields';
import type { EventFieldValues } from '@/types/fields';

const base: EventFieldValues = {
  eventName: 'Choir', startDate: '2026-10-06', startTime: '19:00', endDate: '', endTime: '', location: '', address: '', phone: '', notes: '',
};

describe('EventFields repeats', () => {
  it('starts weekly on the start date’s weekday', () => {
    const onChange = vi.fn();
    renderWithTheme(<EventFields values={base} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Weekly' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ repeat: 'weekly', repeatDays: [2] }));
  });

  it('shows the rule in a sentence and lets days be picked', () => {
    const onChange = vi.fn();
    renderWithTheme(<EventFields values={{ ...base, repeat: 'weekly', repeatDays: [2] }} onChange={onChange} />);
    expect(screen.getByText('Every Tuesday')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Th' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ repeatDays: [2, 4] }));
  });

  it('hides the repeat options when it never repeats', () => {
    renderWithTheme(<EventFields values={base} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Never' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByLabelText('Every')).not.toBeInTheDocument();
  });
});
