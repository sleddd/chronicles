import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { QuickEntry } from '@/components/organisms/QuickEntry';

vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      topics: [
        { id: 1, name: 'Work', icon: 'briefcase', color: '#3B82F6' },
      ],
    }),
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ headerColor: '#4A5568' }),
}));

vi.mock('@/utils/topicIcons', () => ({
  getTopicIcon: () => ({ prefix: 'fas', iconName: 'book' }),
}));

// Stand-in for the TipTap editor with the same contract QuickEntry relies on
vi.mock('@/components/organisms/Editor', () => ({
  Editor: ({ content, onChange, placeholder, onEnterSave }: {
    content: string; onChange: (v: string) => void; placeholder: string; onEnterSave?: () => void;
  }) => (
    <textarea
      placeholder={placeholder}
      value={content}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEnterSave?.(); } }}
    />
  ),
}));

vi.mock('@/components/organisms/TopicSelectorDropdown', () => ({
  TopicSelectorDropdown: () => null,
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('QuickEntry', () => {
  it('renders quick entry input', () => {
    renderWithTheme(<QuickEntry onCreateEntry={vi.fn()} />);
    expect(screen.getByPlaceholderText('Quick entry...')).toBeInTheDocument();
  });

  it('renders add button', () => {
    renderWithTheme(<QuickEntry onCreateEntry={vi.fn()} />);
    expect(screen.getByText('Add')).toBeInTheDocument();
  });

  it('disables add button when input is empty', () => {
    renderWithTheme(<QuickEntry onCreateEntry={vi.fn()} />);
    expect(screen.getByText('Add')).toBeDisabled();
  });

  it('enables add button when text is entered', () => {
    renderWithTheme(<QuickEntry onCreateEntry={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Quick entry...'), {
      target: { value: 'My quick note' },
    });
    expect(screen.getByText('Add')).not.toBeDisabled();
  });

  it('calls onCreateEntry when add is clicked', () => {
    const onCreate = vi.fn();
    renderWithTheme(<QuickEntry onCreateEntry={onCreate} />);
    fireEvent.change(screen.getByPlaceholderText('Quick entry...'), {
      target: { value: 'My note' },
    });
    fireEvent.click(screen.getByText('Add'));
    expect(onCreate).toHaveBeenCalledWith('My note', null);
  });

  it('clears input after submission', () => {
    renderWithTheme(<QuickEntry onCreateEntry={vi.fn()} />);
    const input = screen.getByPlaceholderText('Quick entry...');
    fireEvent.change(input, { target: { value: 'My note' } });
    fireEvent.click(screen.getByText('Add'));
    expect(input).toHaveValue('');
  });

  it('submits on Enter key', () => {
    const onCreate = vi.fn();
    renderWithTheme(<QuickEntry onCreateEntry={onCreate} />);
    const input = screen.getByPlaceholderText('Quick entry...');
    fireEvent.change(input, { target: { value: 'Enter note' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCreate).toHaveBeenCalledWith('Enter note', null);
  });

  it('shows No topic placeholder when no topic selected', () => {
    renderWithTheme(<QuickEntry onCreateEntry={vi.fn()} />);
    expect(screen.getByText('No topic')).toBeInTheDocument();
  });
});
