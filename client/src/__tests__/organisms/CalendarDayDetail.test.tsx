import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { CalendarDayDetail } from '@/components/organisms/CalendarDayDetail';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}><MemoryRouter>{ui}</MemoryRouter></ThemeProvider>);
}

const makeEntry = (id: number, text: string) => ({
  id,
  content: `<p>${text}</p>`,
  metadata: {},
  isEncrypted: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('CalendarDayDetail', () => {
  const defaultProps = {
    dateStr: '2024-06-15',
    entries: [] as ReturnType<typeof makeEntry>[],
    allTopics: [],
    eventTopicIds: new Set<number>(),
    taskTopicIds: new Set<number>(),
    accentColor: '#4281a4',
    onClose: vi.fn(),
  };

  it('renders the day number', () => {
    renderWithTheme(<CalendarDayDetail {...defaultProps} />);
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('shows empty state when no entries', () => {
    renderWithTheme(<CalendarDayDetail {...defaultProps} entries={[]} />);
    expect(screen.getByText('No entries for this day.')).toBeInTheDocument();
  });

  it('renders entry count line for one entry', () => {
    renderWithTheme(
      <CalendarDayDetail
        {...defaultProps}
        entries={[makeEntry(1, 'Test entry')]}
      />
    );
    // The calendar shows scheduled items, so the count reads "1 item"
    expect(screen.getByText(/1 item\b/i)).toBeInTheDocument();
  });

  it('renders multiple entries without crashing', () => {
    renderWithTheme(
      <CalendarDayDetail
        {...defaultProps}
        entries={[makeEntry(1, 'First entry'), makeEntry(2, 'Second entry')]}
      />
    );
    expect(document.body).toBeTruthy();
  });
});
