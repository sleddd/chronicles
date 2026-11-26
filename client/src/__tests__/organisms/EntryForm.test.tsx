import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { EntryForm } from '@/components/organisms/EntryForm';

// A milestone's attached tasks save themselves (they need the encryption context)
vi.mock('@/hooks/useSaveFields', () => ({ useSaveFields: () => vi.fn() }));
vi.mock('@/hooks/useCreateEntry', () => ({ useCreateEntry: () => vi.fn() }));
vi.mock('@/hooks/useOpenInJournal', () => ({ useOpenInJournal: () => vi.fn(), useNewEntryInJournal: () => vi.fn() }));
vi.mock('@/hooks/useEncryptedSetting', () => ({
  useEncryptedSetting: (_key: string, fallback: unknown) => [fallback, vi.fn(), true],
}));

vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      decryptedEntries: [],
      allTopics: [],
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
        40: [{ id: 'title', label: 'Title', type: 'text' }, { id: 'host', label: 'Host', type: 'text' }],
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
  ToolbarRow: 'div',
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
  TopicSelector: ({ selectedId, onSelect, label }: { selectedId: number | null; onSelect: (id: number | null) => void; label?: (name: string) => string }) => (
    <>
      {/* The trigger's words, as the real picker shows them */}
      {label && <span>{label('Journal')}</span>}
      <select
        data-testid="topic-selector"
        value={selectedId ?? ''}
        onChange={e => onSelect(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">No topic</option>
      </select>
    </>
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

  it('Hide from AI is one button in the tools: the AI mark, pressed (slashed) once hidden', () => {
    const onToggle = vi.fn();
    const { rerender } = renderWithTheme(<EntryForm {...defaultProps} entryId={3} isEditing onToggleAiHidden={onToggle} />);
    const shared = screen.getByRole('button', { name: /^Shared with AI\. Hide from every AI feature/ });
    expect(shared).toHaveAttribute('aria-pressed', 'false');
    // In with the other tools, and no "In-App AI" row or Hide checkbox any more
    expect(shared.parentElement).toBe(screen.getByRole('button', { name: /bookmark/i }).parentElement);
    expect(screen.queryByText('In-App AI')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Hide' })).not.toBeInTheDocument();
    fireEvent.click(shared);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<ThemeProvider theme={lightTheme}><EntryForm {...defaultProps} entryId={3} isEditing aiHidden onToggleAiHidden={onToggle} /></ThemeProvider>);
    expect(screen.getByRole('button', { name: 'Hidden from AI. Share with AI again' })).toHaveAttribute('aria-pressed', 'true');

    // Its whole topic is hidden: slashed, and not switched from here
    rerender(<ThemeProvider theme={lightTheme}><EntryForm {...defaultProps} entryId={3} isEditing aiHiddenByTopic onToggleAiHidden={onToggle} /></ThemeProvider>);
    const byTopic = screen.getByRole('button', { name: /its topic is hidden/ });
    expect(byTopic).toBeDisabled();
    expect(byTopic).toHaveAttribute('aria-pressed', 'true');
  });

  it('there is no AI button without an AI on, or in the Quick entry', () => {
    renderWithTheme(<EntryForm {...defaultProps} entryId={3} isEditing />);
    expect(screen.queryByRole('button', { name: /AI/ })).not.toBeInTheDocument();
  });

  it('a task opens in the task card: format switch, Priority in the title box, then Status, Contributes to, Time estimate, When and Notes', () => {
    const onChange = vi.fn();
    renderWithTheme(<EntryForm {...defaultProps} topicId={9} topics={[{ id: 9, name: 'Task', icon: null, color: null } as never]}
      customFields={{ priority: 'none' }} onCustomFieldsChange={onChange} entryId={3} isEditing onDelete={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Single task' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    // ("Planned" is also a Status choice, so look for the row names as words on the card)
    const rows = ['Title', 'Status', 'Contributes to', 'Time estimate', 'When', 'Notes'];
    for (const row of rows) expect(screen.getAllByText(row).some(el => el.tagName === 'DIV')).toBe(true);
    // In that order: Status first under the title, where it's reached for
    const names = [...document.querySelectorAll('div')].map(el => el.textContent).filter(t => rows.includes(t ?? ''));
    expect(names.filter((t, i) => names.indexOf(t) === i)).toEqual(rows);
    // Priority moved into the title box's foot: no row of its own
    expect(screen.queryAllByText('Priority').some(el => el.tagName === 'DIV')).toBe(false);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'in_progress' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ isInProgress: true }));
    // Goal, Milestone and Type are three pickers
    for (const label of ['Goal', 'Milestone', 'Type']) expect(screen.getByLabelText(label)).toBeInTheDocument();
    // Time estimate is typed: read when the box is left
    const est = screen.getByLabelText('Time estimate');
    fireEvent.focus(est);
    fireEvent.change(est, { target: { value: '1.5 h' } });
    fireEvent.blur(est);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ estimatedMinutes: 90 }));
    // When: Starts (planned day + time) and Ends (the deadline) in one box, with All day
    expect(screen.getByLabelText('Planned for')).toBeInTheDocument();
    expect(screen.getByLabelText('Planned time')).toBeInTheDocument();
    expect(screen.getByLabelText('Deadline')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: '2026-11-30' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ deadline: '2026-11-30' }));
    expect(screen.getByRole('button', { name: /^Time:/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete/ })).toBeInTheDocument();
    // The old chip rows are gone (no Time of day)
    expect(screen.queryByText('Time of day')).toBeNull();
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'high' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ priority: 'high' }));
  });

  it('a goal has Status as its first row and Category in the title box foot', () => {
    const onChange = vi.fn();
    renderWithTheme(<EntryForm {...defaultProps} topicId={9} topics={[{ id: 9, name: 'Goal', icon: null, color: null } as never]}
      customFields={{ goalStatus: 'new' }} onCustomFieldsChange={onChange} entryId={3} isEditing />);
    expect(screen.getAllByLabelText('Status')).toHaveLength(1);
    expect(screen.getAllByLabelText('Category')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'paused' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ goalStatus: 'paused' }));
  });

  it('a milestone has Status as its first row and Goal in the title box foot', () => {
    renderWithTheme(<EntryForm {...defaultProps} topicId={9} topics={[{ id: 9, name: 'Milestone', icon: null, color: null } as never]}
      customFields={{}} entryId={3} isEditing />);
    expect(screen.getAllByLabelText('Status')).toHaveLength(1);
    expect(screen.getAllByLabelText('Goal')).toHaveLength(1);
  });

  it('a meal picks Breakfast / Lunch… in its When row, beside the date', () => {
    const onChange = vi.fn();
    renderWithTheme(<EntryForm {...defaultProps} topicId={9} topics={[{ id: 9, name: 'Meals', icon: null, color: null } as never]}
      customFields={{ mealType: 'breakfast' }} onCustomFieldsChange={onChange} entryId={3} isEditing />);
    expect(screen.getAllByLabelText('Meal')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Meal'), { target: { value: 'lunch' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ mealType: 'lunch' }));
  });

  it('a text-only topic has no label; its tools sit in the foot beside Delete, with Save', () => {
    renderWithTheme(<EntryForm {...defaultProps} content="<p>Hello</p>" entryId={5} isEditing onDelete={vi.fn()} />);
    // Journal (no fields): no "Text" label; no Status (that's the task card's)
    expect(screen.queryAllByText('Text').some(el => el.tagName === 'DIV')).toBe(false);
    expect(screen.queryByLabelText('Status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Formatting' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete/ })).toBeInTheDocument();
    expect(screen.getByText('Save entry')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  });

  it('the Quick entry keeps each field\'s own hint (no "Enter title/text..." over them)', () => {
    renderWithTheme(<EntryForm {...defaultProps} variant="quick" quickOpen topicId={6}
      topics={[{ id: 6, name: 'Event', icon: null, color: null } as never]} />);
    for (const label of ['Venue name', 'Full address', 'Contact number']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('placeholder', label);
    }
    expect(screen.queryAllByPlaceholderText('Enter title/text...').filter(el => el.tagName === 'INPUT')).toHaveLength(0);
  });

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

  describe('the text area and name-led topics', () => {
    it('shows the text area for events: its first line is the name, asked for in the placeholder', () => {
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={null} topicId={3}
          topics={[{ id: 3, name: 'Event', icon: null, color: null }]} content="" />
      );
      expect(screen.getByTestId('editor')).toBeVisible();
      expect(screen.getByTestId('editor')).toHaveAttribute('placeholder', 'What is the event?');
    });

    it('no longer hides the text area for a custom topic that had the old hide-text option', () => {
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={null} topicId={7}
          topics={[{ id: 7, name: 'Dreams', icon: null, color: null }]} content="" />
      );
      expect(screen.getByTestId('editor')).toBeVisible();
    });

    it('keeps the editor for custom topics without the hide option', () => {
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={2} isEditing topicId={5}
          topics={[{ id: 5, name: 'Garden', icon: null, color: null }]} content="" />
      );
      expect(screen.getByTestId('editor')).toBeVisible();
    });

    it('shows a field-led topic\'s own fields in the outlined style (title first)', () => {
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={20} isEditing topicId={11}
          topics={[{ id: 11, name: 'Books', icon: null, color: null }]} content=""
          customFields={{ _userFields: { title: 'Piranesi', author: 'Susanna Clarke' } }} />
      );
      expect(screen.getByLabelText('Title')).toHaveValue('Piranesi');
      expect(screen.getByLabelText('Author')).toHaveValue('Susanna Clarke');
    });

    it('keeps the text area for Music when the topic has no fields yet', () => {
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={21} isEditing topicId={30}
          topics={[{ id: 30, name: 'Music', icon: null, color: null }]} content="<p>Khruangbin</p>" />
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

    it('tasks: the text area shows and its first line fills the task name', () => {
      const onCustomFieldsChange = vi.fn();
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={2} isEditing topicId={6}
          topics={[{ id: 6, name: 'Task', icon: null, color: null }]} content="<p>Call the vet</p><p>Ask about the booster</p>"
          onCustomFieldsChange={onCustomFieldsChange} />
      );
      expect(screen.getByTestId('editor')).toBeVisible();
      expect(onCustomFieldsChange).toHaveBeenCalledWith(expect.objectContaining({ taskDescription: 'Call the vet' }));
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

    it('shows the text area for a meal whose text is its name, and changes nothing', () => {
      const onContentChange = vi.fn();
      const onCustomFieldsChange = vi.fn();
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={2} isEditing topicId={8}
          topics={[{ id: 8, name: 'Meals', icon: null, color: null }]} content="<p>Oatmeal</p>"
          customFields={{ mealDescription: 'Oatmeal' }} onContentChange={onContentChange} onCustomFieldsChange={onCustomFieldsChange} />
      );
      expect(screen.getByTestId('editor')).toBeVisible();
      expect(onContentChange).not.toHaveBeenCalled();
      expect(onCustomFieldsChange).not.toHaveBeenCalled();
    });

    it('an older meal whose text doesn’t start with its name gets the name put in front, the writing kept', () => {
      const onContentChange = vi.fn();
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={2} isEditing topicId={8}
          topics={[{ id: 8, name: 'Meals', icon: null, color: null }]} content="<p>At the cafe with Sam</p>"
          customFields={{ mealDescription: 'Oatmeal' }} onContentChange={onContentChange} />
      );
      expect(onContentChange).toHaveBeenCalledWith('<p>Oatmeal</p><p>At the cafe with Sam</p>');
    });

    it('medication: the first line fills Medication name; the form’s own name box stays out of sight', () => {
      const onCustomFieldsChange = vi.fn();
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={11} isEditing topicId={15}
          topics={[{ id: 15, name: 'Medication', icon: null, color: null }]} content="<p>Montelukast</p>"
          customFields={{ dosage: '10mg' }} onCustomFieldsChange={onCustomFieldsChange} />
      );
      expect(screen.getByTestId('editor')).toBeVisible();
      expect(screen.getByLabelText('Medication name')).not.toBeVisible();
      expect(onCustomFieldsChange).toHaveBeenCalledWith(expect.objectContaining({ medicationName: 'Montelukast', dosage: '10mg' }));
    });

    it('allergy: editing the first line keeps Allergen in step', () => {
      const onCustomFieldsChange = vi.fn();
      const props = { ...defaultProps, entryId: 12, isEditing: true, topicId: 16,
        topics: [{ id: 16, name: 'Allergy', icon: null, color: null }], customFields: { allergen: 'Peanuts' }, onCustomFieldsChange };
      const { rerender } = renderWithTheme(<EntryForm {...props} content="<p>Peanuts</p>" />);
      expect(onCustomFieldsChange).not.toHaveBeenCalled();
      rerender(<ThemeProvider theme={lightTheme}><EntryForm {...props} content="<p>Tree nuts</p><p>Hives last time</p>" /></ThemeProvider>);
      expect(onCustomFieldsChange).toHaveBeenCalledWith(expect.objectContaining({ allergen: 'Tree nuts' }));
    });

    it('switching a new entry to a name-led topic carries the typed text into its name (Quick entry bug)', () => {
      const onCustomFieldsChange = vi.fn();
      const onContentChange = vi.fn();
      const topics = [{ id: 1, name: 'Journal', icon: null, color: null }, { id: 8, name: 'Meals', icon: null, color: null }];
      const props = { ...defaultProps, topics, content: '<p>Oatmeal with berries</p>', onCustomFieldsChange, onContentChange };
      const { rerender } = renderWithTheme(<EntryForm {...props} topicId={1} customFields={{}} />);
      expect(onCustomFieldsChange).not.toHaveBeenCalled();
      rerender(<ThemeProvider theme={lightTheme}><EntryForm {...props} topicId={8} customFields={{}} /></ThemeProvider>);
      expect(onCustomFieldsChange).toHaveBeenCalledWith(expect.objectContaining({ mealDescription: 'Oatmeal with berries' }));
      expect(onContentChange).not.toHaveBeenCalledWith('');
    });

    it('switching to a topic whose title is its own custom field carries the typed text into that title', () => {
      const onCustomFieldsChange = vi.fn();
      const topics = [{ id: 1, name: 'Journal', icon: null, color: null }, { id: 11, name: 'Books', icon: null, color: null }];
      const props = { ...defaultProps, topics, content: '<p>The Left Hand of Darkness</p>', onCustomFieldsChange };
      const { rerender } = renderWithTheme(<EntryForm {...props} topicId={1} customFields={{}} />);
      rerender(<ThemeProvider theme={lightTheme}><EntryForm {...props} topicId={11} customFields={{}} /></ThemeProvider>);
      expect(onCustomFieldsChange).toHaveBeenCalledWith(expect.objectContaining({
        _userFields: expect.objectContaining({ title: 'The Left Hand of Darkness' }),
      }));
    });

    it('switching topic never overwrites a name that is already filled', () => {
      const onCustomFieldsChange = vi.fn();
      const topics = [{ id: 1, name: 'Journal', icon: null, color: null }, { id: 8, name: 'Meals', icon: null, color: null }];
      const props = { ...defaultProps, topics, content: '<p>Some notes</p>', onCustomFieldsChange };
      const { rerender } = renderWithTheme(<EntryForm {...props} topicId={1} customFields={{ mealDescription: 'Lentil soup' }} />);
      rerender(<ThemeProvider theme={lightTheme}><EntryForm {...props} topicId={8} customFields={{ mealDescription: 'Lentil soup' }} /></ThemeProvider>);
      expect(onCustomFieldsChange).not.toHaveBeenCalledWith(expect.objectContaining({ mealDescription: 'Some notes' }));
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
      expect(screen.getByText('Week starting')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Tacos')).toBeInTheDocument();
      expect(screen.getByTestId('editor')).not.toBeVisible();
    });

    it('goals: the text area shows and its first line is the objective', () => {
      const onCustomFieldsChange = vi.fn();
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={20} isEditing topicId={17}
          topics={[{ id: 17, name: 'Goal', icon: null, color: null }]} content="<p>Run a 10k</p>"
          customFields={{ goalType: 'short_term' }} onCustomFieldsChange={onCustomFieldsChange} />
      );
      expect(screen.getByTestId('editor')).toBeVisible();
      expect(onCustomFieldsChange).toHaveBeenCalledWith(expect.objectContaining({ goalObjective: 'Run a 10k' }));
    });

    it('keeps the editor for the Journal topic', () => {
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={2} isEditing topicId={9}
          topics={[{ id: 9, name: 'Journal', icon: null, color: null }]} content="" />
      );
      expect(screen.getByTestId('editor')).toBeVisible();
    });

    it('symptoms: the first line is the symptom name', () => {
      const onCustomFieldsChange = vi.fn();
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={2} isEditing topicId={3} onCustomFieldsChange={onCustomFieldsChange}
          topics={[{ id: 3, name: 'Symptom', icon: null, color: null }]} content="<p>Runny nose</p>" />
      );
      expect(screen.getByTestId('editor')).toBeVisible();
      expect(onCustomFieldsChange).toHaveBeenCalledWith(expect.objectContaining({ symptomName: 'Runny nose' }));
    });

    it('an own topic with a leading Title field: the first line fills it', () => {
      const onCustomFieldsChange = vi.fn();
      renderWithTheme(
        <EntryForm {...defaultProps} entryId={30} isEditing topicId={40}
          topics={[{ id: 40, name: 'Podcasts', icon: null, color: null }]} content="<p>Hardcore History</p>"
          customFields={{}} onCustomFieldsChange={onCustomFieldsChange} />
      );
      expect(screen.getByTestId('editor')).toBeVisible();
      expect(onCustomFieldsChange).toHaveBeenCalledWith(expect.objectContaining({
        _userFields: expect.objectContaining({ title: 'Hardcore History' }),
      }));
    });
  });

  it('a journal entry with no topic picked asks for one (even once autosaved); a picked one names it', () => {
    const { unmount } = renderWithTheme(<EntryForm {...defaultProps} />);
    expect(screen.getByText('choose a topic')).toBeInTheDocument();
    unmount();
    const { unmount: unmount2 } = renderWithTheme(<EntryForm {...defaultProps} entryId={4} isEditing />);
    expect(screen.getByText('choose a topic')).toBeInTheDocument();
    unmount2();
    renderWithTheme(<EntryForm {...defaultProps} entryId={4} topicId={1} isEditing />);
    expect(screen.getByText('journal')).toBeInTheDocument();
  });

  describe('Quick entry', () => {
    it('Escape inside it, once open, clears it back to the question', () => {
      const onNew = vi.fn();
      renderWithTheme(<EntryForm {...defaultProps} variant="quick" quickOpen onNew={onNew} />);
      fireEvent.keyDown(screen.getByTestId('editor'), { key: 'Escape' });
      expect(onNew).toHaveBeenCalledTimes(1);
    });

    it('Escape with nothing focused (the picker just swapped out) clears it too', () => {
      const onNew = vi.fn();
      renderWithTheme(<EntryForm {...defaultProps} variant="quick" quickOpen onNew={onNew} />);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(onNew).toHaveBeenCalledTimes(1);
    });

    it('Escape a field already used (its own add box) is left alone', () => {
      const onNew = vi.fn();
      renderWithTheme(<EntryForm {...defaultProps} variant="quick" quickOpen onNew={onNew} />);
      const editor = screen.getByTestId('editor');
      editor.addEventListener('keydown', e => e.preventDefault());
      fireEvent.keyDown(editor, { key: 'Escape' });
      expect(onNew).not.toHaveBeenCalled();
    });

    it('waits asking for a topic — "choose a topic", never naming Journal', () => {
      renderWithTheme(<EntryForm {...defaultProps} variant="quick" quickOpen={false} />);
      expect(screen.getByText('choose a topic')).toBeInTheDocument();
      expect(screen.queryByText('a journal')).not.toBeInTheDocument();
    });

    it('Escape does nothing while it waits with the question', () => {
      const onNew = vi.fn();
      const { container } = renderWithTheme(<EntryForm {...defaultProps} variant="quick" quickOpen={false} onNew={onNew} />);
      fireEvent.keyDown(container.querySelector('h2')!, { key: 'Escape' });
      expect(onNew).not.toHaveBeenCalled();
    });
  });
});
