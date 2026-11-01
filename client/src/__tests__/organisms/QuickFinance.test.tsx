import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderWithTheme } from '../testUtils';
import { QuickFinance } from '@/components/organisms/QuickFinance';
import { TopicSelector } from '@/components/organisms/TopicSelector';

const saves: Record<string, ReturnType<typeof vi.fn>> = {
  budget: vi.fn(), bills: vi.fn(async (r: object) => ({ id: 'b', ...r })), expenses: vi.fn(async (r: object) => ({ id: 'e', ...r })),
};
vi.mock('@/hooks/useFinance', () => ({
  useFinance: (kind: string) => ({
    records: kind === 'budget' ? [{ id: 'food', name: 'Groceries', monthlyPlannedCents: 0, order: 0 }] : [],
    status: 'ready', save: saves[kind], remove: vi.fn(),
  }),
}));

describe('QuickFinance', () => {
  it('logs spending to the finance table and clears the form', async () => {
    renderWithTheme(<MemoryRouter><QuickFinance kind="spending" /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('What'), { target: { value: 'Coffee' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '4.50' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'food' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log spending' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Logged Coffee to Spending.'));
    expect(saves.expenses).toHaveBeenCalledWith(expect.objectContaining({ description: 'Coffee', amountCents: 450, categoryId: 'food' }));
    expect(screen.getByLabelText('What')).toHaveValue('');
  });

  it('adds a bill', async () => {
    renderWithTheme(<MemoryRouter><QuickFinance kind="bill" /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Internet' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('A due date'), { target: { value: '2026-11-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add bill' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved Internet to Bills.'));
    expect(saves.bills).toHaveBeenCalledWith(expect.objectContaining({ name: 'Internet', amountCents: 6000, dueDate: '2026-11-20' }));
  });
});

describe('TopicSelector extras', () => {
  it('lists extras among the topics and shows the chosen one', () => {
    const onSelectExtra = vi.fn();
    const { rerender } = renderWithTheme(
      <TopicSelector selectedId={null} onSelect={vi.fn()} topics={[{ id: 1, name: 'Ideas', icon: null, color: null }]}
        extras={[{ key: 'bill', name: 'Bill', icon: 'receipt' }]} onSelectExtra={onSelectExtra} />,
    );
    fireEvent.click(screen.getByText('Journal'));
    fireEvent.click(screen.getByText('Bill'));
    expect(onSelectExtra).toHaveBeenCalledWith('bill');
    rerender(
      <TopicSelector selectedId={null} onSelect={vi.fn()} topics={[{ id: 1, name: 'Ideas', icon: null, color: null }]}
        extras={[{ key: 'bill', name: 'Bill', icon: 'receipt' }]} selectedExtra="bill" onSelectExtra={onSelectExtra} />,
    );
    expect(screen.getByRole('button', { name: /Bill/ })).toBeInTheDocument();
  });
});
