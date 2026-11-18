import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';

const save = vi.fn().mockResolvedValue({ id: 'x' });
vi.mock('@/hooks/useFinance', () => ({ useFinance: () => ({ records: [], status: 'ready', save, remove: vi.fn() }) }));
vi.mock('@/components/organisms/FinanceShell', () => ({ FinanceShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import { FinanceDebtsView } from '@/views/FinanceDebtsView';

describe('Debts', () => {
  beforeEach(() => save.mockClear());

  it('adds a debt with the balance owed', () => {
    renderWithTheme(<FinanceDebtsView />);
    fireEvent.change(screen.getByLabelText('Debt name'), { target: { value: 'Card' } });
    fireEvent.change(screen.getByLabelText('Balance owed'), { target: { value: '$1,200' } });
    fireEvent.click(screen.getByText('Add debt'));
    expect(save).toHaveBeenCalledWith({ kind: 'debt', name: 'Card', startCents: 120000, entries: [] });
  });

  it('says what is missing instead of doing nothing', () => {
    renderWithTheme(<FinanceDebtsView />);
    fireEvent.change(screen.getByLabelText('Debt name'), { target: { value: 'Car loan' } });
    fireEvent.click(screen.getByText('Add debt'));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the balance owed');
  });
});
