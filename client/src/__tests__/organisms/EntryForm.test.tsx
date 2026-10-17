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
      topicCustomFields: {
        5: [{ id: 'author', label: 'Author', type: 'text' }],
        11: [{ id: 'title', label: 'Title', type: 'text' }, { id: 'author', label: 'Author', type: 'text' }],
        12: [{ id: 'quote', label: 'Quote', type: 'text' }, { id: 'author', label: 'Author', type: 'text' }],
      },
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

  it('enables save for a fields-only entry with no text (e.g. only a yes/no field)', () => {
    renderWithTheme(
      <EntryForm {...defaultProps} content="" topicId={7}
        topics={[{ id: 7, name: 'Dreams', icon: null, color: null }]}
        customFields={{ _userFields: { lucid: true } }} />
    );
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

  it('offers Expand in the toolbar only when the view allows it', () => {
    const onToggleExpand = vi.fn();
    const { unmount } = renderWithTheme(<EntryForm {...defaultProps} onToggleExpand={onToggleExpand} />);
    fireEvent.click(screen.getByLabelText('Expand editor'));
    expect(onToggleExpand).toHaveBeenCalled();
    unmount();
    renderWithTheme(<EntryForm {...defaultProps} />);
    expect(screen.queryByLabelText('Expand editor')).not.toBeInTheDocument();
  });

  it('keeps the topic picker above the writing area', () => {
    renderWithTheme(
      <EntryForm {...defaultProps} topicId={7}
        topics={[{ id: 7, name: 'Recipe', icon: null, color: null }]} />
    );
    expect(screen.getByTestId('topic-selector')).toBeInTheDocument();
    expect(screen.queryByLabelText('Entry location')).not.toBeInTheDocument();
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

    it('hides the text area for shopping lists even when they have a title', () => {
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={2} isEditing topicId={4}
          topics={[{ id: 4, name: 'Shopping List', icon: null, color: null }]} content="<p>Shopping List: Oct 12 – Oct 18</p>" />
      );
      expect(screen.getByTestId('editor')).not.toBeVisible();
    });

    it('keeps the text area for tasks, even when empty', () => {
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={2} isEditing topicId={6}
          topics={[{ id: 6, name: 'Task', icon: null, color: null }]} content="" />
      );
      expect(screen.getByTestId('editor')).toBeVisible();
    });

    it('moves an old task description into the text area', () => {
      const onContentChange = vi.fn();
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={2} isEditing topicId={6}
          topics={[{ id: 6, name: 'Task', icon: null, color: null }]} content=""
          customFields={{ taskDescription: 'Call the vet' }} onContentChange={onContentChange} />
      );
      expect(onContentChange).toHaveBeenCalledWith('<p>Call the vet</p>');
    });

    it('hides the text area for meals whose text is just the meal name', () => {
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={2} isEditing topicId={8}
          topics={[{ id: 8, name: 'Meals', icon: null, color: null }]} content="<p>Oatmeal</p>"
          customFields={{ mealDescription: 'Oatmeal' }} />
      );
      expect(screen.getByTestId('editor')).not.toBeVisible();
    });

    it('hides the text area for meals but never overwrites writing beyond the name', () => {
      const onContentChange = vi.fn();
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={2} isEditing topicId={8}
          topics={[{ id: 8, name: 'Meals', icon: null, color: null }]} content="<p>Oatmeal at the cafe with Sam</p>"
          customFields={{ mealDescription: 'Oatmeal' }} onContentChange={onContentChange} />
      );
      expect(screen.getByTestId('editor')).not.toBeVisible();
      expect(onContentChange).not.toHaveBeenCalled();
    });

    it('medication: name field instead of a text area; old names move into it', () => {
      const onCustomFieldsChange = vi.fn();
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={11} isEditing topicId={15}
          topics={[{ id: 15, name: 'Medication', icon: null, color: null }]} content="<p>Montelukast</p>"
          customFields={{ dosage: '10mg' }} onCustomFieldsChange={onCustomFieldsChange} />
      );
      expect(screen.getByText('Medication Name')).toBeInTheDocument();
      expect(screen.getByTestId('editor')).not.toBeVisible();
      expect(onCustomFieldsChange).toHaveBeenCalledWith(expect.objectContaining({ medicationName: 'Montelukast', dosage: '10mg' }));
    });

    it('allergy: the Allergen field names the entry and there is no text area', () => {
      const onContentChange = vi.fn();
      const props = { ...defaultProps, entryId: 12, isEditing: true, topicId: 16,
        topics: [{ id: 16, name: 'Allergy', icon: null, color: null }], content: '<p>Peanuts</p>', onContentChange };
      const { rerender } = renderWithTheme(<EntryForm {...props} customFields={{ allergen: 'Peanuts' }} />);
      expect(screen.getByTestId('editor')).not.toBeVisible();
      rerender(<ThemeProvider theme={lightTheme}><EntryForm {...props} customFields={{ allergen: 'Tree nuts' }} /></ThemeProvider>);
      expect(onContentChange).toHaveBeenCalledWith('<p>Tree nuts</p>');
    });

    it('copies an old meal name from the text into Meal Description', () => {
      const onCustomFieldsChange = vi.fn();
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={3} isEditing topicId={8}
          topics={[{ id: 8, name: 'Meals', icon: null, color: null }]} content="<p>Lentil soup</p>"
          customFields={{}} onCustomFieldsChange={onCustomFieldsChange} />
      );
      expect(onCustomFieldsChange).toHaveBeenCalledWith(expect.objectContaining({ mealDescription: 'Lentil soup' }));
    });

    it('keeps the hidden meal text in step with an edited Meal Description', () => {
      const onContentChange = vi.fn();
      const props = { ...defaultProps, entryId: 4, isEditing: true, topicId: 8,
        topics: [{ id: 8, name: 'Meals', icon: null, color: null }], content: '<p>Toast</p>', onContentChange };
      const { rerender } = renderWithTheme(<EntryForm {...props} customFields={{ mealDescription: 'Toast' }} />);
      rerender(<ThemeProvider theme={lightTheme}><EntryForm {...props} customFields={{ mealDescription: 'Toast with jam' }} /></ThemeProvider>);
      expect(onContentChange).toHaveBeenCalledWith('<p>Toast with jam</p>');
    });

    it('writes a book as "Title — Author" and hides the text area', () => {
      const onContentChange = vi.fn();
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={5} isEditing topicId={11}
          topics={[{ id: 11, name: 'Books', icon: null, color: null }]} content=""
          customFields={{ _userFields: { title: 'Piranesi', author: 'Susanna Clarke' } }} onContentChange={onContentChange} />
      );
      expect(onContentChange).toHaveBeenCalledWith('<p>Piranesi — Susanna Clarke</p>');
      expect(screen.getByTestId('editor')).not.toBeVisible();
    });

    it('writes a quote as “Quote” — Author, replacing the old auto-summary', () => {
      const onContentChange = vi.fn();
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={6} isEditing topicId={12}
          topics={[{ id: 12, name: 'Quotes', icon: null, color: null }]} content="<p>Stay curious · Ada</p>"
          customFields={{ _userFields: { quote: 'Stay curious', author: 'Ada' } }} onContentChange={onContentChange} />
      );
      expect(onContentChange).toHaveBeenCalledWith('<p>“Stay curious” — Ada</p>');
      expect(screen.getByTestId('editor')).not.toBeVisible();
    });

    it('hides the text area on a book but never overwrites writing already there', () => {
      const onContentChange = vi.fn();
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={7} isEditing topicId={11}
          topics={[{ id: 11, name: 'Books', icon: null, color: null }]} content="<p>Loved the halls and the tides.</p>"
          customFields={{ _userFields: { title: 'Piranesi', author: 'Susanna Clarke' } }} onContentChange={onContentChange} />
      );
      expect(onContentChange).not.toHaveBeenCalled();
      expect(screen.getByTestId('editor')).not.toBeVisible();
    });

    it('moves a quote typed in the text area into the Quote field', () => {
      const onCustomFieldsChange = vi.fn();
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={8} isEditing topicId={12}
          topics={[{ id: 12, name: 'Quotes', icon: null, color: null }]} content="<p>Be here now</p>"
          customFields={{ _userFields: { author: 'Ram Dass' } }} onCustomFieldsChange={onCustomFieldsChange} />
      );
      expect(onCustomFieldsChange).toHaveBeenCalledWith(expect.objectContaining({
        _userFields: { author: 'Ram Dass', quote: 'Be here now' },
      }));
      expect(screen.getByTestId('editor')).not.toBeVisible();
    });

    it('titles exercise from its fields and hides the text area', () => {
      const onContentChange = vi.fn();
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={9} isEditing topicId={13}
          topics={[{ id: 13, name: 'Exercise', icon: null, color: null }]} content=""
          customFields={{ exerciseType: 'running', duration: '30', distance: '3', distanceUnit: 'miles' }} onContentChange={onContentChange} />
      );
      expect(onContentChange).toHaveBeenCalledWith('<p>Running · 30 min · 3 mi</p>');
      expect(screen.getByTestId('editor')).not.toBeVisible();
    });

    it('shows the menu plan fields (and no text area) for Menu Plan entries', () => {
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={10} isEditing topicId={14}
          topics={[{ id: 14, name: 'Menu Plan', icon: null, color: null }]} content="<p>Menu: Oct 12 – Oct 18</p>"
          customFields={{ weekStart: '2026-10-12', days: { '2026-10-12': { dinner: { mealName: 'Tacos', recipeId: null, recipeName: '' } } } }} />
      );
      expect(screen.getByText('Week Starting')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Tacos')).toBeInTheDocument();
      expect(screen.getByTestId('editor')).not.toBeVisible();
    });

    it('goals: the objective is the name — no text area; old text moves into it', () => {
      const onCustomFieldsChange = vi.fn();
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={20} isEditing topicId={17}
          topics={[{ id: 17, name: 'Goal', icon: null, color: null }]} content="<p>Run a 10k</p>"
          customFields={{ goalType: 'short_term' }} onCustomFieldsChange={onCustomFieldsChange} />
      );
      expect(screen.getByTestId('editor')).not.toBeVisible();
      expect(onCustomFieldsChange).toHaveBeenCalledWith(expect.objectContaining({ goalObjective: 'Run a 10k' }));
    });

    it('keeps the editor for the Journal topic', () => {
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={2} isEditing topicId={9}
          topics={[{ id: 9, name: 'Journal', icon: null, color: null }]} content="" />
      );
      expect(screen.getByTestId('editor')).toBeVisible();
    });

    it('keeps existing text content visible on structured topics', () => {
      // (Name-led topics — events, meetings, meals, recipes… — are the exception:
      // their text becomes the name field)
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={2} isEditing topicId={3}
          topics={[{ id: 3, name: 'Symptom', icon: null, color: null }]} content="<p>Some notes</p>" />
      );
      expect(screen.getByTestId('editor')).toBeVisible();
    });
  });
});
