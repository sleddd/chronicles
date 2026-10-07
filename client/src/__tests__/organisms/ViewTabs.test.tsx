import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { ViewTabs } from '@/components/organisms/ViewTabs';

const mockSetViewMode = vi.fn();
const mockSetSelectedDate = vi.fn();
const uiState = vi.hoisted(() => ({
  viewMode: 'all' as string,
  selectedDate: new Date(2000, 0, 1),
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ ...uiState, setViewMode: mockSetViewMode, setSelectedDate: mockSetSelectedDate }),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('ViewTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uiState.viewMode = 'all';
  });

  it('renders every tool as a labelled icon button', () => {
    renderWithTheme(<ViewTabs />);
    for (const label of ['All entries', 'Today', 'Pick a date', 'Bookmarked entries', 'Search entries', 'New entry']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('calls setViewMode when a tab is clicked', () => {
    renderWithTheme(<ViewTabs />);
    fireEvent.click(screen.getByLabelText('Bookmarked entries'));
    expect(mockSetViewMode).toHaveBeenCalledWith('favorites');
  });

  it('Today selects today and switches to date mode', () => {
    const onTodayClick = vi.fn();
    renderWithTheme(<ViewTabs onTodayClick={onTodayClick} />);
    fireEvent.click(screen.getByLabelText('Today'));
    expect(mockSetViewMode).toHaveBeenCalledWith('date');
    const picked = mockSetSelectedDate.mock.calls[0][0] as Date;
    expect(picked.toDateString()).toBe(new Date().toDateString());
    expect(onTodayClick).toHaveBeenCalled();
  });

  it('Pick a date switches to date mode and calls onDateTabClick', () => {
    const onDateTabClick = vi.fn();
    renderWithTheme(<ViewTabs onDateTabClick={onDateTabClick} />);
    fireEvent.click(screen.getByLabelText('Pick a date'));
    expect(mockSetViewMode).toHaveBeenCalledWith('date');
    expect(onDateTabClick).toHaveBeenCalled();
  });

  it('clicking Search again toggles back to all entries', () => {
    uiState.viewMode = 'search';
    renderWithTheme(<ViewTabs />);
    fireEvent.click(screen.getByLabelText('Search entries'));
    expect(mockSetViewMode).toHaveBeenCalledWith('all');
  });

  it('New entry calls onNewEntry without changing the view', () => {
    const onNewEntry = vi.fn();
    renderWithTheme(<ViewTabs onNewEntry={onNewEntry} />);
    fireEvent.click(screen.getByLabelText('New entry'));
    expect(onNewEntry).toHaveBeenCalled();
    expect(mockSetViewMode).not.toHaveBeenCalled();
  });
});
