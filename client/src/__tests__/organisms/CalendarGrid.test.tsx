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
    const sun = screen.getAllByText('Sun')[0];
    const mon = screen.getAllByText('Mon')[0];
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

  const entry = (id: number, text: string) => ({ id, content: `<p>${text}</p>`, createdAt: new Date(), updatedAt: new Date(), isEncrypted: true, metadata: {} });

  it('shows a day\'s items as dots, the title on hover, no words', () => {
    renderWithTheme(<CalendarGrid {...defaultProps} entriesByDate={new Map([['2024-06-15', [entry(1, 'My journal entry')]]]) as never} />);
    expect(screen.queryByText(/My journal entry/)).not.toBeInTheDocument();
    expect(screen.getAllByTitle('My journal entry').length).toBeGreaterThan(0); // one entry: its title on the dot
    expect(screen.getByRole('img', { name: '1 item' })).toBeInTheDocument();
  });

  it('shows one accent dot for entries and one amber dot for bills, whatever the count', () => {
    const bill = (n: number) => ({ key: `b${n}`, billId: `b${n}`, name: `Bill ${n}`, amountCents: 1000, date: '2024-06-15' });
    const entries = Array.from({ length: 5 }, (_, i) => entry(i, `Entry ${i}`));
    const { container } = renderWithTheme(<CalendarGrid {...defaultProps} entriesByDate={new Map([['2024-06-15', entries]]) as never} billsByDate={new Map([['2024-06-15', [bill(1), bill(2)]]])} />);
    const row = screen.getByRole('img', { name: '7 items' });
    expect(row.querySelectorAll('i')).toHaveLength(2);
    expect(row.querySelector('i[title*="Bill 2"]')?.getAttribute('title')).toBe('Bill 1 · $10.00 due\nBill 2 · $10.00 due');
    expect(screen.queryByText('Bill 2')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\+\d/);
  });
});
