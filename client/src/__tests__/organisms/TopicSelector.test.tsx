import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { TopicSelector } from '@/components/organisms/TopicSelector';

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ headerColor: '#4A5568' }),
}));

vi.mock('@/utils/topicIcons', () => ({
  getTopicIcon: () => ({ prefix: 'fas', iconName: 'book' }),
}));

vi.mock('@/components/molecules/SearchInput', () => ({
  SearchInput: ({ placeholder, onChange, ariaLabel, autoFocus }: { placeholder: string; onChange: (v: string) => void; ariaLabel?: string; autoFocus?: boolean }) => (
    <input placeholder={placeholder} onChange={e => onChange(e.target.value)} data-testid="search-input" aria-label={ariaLabel} autoFocus={autoFocus} />
  ),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

const topics = [
  { id: 1, name: 'Work', icon: 'briefcase', color: '#3B82F6' },
  { id: 2, name: 'Personal', icon: null, color: '#10B981' },
];

describe('TopicSelector', () => {
  it('shows Journal when nothing is selected — there is no "No topic"', () => {
    renderWithTheme(
      <TopicSelector selectedId={null} onSelect={vi.fn()} topics={topics} />
    );
    expect(screen.getByText('Journal')).toBeInTheDocument();
    expect(screen.queryByText('No topic')).not.toBeInTheDocument();
  });

  it('renders selected topic name', () => {
    renderWithTheme(
      <TopicSelector selectedId={1} onSelect={vi.fn()} topics={topics} />
    );
    expect(screen.getByText('Work')).toBeInTheDocument();
  });

  it('opens dropdown when trigger is clicked', () => {
    renderWithTheme(
      <TopicSelector selectedId={null} onSelect={vi.fn()} topics={topics} />
    );
    fireEvent.click(screen.getByText('Journal'));
    // Dropdown should now be visible with topics
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
  });

  it('calls onSelect when a topic is chosen', () => {
    const onSelect = vi.fn();
    renderWithTheme(
      <TopicSelector selectedId={null} onSelect={onSelect} topics={topics} />
    );
    fireEvent.click(screen.getByText('Journal'));
    fireEvent.click(screen.getByText('Work'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('lists Journal (null until the topic exists) among the topics, A–Z, with no "No topic"', () => {
    const onSelect = vi.fn();
    renderWithTheme(
      <TopicSelector selectedId={1} onSelect={onSelect} topics={topics} />
    );
    fireEvent.click(screen.getByText('Work'));
    expect(screen.queryByText('No topic')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Journal'));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('shows the existing Journal topic for null and picks it by id', () => {
    const onSelect = vi.fn();
    const withJournal = [...topics, { id: 3, name: 'Journal', icon: 'book', color: null }];
    renderWithTheme(
      <TopicSelector selectedId={2} onSelect={onSelect} topics={withJournal} />
    );
    fireEvent.click(screen.getByText('Personal'));
    fireEvent.click(screen.getByText('Journal'));
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it('shows "No topics found" when search has no matches', () => {
    renderWithTheme(
      <TopicSelector selectedId={null} onSelect={vi.fn()} topics={topics} />
    );
    fireEvent.click(screen.getByText('Journal'));
    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: 'zzzzz' },
    });
    expect(screen.getByText('No topics found')).toBeInTheDocument();
  });

  it('offers a way back to Journal once another topic is chosen', () => {
    const onSelect = vi.fn();
    const topics = [{ id: 1, name: 'Journal', icon: 'book', color: null }, { id: 2, name: 'Task', icon: 'circle-check', color: null }];
    const { unmount } = render(<ThemeProvider theme={lightTheme}><TopicSelector selectedId={2} onSelect={onSelect} topics={topics} /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: /Task/ }));
    fireEvent.click(screen.getByRole('option', { name: /Clear topic/ }));
    expect(onSelect).toHaveBeenCalledWith(1);
    unmount();
    // already on Journal: nothing to clear
    render(<ThemeProvider theme={lightTheme}><TopicSelector selectedId={1} onSelect={onSelect} topics={topics} /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: /Journal/ }));
    expect(screen.queryByRole('option', { name: /Clear topic/ })).toBeNull();
  });

  it('pins Journal first with journalFirst, the rest A–Z under it', () => {
    const withJournal = [...topics, { id: 3, name: 'Journal', icon: 'book', color: null }, { id: 4, name: 'Art', icon: null, color: null }];
    renderWithTheme(<TopicSelector selectedId={1} onSelect={vi.fn()} topics={withJournal} journalFirst />);
    fireEvent.click(screen.getByText('Work'));
    const wanted = ['Journal', 'Art', 'Personal', 'Work'];
    // The list's topic rows (skipping the Clear topic row)
    const names = screen.getAllByRole('option').filter(b => !b.textContent?.includes('Clear topic'))
      .map(b => wanted.find(w => b.textContent?.trim().endsWith(w)))
      .filter(Boolean);
    expect(names).toEqual(['Journal', 'Art', 'Personal', 'Work']);
  });

  it('leaves out the Clear topic row with noClearRow, whatever is chosen', () => {
    renderWithTheme(<TopicSelector selectedId={1} onSelect={vi.fn()} topics={topics} noClearRow />);
    fireEvent.click(screen.getByText('Work'));
    expect(screen.queryByText('Clear topic')).not.toBeInTheDocument();
  });

  it('shows a Clear row that calls onClear, in place of Clear topic', () => {
    const onClear = vi.fn();
    const onSelect = vi.fn();
    renderWithTheme(<TopicSelector selectedId={1} onSelect={onSelect} topics={topics} noClearRow onClear={onClear} />);
    fireEvent.click(screen.getByText('Work'));
    expect(screen.queryByText('Clear topic')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Clear'));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('names the trigger with its topic, opens on the search box, marks the chosen one and closes on Escape', () => {
    renderWithTheme(<TopicSelector selectedId={1} onSelect={vi.fn()} topics={topics} />);
    const trigger = screen.getByRole('button', { name: 'Topic: Work' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('textbox', { name: 'Search topics' })).toHaveFocus();
    expect(screen.getByRole('option', { name: /Work/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
