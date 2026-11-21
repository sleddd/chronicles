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

  it('renders one line: topic, then the entry, then the date', () => {
    const { container } = renderWithTheme(<EntryCard {...defaultProps} topicName="Work" />);
    expect(screen.getByText("Jan 15")).toBeInTheDocument();
    const text = container.textContent ?? '';
    expect(text.indexOf('Work')).toBeLessThan(text.indexOf('This is a journal entry'));
    expect(text.indexOf('This is a journal entry')).toBeLessThan(text.indexOf('Jan 15'));
  });

  it('leaves the date out when the list is one day', () => {
    renderWithTheme(<EntryCard {...defaultProps} topicName="Work" showDate={false} />);
    expect(screen.queryByText('Jan 15')).not.toBeInTheDocument();
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
      <EntryCard {...defaultProps} isCompleted={true} />
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

  it('has no completion checkbox', () => {
    renderWithTheme(<EntryCard {...defaultProps} isCompleted />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('opens the entry from the keyboard with Enter or Space', () => {
    const onClick = vi.fn();
    renderWithTheme(<EntryCard {...defaultProps} onClick={onClick} />);
    const row = screen.getByRole('button', { name: 'This is a journal entry' });
    expect(row).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('Enter on the topic button filters without opening the entry', () => {
    const onClick = vi.fn();
    const onTopicClick = vi.fn();
    renderWithTheme(<EntryCard {...defaultProps} topicName="Work" topicId={3} onClick={onClick} onTopicClick={onTopicClick} />);
    fireEvent.keyDown(screen.getByTitle('Show only Work'), { key: 'Enter' });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('the bookmark is a real button', () => {
    const onToggle = vi.fn();
    const onClick = vi.fn();
    renderWithTheme(<EntryCard {...defaultProps} isFavorite onToggleBookmark={onToggle} onClick={onClick} />);
    const b = screen.getByRole('button', { name: 'Remove bookmark' });
    expect(b).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(b);
    expect(onToggle).toHaveBeenCalledWith(1, false);
    expect(onClick).not.toHaveBeenCalled();
  });
});
