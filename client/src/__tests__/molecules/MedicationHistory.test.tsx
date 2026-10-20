import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { MedicationFields } from '@/components/molecules/fields/MedicationFields';
import { renderWithTheme } from '../testUtils';

const values = {
  medicationName: 'Aspirin', dosage: '650 mg', frequency: 'as_needed', scheduleTimes: [], isActive: true, notes: '',
  _changes: [
    { date: '2026-09-01', kind: 'started', to: '325 mg' },
    { date: '2026-10-05', kind: 'dose', from: '325 mg', to: '650 mg' },
  ],
} as never;

describe('MedicationFields history', () => {
  it('shows recorded changes newest first, and removes a wrong one', () => {
    const onChange = vi.fn();
    renderWithTheme(<MedicationFields values={values} onChange={onChange} />);
    const items = within(screen.getByRole('region', { name: 'History' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Oct 5, 2026Dose 325 mg → 650 mg');
    expect(items[1]).toHaveTextContent('Started · 325 mg');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Dose 325 mg → 650 mg on Oct 5, 2026' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ _changes: [{ date: '2026-09-01', kind: 'started', to: '325 mg' }] }));
  });

  it('says how to log doses when As needed is chosen', () => {
    renderWithTheme(<MedicationFields values={values} onChange={() => {}} />);
    expect(screen.getByText(/Log each dose with Take one/)).toBeInTheDocument();
  });
});
