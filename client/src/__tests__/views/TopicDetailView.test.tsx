import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { TopicDetailView } from '@/views/TopicDetailView';
import { useUIStore } from '@/stores/uiStore';
import { renderWithTheme } from '../testUtils';

vi.mock('../../services/privateSettings.js', () => ({
  usePrivateSettings: () => ({ savePrivateSetting: vi.fn().mockResolvedValue(undefined), loadPrivateSettings: vi.fn().mockResolvedValue({}) }),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => vi.fn()),
  useParams: vi.fn(() => ({ topicId: '7' })),
}));
vi.mock('@/hooks/useOpenInJournal', () => ({ useOpenInJournal: () => vi.fn(), useNewEntryInJournal: () => vi.fn() }));
vi.mock('@/hooks/useInitializeData', () => ({ useInitializeData: vi.fn(() => ({ isReady: true, isLoading: false })) }));

const { state } = vi.hoisted(() => {
  const now = new Date();
  const lastYear = new Date(now.getFullYear() - 1, 9, 22);
  return {
    state: {
      allTopics: [{ id: 7, name: 'Code Snippets', icon: 'code', color: null }],
      decryptedEntries: [
        { id: 1, createdAt: now, content: '<p>Debounce helper</p><pre><code>const debounce = (fn) =&gt; {\n}</code></pre>',
          metadata: { _taxonomyId: 7, _customFields: { tags: ['JavaScript'], _isFavorite: true } } },
        { id: 2, createdAt: now, content: '<p>Code review</p><p>Checklist: escaping on output</p>',
          metadata: { _taxonomyId: 7, _customFields: { tags: ['PHP', 'WordPress'] } } },
        { id: 3, createdAt: lastYear, content: '<pre><code>add_filter( "comments_open", "__return_false" );</code></pre>',
          metadata: { _taxonomyId: 7 } },
      ],
      setTopics: vi.fn(),
    } as any,
  };
});
vi.mock('@/stores/entriesStore', () => ({ useEntriesStore: vi.fn((selector: (s: any) => any) => selector(state)) }));
vi.mock('@/stores/uiStore', () => {
  const ui = { accentColor: '#34a5a2', topicCustomFields: {}, updateTopicFields: vi.fn() };
  const fn: any = vi.fn((selector: (s: any) => any) => selector(ui));
  fn.getState = () => ui;
  return { useUIStore: fn };
});
vi.mock('@/services/api', () => ({ topics: { update: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/templates/ContentTemplate', () => ({ ContentTemplate: ({ children }: any) => <div>{children}</div> }));

describe('TopicDetailView', () => {
  it('lists a text topic as a table: title and next line, code in code type, tags, lines and date, by month', () => {
    renderWithTheme(<TopicDetailView />);
    expect(screen.getAllByRole('columnheader').map(c => c.textContent)).toEqual(['Entry', 'Tags', 'Lines', 'Date']);
    const months = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
    expect(months).toHaveLength(2);
    const debounce = screen.getByRole('button', { name: /Debounce helper/ }).closest('[role="row"]') as HTMLElement;
    expect(within(debounce).getByText('const debounce = (fn) => {').className).toContain('code');
    expect(within(debounce).getByText('JavaScript')).toBeTruthy();
    expect(within(debounce).getByText('3')).toBeTruthy();
    expect(within(debounce).getByLabelText('Bookmarked')).toBeTruthy();
    const review = screen.getByRole('button', { name: /Code review/ }).closest('[role="row"]') as HTMLElement;
    expect(within(review).getByText('PHP +1')).toBeTruthy();
    // No count: the search sits at the filter row's end
    expect(screen.queryByText(/this month/)).toBeNull();
    expect(screen.getByRole('group', { name: 'Show Code Snippets' }).querySelector('input[type="search"], input')).toBeTruthy();
  });

  it('narrows to a tag and groups by tag', () => {
    renderWithTheme(<TopicDetailView />);
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'PHP' } });
    expect(screen.queryByRole('button', { name: /Debounce helper/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Code review/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'tag' } });
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(['JavaScript', 'PHP', 'WordPress', 'No tag']);
  });

  it('titles a row by its first field’s own value: a yes / no field never, a 0 always', () => {
    const ui = (useUIStore as any).getState();
    const before = state.decryptedEntries;
    ui.topicCustomFields = { 7: [{ id: 'done', label: 'Done', type: 'boolean' }, { id: 'name', label: 'Name', type: 'text' }] };
    state.decryptedEntries = [{ id: 9, createdAt: new Date(), content: '<p>From the text</p>', metadata: { _taxonomyId: 7, _customFields: { _userFields: { done: true, name: 'Second field' } } } }];
    const { unmount } = renderWithTheme(<TopicDetailView />);
    expect(screen.getByRole('button', { name: /From the text/ })).toBeTruthy();
    unmount();
    ui.topicCustomFields = { 7: [{ id: 'count', label: 'Count', type: 'number' }] };
    state.decryptedEntries = [{ id: 10, createdAt: new Date(), content: '<p>Text line</p>', metadata: { _taxonomyId: 7, _customFields: { _userFields: { count: 0 } } } }];
    renderWithTheme(<TopicDetailView />);
    expect(screen.getByRole('button', { name: /^0/ })).toBeTruthy();
    ui.topicCustomFields = {};
    state.decryptedEntries = before;
  });
});
