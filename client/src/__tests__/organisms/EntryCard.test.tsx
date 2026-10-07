import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { EntryCard } from '@/components/organisms/EntryCard';

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ headerColor: '#4A5568' }),
}));

vi.mock('@/utils/stripHtml', () => ({
  builtinEntryName: (cf: Record<string, unknown> | undefined | null) => { if (!cf) return ''; for (const k of ['eventName','meetingName','goalObjective','milestoneObjective','taskDescription','mealDescription']) { const v = cf[k]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; },
  stripHtml: (html: string) => html.replace(/<[^>]*>/g, ''),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('EntryCard', () => {
  const defaultProps = {
    id: 1,
    content: '<p>This is a journal entry</p>',
    date: '2024-01-15T10:30:00Z',
    onClick: vi.fn(),
  };

  it('renders entry preview text', () => {
    renderWithTheme(<EntryCard {...defaultProps} />);
    expect(screen.getByText('This is a journal entry')).toBeInTheDocument();
  });

  it('renders the day number over the month abbreviation', () => {
    renderWithTheme(<EntryCard {...defaultProps} />);
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('Jan')).toBeInTheDocument();
  });

  it('calls onClick when card is clicked', () => {
    const onClick = vi.fn();
    renderWithTheme(<EntryCard {...defaultProps} onClick={onClick} />);
    fireEvent.click(screen.getByText('This is a journal entry'));
    expect(onClick).toHaveBeenCalled();
  });

  it('renders topic badge when topicName is provided', () => {
    renderWithTheme(
      <EntryCard {...defaultProps} topicName="Work" />
    );
    expect(screen.getByText('Work')).toBeInTheDocument();
  });

  it('shows strikethrough for completed tasks', () => {
    renderWithTheme(
      <EntryCard {...defaultProps} hasCheckbox={true} isCompleted={true} />
    );
    const preview = screen.getByText('This is a journal entry');
    expect(preview).toHaveStyle('text-decoration: line-through');
  });


  it('shows Untitled entry for empty content', () => {
    renderWithTheme(
      <EntryCard {...defaultProps} content="" />
    );
    expect(screen.getByText('Untitled entry')).toBeInTheDocument();
  });
});
