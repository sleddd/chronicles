import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { ViewTabs } from '@/components/organisms/ViewTabs';

const mockSetViewMode = vi.fn();
const mockSetSelectedDate = vi.fn();
const mockSetSearchKeyword = vi.fn();
const uiState = vi.hoisted(() => ({
  viewMode: 'all' as string,
  selectedDate: new Date(2000, 0, 1),
  searchKeyword: '',
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ ...uiState, setViewMode: mockSetViewMode, setSelectedDate: mockSetSelectedDate, setSearchKeyword: mockSetSearchKeyword }),
}));

const mockDeleteEntries = vi.fn(async () => {});
vi.mock('@/hooks/useBulkDeleteEntries', () => ({
  useBulkDeleteEntries: () => ({ deleteEntries: mockDeleteEntries, deleting: false }),
}));
vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ decryptedEntries: [{ id: 1, metadata: {} }, { id: 2, metadata: {} }, { id: 3, metadata: {} }] }),
}));
import { useJournalSelect } from '@/stores/journalSelectStore';
import { act } from '@testing-library/react';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('ViewTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uiState.viewMode = 'all';
    useJournalSelect.getState().stop();
  });

  it('has a search box and, behind ⋯, Today / All / Bookmarks (New entry is in the title row)', () => {
    renderWithTheme(<ViewTabs />);
    expect(screen.getByLabelText('Search entries')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    for (const label of ['Today', 'All entries', 'Bookmarked entries']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.queryByLabelText('New entry')).not.toBeInTheDocument();
  });

  it('typing searches; the keyword is kept and the list switches to search', () => {
    renderWithTheme(<ViewTabs />);
    fireEvent.change(screen.getByLabelText('Search entries'), { target: { value: 'vet' } });
    expect(mockSetSearchKeyword).toHaveBeenCalledWith('vet');
    expect(mockSetViewMode).toHaveBeenCalledWith('search');
  });

  it('leads with Today, then All', () => {
    renderWithTheme(<ViewTabs />);
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    const tabs = screen.getAllByRole('menuitemradio').map(t => t.getAttribute('aria-label'));
    expect(tabs.slice(0, 2)).toEqual(['Today', 'All entries']);
  });

  it('calls setViewMode when a choice is made', () => {
    renderWithTheme(<ViewTabs />);
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    fireEvent.click(screen.getByLabelText('Bookmarked entries'));
    expect(mockSetViewMode).toHaveBeenCalledWith('favorites');
  });

  it('Today selects today and switches to date mode', () => {
    const onTodayClick = vi.fn();
    renderWithTheme(<ViewTabs onTodayClick={onTodayClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    fireEvent.click(screen.getByLabelText('Today'));
    expect(mockSetViewMode).toHaveBeenCalledWith('date');
    const picked = mockSetSelectedDate.mock.calls[0][0] as Date;
    expect(picked.toDateString()).toBe(new Date().toDateString());
    expect(onTodayClick).toHaveBeenCalled();
  });

  it('names what the list shows', () => {
    renderWithTheme(<ViewTabs />);
    expect(screen.getByText('All entries')).toBeInTheDocument();
  });

  it('has no date-picker tab (dates are in the search filters)', () => {
    renderWithTheme(<ViewTabs />);
    expect(screen.queryByLabelText('Pick a date')).not.toBeInTheDocument();
  });

  it('closing the search filters leaves search', () => {
    uiState.viewMode = 'search';
    renderWithTheme(<ViewTabs />);
    fireEvent.click(screen.getByLabelText('Close search filters'));
    expect(mockSetSearchKeyword).toHaveBeenCalledWith('');
    expect(mockSetViewMode).toHaveBeenCalled();
  });

  it('a day shows its name with × that clears it to All entries', () => {
    uiState.viewMode = 'date';
    renderWithTheme(<ViewTabs />);
    expect(screen.getByText('Sat, Jan 1')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Clear the day'));
    expect(mockSetViewMode).toHaveBeenCalledWith('all');
  });

  it('Select entries (in ⋯) swaps the row to the count with Delete and Done', () => {
    renderWithTheme(<ViewTabs />);
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Select entries/ }));
    expect(useJournalSelect.getState().selecting).toBe(true);
    expect(screen.getByText('0 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    act(() => { useJournalSelect.getState().toggle(1); useJournalSelect.getState().toggle(3); });
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(useJournalSelect.getState().selecting).toBe(false);
    expect(screen.getByRole('button', { name: 'Show' })).toBeInTheDocument();
  });

  it('Delete asks once, then deletes the selected entries and ends selecting', async () => {
    renderWithTheme(<ViewTabs />);
    act(() => { useJournalSelect.getState().start(); useJournalSelect.getState().toggle(2); });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(mockDeleteEntries).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete 1?' })); });
    expect(mockDeleteEntries).toHaveBeenCalledWith([{ id: 2, metadata: {} }], false);
    expect(useJournalSelect.getState().selecting).toBe(false);
  });
});
