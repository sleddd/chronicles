import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { EntryForm } from '@/components/organisms/EntryForm';

vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      decryptedEntries: [],
      updateDecryptedEntry: vi.fn(),
    }),
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      headerColor: '#4A5568',
      topicCustomFields: { 5: [{ id: 'author', label: 'Author', type: 'text' }] },
      topicHideText: { 7: true },
    }),
}));

vi.mock('@/utils/topicIcons', () => ({
  getTopicIcon: () => ({ prefix: 'fas', iconName: 'book' }),
}));

vi.mock('@/utils/stripHtml', () => ({
  builtinEntryName: (cf: Record<string, unknown> | undefined | null) => { if (!cf) return ''; for (const k of ['eventName','meetingName','goalObjective','milestoneObjective','taskDescription','mealDescription']) { const v = cf[k]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; },
  stripHtml: (html: string) => html.replace(/<[^>]*>/g, ''),
  summarizeUserFields: (defs: unknown[], values: Record<string, unknown>) =>
    Object.values(values || {}).filter(Boolean).join(' · '),
}));

vi.mock('@/components/organisms/Editor', () => ({
  Editor: ({ content, onChange, placeholder }: { content: string; onChange: (c: string) => void; placeholder: string }) => (
    <textarea
      data-testid="editor"
      value={content}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

vi.mock('@/components/organisms/TopicSelector', () => ({
  TopicSelector: ({ selectedId, onSelect }: { selectedId: number | null; onSelect: (id: number | null) => void }) => (
    <select
      data-testid="topic-selector"
      value={selectedId ?? ''}
      onChange={e => onSelect(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">No topic</option>
    </select>
  ),
}));

vi.mock('@/components/molecules/SearchInput', () => ({
  SearchInput: () => <input data-testid="search-input" />,
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('EntryForm', () => {
  const defaultProps = {
    entryId: null,
    content: '',
    onContentChange: vi.fn(),
    topicId: null,
    onTopicChange: vi.fn(),
    topics: [],
    customFields: {},
    onCustomFieldsChange: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    onNew: vi.fn(),
    isEditing: false,
    isSaving: false,
    saveStatus: '',
  };

  it('renders editor', () => {
    renderWithTheme(<EntryForm {...defaultProps} />);
    expect(screen.getByTestId('editor')).toBeInTheDocument();
  });

  it('renders topic selector', () => {
    renderWithTheme(<EntryForm {...defaultProps} />);
    expect(screen.getByTestId('topic-selector')).toBeInTheDocument();
  });

  it('renders the save button', () => {
    renderWithTheme(<EntryForm {...defaultProps} />);
    expect(screen.getByText('Save entry')).toBeInTheDocument();
  });

  it('disables save button when content is empty', () => {
    renderWithTheme(<EntryForm {...defaultProps} content="" />);
    expect(screen.getByText('Save entry')).toBeDisabled();
  });

  it('enables save button when content is present', () => {
    renderWithTheme(<EntryForm {...defaultProps} content="Hello world" />);
    expect(screen.getByText('Save entry')).not.toBeDisabled();
  });

  it('shows Discard changes, wired to onNew', () => {
    const onNew = vi.fn();
    renderWithTheme(<EntryForm {...defaultProps} isEditing={true} entryId={1} onNew={onNew} />);
    fireEvent.click(screen.getByText('Discard changes'));
    expect(onNew).toHaveBeenCalled();
  });

  it('shows a save failure', () => {
    renderWithTheme(<EntryForm {...defaultProps} saveStatus="Save failed" />);
    expect(screen.getByText('Save failed')).toBeInTheDocument();
  });

  it('shows Saved for an existing entry', () => {
    renderWithTheme(<EntryForm {...defaultProps} isEditing entryId={1} />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('calls onSave when save button is clicked', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderWithTheme(
      <EntryForm {...defaultProps} content="Hello" onSave={onSave} />
    );
    fireEvent.click(screen.getByText('Save entry'));
    expect(onSave).toHaveBeenCalled();
  });

  describe('breadcrumb', () => {
    it('shows the Journal crumb for entries with no mapped topic', () => {
      renderWithTheme(<EntryForm {...defaultProps} />);
      expect(screen.getByText('Journal')).toBeInTheDocument();
      expect(screen.getByLabelText('Entry location')).toBeInTheDocument();
    });

    it('derives ancestors from the topic and keeps the picker as last crumb', () => {
      renderWithTheme(
        <EntryForm {...defaultProps} topicId={7}
          topics={[{ id: 7, name: 'Recipe', icon: null, color: null }]} />
      );
      expect(screen.getByText('From the Kitchen')).toBeInTheDocument();
      expect(screen.getByTestId('topic-selector')).toBeInTheDocument();
    });

    it('navigates when an ancestor crumb is clicked', () => {
      const onNavigate = vi.fn();
      renderWithTheme(
        <EntryForm {...defaultProps} onNavigate={onNavigate} topicId={7}
          topics={[{ id: 7, name: 'Recipe', icon: null, color: null }]} />
      );
      fireEvent.click(screen.getByText('From the Kitchen'));
      expect(onNavigate).toHaveBeenCalledWith('/kitchen');
    });

    it('renders ancestors as non-clickable without onNavigate', () => {
      renderWithTheme(<EntryForm {...defaultProps} />);
      expect(screen.getByText('Journal')).toBeDisabled();
    });
  });

  describe('hidden text area for structured topics', () => {
    it('hides the editor entirely for built-in structured topics (no Add notes affordance)', () => {
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={null} topicId={3}
          topics={[{ id: 3, name: 'Event', icon: null, color: null }]} content="" />
      );
      expect(screen.getByTestId('editor')).not.toBeVisible();
      expect(screen.queryByText(/add notes/i)).not.toBeInTheDocument();
    });

    it('hides the editor for custom topics with the hide-text option enabled', () => {
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={null} topicId={7}
          topics={[{ id: 7, name: 'Dreams', icon: null, color: null }]} content="" />
      );
      expect(screen.getByTestId('editor')).not.toBeVisible();
    });

    it('keeps the editor for custom topics without the hide option', () => {
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={2} isEditing topicId={5}
          topics={[{ id: 5, name: 'Garden', icon: null, color: null }]} content="" />
      );
      expect(screen.getByTestId('editor')).toBeVisible();
    });

    it('hides the editor for field-led topics like Books', () => {
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={2} isEditing topicId={5}
          topics={[{ id: 5, name: 'Books', icon: null, color: null }]} content="" />
      );
      expect(screen.getByTestId('editor')).not.toBeVisible();
    });

    it('keeps the editor for the Journal topic', () => {
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={2} isEditing topicId={9}
          topics={[{ id: 9, name: 'Journal', icon: null, color: null }]} content="" />
      );
      expect(screen.getByTestId('editor')).toBeVisible();
    });

    it('keeps existing text content visible on structured topics', () => {
      // (Events are the exception — they keep notes in their own Notes field)
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={2} isEditing topicId={3}
          topics={[{ id: 3, name: 'Meeting', icon: null, color: null }]} content="<p>Some notes</p>" />
      );
      expect(screen.getByTestId('editor')).toBeVisible();
    });
  });
});
