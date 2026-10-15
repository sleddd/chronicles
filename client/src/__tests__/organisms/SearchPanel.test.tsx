import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { SearchPanel } from '@/components/organisms/SearchPanel';

const mockSetSearchKeyword = vi.fn();
const mockSetSearchDateFrom = vi.fn();
const mockSetSearchDateTo = vi.fn();
const mockClearSearch = vi.fn();
const mockSetSelectedTopicId = vi.fn();

vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ topics: [{ id: 3, name: 'Books' }, { id: 2, name: 'Art' }] }),
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      searchKeyword: '',
      searchDateFrom: '',
      searchDateTo: '',
      setSearchKeyword: mockSetSearchKeyword,
      setSearchDateFrom: mockSetSearchDateFrom,
      setSearchDateTo: mockSetSearchDateTo,
      clearSearch: mockClearSearch,
      selectedTopicId: null,
      setSelectedTopicId: mockSetSelectedTopicId,
    }),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('SearchPanel', () => {
  it('has no duplicate keyword box — the journal search pill handles the keyword', () => {
    renderWithTheme(<SearchPanel />);
    expect(screen.queryByPlaceholderText('Search entries...')).not.toBeInTheDocument();
  });

  it('searches by keyword and filters by topic', () => {
    renderWithTheme(<SearchPanel />);
    fireEvent.change(screen.getByPlaceholderText('Words in the entry'), { target: { value: 'garden' } });
    expect(mockSetSearchKeyword).toHaveBeenCalledWith('garden');
    const select = screen.getByDisplayValue('All topics');
    expect(Array.from((select as HTMLSelectElement).options).map(o => o.text)).toEqual(['All topics', 'Art', 'Books']);
    fireEvent.change(select, { target: { value: '3' } });
    expect(mockSetSelectedTopicId).toHaveBeenCalledWith(3);
  });

  it('renders date range inputs', () => {
    renderWithTheme(<SearchPanel />);
    expect(screen.getByText('From')).toBeInTheDocument();
    expect(screen.getByText('To')).toBeInTheDocument();
  });

  it('does not render clear button when no filters active', () => {
    renderWithTheme(<SearchPanel />);
    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
  });
});
