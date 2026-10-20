import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { FinanceReconcileView } from '@/views/FinanceReconcileView';
import { renderWithTheme } from '../testUtils';

const payday = (id: string, date: string, status: 'open' | 'closed') =>
  ({ id, date, status, startingBalanceCents: 100000, items: [], spending: [], balanceChecks: [], ...(status === 'closed' ? { closedOn: date } : {}) });

const paydays = [payday('a', '2026-10-17', 'open'), payday('b', '2026-10-03', 'closed'), payday('c', '2026-09-19', 'closed')];

vi.mock('@/hooks/useFinance', () => ({
  useFinance: (kind: string) => ({
    status: 'ready', records: kind === 'paydays' ? paydays : [], unreadable: 0,
    save: vi.fn(async (r: unknown) => r), remove: vi.fn(), reload: vi.fn(),
  }),
}));
vi.mock('@/components/organisms/FinanceShell', () => ({ FinanceShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/organisms/PaydayEditor', () => ({
  PaydayHeader: ({ payday: p }: { payday: { date: string; status: string } }) => <div data-testid="header">{p.date} {p.status}</div>,
  PaydayEditor: () => <div />,
}));

describe('FinanceReconcileView', () => {
  it('opens a closed payday from Past paydays for review, then goes back', () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    renderWithTheme(<FinanceReconcileView />);
    expect(screen.getByTestId('header')).toHaveTextContent('2026-10-17 open');
    expect(screen.queryByRole('status')).toBeNull();

    const past = within(screen.getByRole('region', { name: 'Past paydays' }));
    fireEvent.click(past.getAllByRole('button', { name: /^Open the / })[1]);
    expect(screen.getByTestId('header')).toHaveTextContent('2026-10-03 closed');
    expect(screen.getByRole('status')).toHaveTextContent(/Reviewing the .+ payday, closed\./);
    expect(scrolled).toHaveBeenCalled();
    expect(past.getAllByRole('button', { name: /^Open the / })[0]).toHaveTextContent('· current');
    expect(past.getAllByRole('button', { name: /^Open the / })[1]).toHaveTextContent('· viewing');

    fireEvent.click(screen.getByRole('button', { name: 'Back to current payday' }));
    expect(screen.getByTestId('header')).toHaveTextContent('2026-10-17 open');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
