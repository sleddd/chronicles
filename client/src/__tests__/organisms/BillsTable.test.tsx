import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { BillsTable } from '@/components/organisms/BillsTable';

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 1, 10)); });
afterEach(() => { vi.useRealTimers(); });

const bill = (over: Record<string, unknown> = {}) => ({
  id: 'b1', name: 'Electric', kind: 'bill' as const, amountCents: 9500, frequency: 'monthly' as const,
  dueDate: '2026-10-15', status: 'active' as const, payments: [] as unknown[],
  createdAt: '2026-01-01', updatedAt: '2026-01-01', ...over,
}) as never;

const paidOct = { payments: [{ id: 'p1', forDue: '2026-10-15', paidOn: '2026-10-16', amountCents: 9500 }] };

describe('BillsTable, by month', () => {
  it('in October, shows the October bill paid with Undo paid for it', () => {
    const onSave = vi.fn();
    renderWithTheme(<BillsTable categories={[]} month="2026-10" onSave={onSave} onDelete={vi.fn()} bills={[bill(paidOct)]} />);
    expect(screen.getByText('Oct 15')).toBeInTheDocument();
    expect(screen.getByText('Paid Oct 16')).toBeInTheDocument();
    expect(screen.queryByText(/Nov 15/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo paid' }));
    expect(onSave.mock.calls[0][0].payments).toEqual([]);
  });

  it('in November, shows the November bill to pay — never Undo paid', () => {
    const onSave = vi.fn();
    renderWithTheme(<BillsTable categories={[]} month="2026-11" onSave={onSave} onDelete={vi.fn()} bills={[bill(paidOct)]} />);
    expect(screen.getByText('Nov 15')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo paid' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark paid' }));
    expect(onSave.mock.calls[0][0].payments.map((p: { forDue: string }) => p.forDue)).toEqual(['2026-10-15', '2026-11-15']);
  });

  it('a past month left unpaid shows as overdue, and Mark paid pays that one', () => {
    const onSave = vi.fn();
    renderWithTheme(<BillsTable categories={[]} month="2026-10" onSave={onSave} onDelete={vi.fn()} bills={[bill()]} />);
    expect(screen.getByText('Overdue · Oct 15')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark paid' }));
    expect(onSave.mock.calls[0][0].payments[0]).toMatchObject({ forDue: '2026-10-15', paidOn: '2026-11-01' });
  });

  it('a bill with nothing due this month gives its next date and the last bill paid', () => {
    renderWithTheme(<BillsTable categories={[]} month="2026-11" onSave={vi.fn()} onDelete={vi.fn()}
      bills={[bill({ frequency: 'quarterly', ...paidOct })]} />);
    expect(screen.getByText(/Next due Jan 15/)).toBeInTheDocument();
    expect(screen.getByText('Oct 15 bill paid Oct 16')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo paid' })).not.toBeInTheDocument();
  });
});
