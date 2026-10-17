import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { CalendarGrid } from '@/components/organisms/CalendarGrid';

vi.mock('@/utils/stripHtml', () => ({
  builtinEntryName: (cf: Record<string, unknown> | undefined | null) => { if (!cf) return ''; for (const k of ['eventName','meetingName','goalObjective','milestoneObjective','taskDescription','mealDescription']) { const v = cf[k]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; },
  stripHtml: (html: string) => html.replace(/<[^>]*>/g, ''),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('CalendarGrid', () => {
  const defaultProps = {
    currentMonth: new Date(2024, 5, 1), // June 2024
    currentDate: new Date(2024, 5, 1),
    selectedDate: '2024-06-01',
    entriesByDate: new Map(),
    accentColor: '#4281a4',
    viewMode: 'month' as const,
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onToday: vi.fn(),
    onViewMode: vi.fn(),
    onDayClick: vi.fn(),
    onDayDoubleClick: vi.fn(),
    getTopicName: vi.fn(),
    eventTopicIds: new Set<number>(),
  };

  it('renders month label', () => {
    renderWithTheme(<CalendarGrid {...defaultProps} />);
    expect(screen.getByText('June')).toBeInTheDocument();
    expect(screen.getByText('2024')).toBeInTheDocument();
  });

  it('renders weekday headers starting on Sunday', () => {
    renderWithTheme(<CalendarGrid {...defaultProps} />);
    const sun = screen.getAllByText('SUN')[0];
    const mon = screen.getAllByText('MON')[0];
    expect(sun).toBeInTheDocument();
    expect(sun.compareDocumentPosition(mon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders day numbers for the month', () => {
    renderWithTheme(<CalendarGrid {...defaultProps} />);
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(1);
    const fifteens = screen.getAllByText('15');
    expect(fifteens.length).toBeGreaterThanOrEqual(1);
    const thirties = screen.getAllByText('30');
    expect(thirties.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onPrev when prev chevron is clicked', () => {
    const onPrev = vi.fn();
    renderWithTheme(<CalendarGrid {...defaultProps} onPrev={onPrev} />);
    const buttons = screen.getAllByRole('button');
    const svgBtns = buttons.filter(b => b.querySelector('svg'));
    fireEvent.click(svgBtns[0]);
    expect(onPrev).toHaveBeenCalled();
  });

  it('calls onNext when next chevron is clicked', () => {
    const onNext = vi.fn();
    renderWithTheme(<CalendarGrid {...defaultProps} onNext={onNext} />);
    const buttons = screen.getAllByRole('button');
    const svgBtns = buttons.filter(b => b.querySelector('svg'));
    fireEvent.click(svgBtns[svgBtns.length - 1]);
    expect(onNext).toHaveBeenCalled();
  });

  it('renders entry previews in day cells', () => {
    const entriesByDate = new Map([
      ['2024-06-15', [
        { id: 1, content: '<p>My journal entry</p>', createdAt: new Date(), updatedAt: new Date(), isEncrypted: true, metadata: {} },
      ]],
    ]);
    renderWithTheme(
      <CalendarGrid {...defaultProps} entriesByDate={entriesByDate as never} />
    );
    expect(screen.getAllByText(/My journal entry/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows +N more label when more than 3 entries', () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      id: i, content: `<p>Entry ${i}</p>`, createdAt: new Date(), updatedAt: new Date(), isEncrypted: true, metadata: {},
    }));
    const entriesByDate = new Map([['2024-06-15', entries]]);
    renderWithTheme(
      <CalendarGrid {...defaultProps} entriesByDate={entriesByDate as never} />
    );
    // A cell fits 3 lines: 2 entries + the "+N more" line
    expect(screen.getByText('+3 more')).toBeInTheDocument();
  });

  it('shows all 3 when there are exactly 3, with no more label', () => {
    const entries = Array.from({ length: 3 }, (_, i) => ({
      id: i, content: `<p>Entry ${i}</p>`, createdAt: new Date(), updatedAt: new Date(), isEncrypted: true, metadata: {},
    }));
    renderWithTheme(<CalendarGrid {...defaultProps} entriesByDate={new Map([['2024-06-15', entries]]) as never} />);
    expect(screen.getAllByText('Entry 2').length).toBeGreaterThan(0);
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument();
  });

  it('counts bills and entries together toward the 3 lines', () => {
    const entries = [{ id: 1, content: '<p>Entry A</p>', createdAt: new Date(), updatedAt: new Date(), isEncrypted: true, metadata: {} }];
    const bill = (n: number) => ({ key: `b${n}`, billId: `b${n}`, name: `Bill ${n}`, amountCents: 1000, date: '2024-06-15' });
    const billsByDate = new Map([['2024-06-15', [bill(1), bill(2), bill(3)]]]);
    renderWithTheme(<CalendarGrid {...defaultProps} entriesByDate={new Map([['2024-06-15', entries]]) as never} billsByDate={billsByDate} />);
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });
});
