import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { MiniCalendar } from '@/components/organisms/MiniCalendar';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

// The strip is a week scroller anchored on today, so pin "today"
const TODAY = new Date(2024, 5, 15, 12); // Sat June 15, 2024

describe('MiniCalendar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(TODAY);
  });
  afterEach(() => vi.useRealTimers());

  const defaultProps = { selectedDate: TODAY, onSelectDate: vi.fn() };

  it('renders a year of weeks either side of today', () => {
    renderWithTheme(<MiniCalendar {...defaultProps} />);
    // 104 weeks × 7 days
    expect(screen.getAllByRole('button')).toHaveLength(728);
  });

  it('labels each day with its full date', () => {
    renderWithTheme(<MiniCalendar {...defaultProps} />);
    expect(screen.getByTitle('Sat, Jun 15')).toBeInTheDocument();
    expect(screen.getByTitle('Mon, Jun 10')).toBeInTheDocument();
  });

  it('calls onSelectDate with the clicked day', () => {
    const onSelectDate = vi.fn();
    renderWithTheme(<MiniCalendar {...defaultProps} onSelectDate={onSelectDate} />);
    fireEvent.click(screen.getByTitle('Thu, Jun 13'));
    const picked = onSelectDate.mock.calls[0][0] as Date;
    expect([picked.getFullYear(), picked.getMonth(), picked.getDate()]).toEqual([2024, 5, 13]);
  });

  it('marks only days that have entries', () => {
    const { rerender } = renderWithTheme(<MiniCalendar {...defaultProps} />);
    const without = screen.getByTitle('Fri, Jun 14').childElementCount;
    rerender(
      <ThemeProvider theme={lightTheme}>
        <MiniCalendar {...defaultProps} entryDates={new Set(['2024-06-14'])} />
      </ThemeProvider>
    );
    expect(screen.getByTitle('Fri, Jun 14').childElementCount).toBe(without + 1);
    expect(screen.getByTitle('Thu, Jun 13').childElementCount).toBe(without);
  });
});
