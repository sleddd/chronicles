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

  it('renders a spreadsheet row: date, then topic, then the entry', () => {
    const { container } = renderWithTheme(<EntryCard {...defaultProps} topicName="Work" />);
    // 2024 isn't the current year, so the short year is shown
    expect(screen.getByText("Jan 15 '24")).toBeInTheDocument();
    const text = container.textContent ?? '';
    expect(text.indexOf("Jan 15 '24")).toBeLessThan(text.indexOf('Work'));
    expect(text.indexOf('Work')).toBeLessThan(text.indexOf('This is a journal entry'));
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

  it('filters by topic when the topic label is tapped, without opening the entry', () => {
    const onTopicClick = vi.fn();
    const onClick = vi.fn();
    renderWithTheme(
      <EntryCard {...defaultProps} onClick={onClick} topicName="Work" topicId={3} onTopicClick={onTopicClick} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Work' }));
    expect(onTopicClick).toHaveBeenCalledWith(3);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows a plain topic label when topic filtering is unavailable', () => {
    renderWithTheme(<EntryCard {...defaultProps} topicName="Work" />);
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Work' })).not.toBeInTheDocument();
  });

  it('toggles completion from the checkbox without opening the entry', () => {
    const onToggleComplete = vi.fn();
    const onClick = vi.fn();
    renderWithTheme(
      <EntryCard {...defaultProps} onClick={onClick} hasCheckbox isCompleted={false} onToggleComplete={onToggleComplete} />
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggleComplete).toHaveBeenCalledWith(1, true);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows a checked box for completed tasks', () => {
    renderWithTheme(
      <EntryCard {...defaultProps} hasCheckbox isCompleted onToggleComplete={vi.fn()} />
    );
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('has no checkbox for entries that are not checkable', () => {
    renderWithTheme(<EntryCard {...defaultProps} onToggleComplete={vi.fn()} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
