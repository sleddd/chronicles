import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { BillsTable } from '@/components/organisms/BillsTable';

afterEach(() => { vi.useRealTimers(); });

const bill = (payments: { id: string; forDue: string; paidOn: string; amountCents: number }[]) => ({
  id: 'b1', name: 'Electric', kind: 'bill' as const, amountCents: 9500, frequency: 'monthly' as const,
  dueDate: '2026-10-31', status: 'active' as const, payments,
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
});

describe('BillsTable', () => {
  it('after paying a bill that came due yesterday, says the next date is the next one and which bill was paid', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 1, 10));
    renderWithTheme(<BillsTable categories={[]} onSave={vi.fn()} onDelete={vi.fn()}
      bills={[bill([{ id: 'p1', forDue: '2026-10-31', paidOn: '2026-11-01', amountCents: 9500 }]) as never]} />);
    expect(screen.getByText(/Next due Nov 30/)).toBeInTheDocument();
    expect(screen.getByText('Oct 31 bill paid Nov 1')).toBeInTheDocument();
  });

  it('shows just the date when nothing was paid lately', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 1, 10));
    renderWithTheme(<BillsTable categories={[]} onSave={vi.fn()} onDelete={vi.fn()}
      bills={[{ ...bill([]), dueDate: '2026-11-20' } as never]} />);
    expect(screen.getByText('Nov 20')).toBeInTheDocument();
    expect(screen.queryByText(/Next due/)).not.toBeInTheDocument();
  });
});
