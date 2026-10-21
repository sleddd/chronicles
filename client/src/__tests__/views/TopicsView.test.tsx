import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { TopicsView } from '@/views/TopicsView';
import { renderWithTheme } from '../testUtils';
import { useInitializeData } from '@/hooks/useInitializeData';

const mockNavigate = vi.fn();

vi.mock('../../services/privateSettings.js', () => ({
  usePrivateSettings: () => ({ savePrivateSetting: vi.fn().mockResolvedValue(undefined), loadPrivateSettings: vi.fn().mockResolvedValue({}) }),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => mockNavigate),
}));

vi.mock('@/hooks/useInitializeData', () => ({
  useInitializeData: vi.fn(() => ({
    isReady: true,
    isLoading: false,
    needsUnlock: false,
    handleUnlock: vi.fn(),
  })),
}));

vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: vi.fn((selector: (s: any) => any) =>
    selector({
      allTopics: [
        { id: 1, name: 'Journal', icon: 'book', color: null },
        { id: 2, name: 'Goal', icon: 'bullseye', color: null },
      ],
      topics: [
        { id: 1, name: 'Journal', icon: 'book', color: null },
        { id: 2, name: 'Goal', icon: 'bullseye', color: null },
      ],
      decryptedEntries: [
        { id: 10, metadata: { _taxonomyId: 1 } },
        { id: 11, metadata: { _taxonomyId: 1 } },
      ],
      setTopics: vi.fn(),
    })
  ),
}));

vi.mock('@/stores/uiStore', () => {
  const fn: any = vi.fn((selector: (s: any) => any) =>
    selector({
      accentColor: '#4A5568',
      topicCustomFields: {},
      updateTopicFields: vi.fn(),
    })
  );
  fn.getState = () => ({ topicCustomFields: {} });
  return { useUIStore: fn };
});

vi.mock('@/services/api', () => ({
  topics: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), reorder: vi.fn() },
  settings: { upsert: vi.fn(() => Promise.resolve()) },
}));

vi.mock('@/components/templates/ContentTemplate', () => ({
  ContentTemplate: ({ children }: any) => <div data-testid="content-template">{children}</div>,
}));

vi.mock('@/components/atoms/EmptyState', () => ({
  EmptyState: ({ message }: any) => <div data-testid="empty-state">{message}</div>,
}));

vi.mock('@/components/atoms/Spinner', () => ({
  Spinner: () => <span data-testid="spinner">Loading...</span>,
}));

vi.mock('@/components/molecules/TopicEditForm', () => ({
  TopicEditForm: () => <div data-testid="topic-edit-form" />,
}));

vi.mock('@/components/organisms/UnlockDialog', () => ({
  UnlockDialog: () => <div data-testid="unlock-dialog" />,
}));

describe('TopicsView', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    vi.mocked(useInitializeData).mockReturnValue({
      isReady: true,
      isLoading: false,
      needsUnlock: false,
      handleUnlock: vi.fn(),
    });
  });

  it('renders the Topics title', () => {
    renderWithTheme(<TopicsView />);
    expect(screen.getByText('Topics')).toBeInTheDocument();
  });

  it('lists each topic with its entry count', () => {
    renderWithTheme(<TopicsView />);
    expect(screen.getByText('Journal')).toBeInTheDocument();
    expect(screen.getByText('Goal')).toBeInTheDocument();
    expect(screen.getByText(/2 entries/)).toBeInTheDocument();
  });

  it('navigates to the topic page when a row is clicked', () => {
    renderWithTheme(<TopicsView />);
    fireEvent.click(screen.getByText('Journal'));
    expect(mockNavigate).toHaveBeenCalledWith('/topics/1');
  });

  it('has a New topic button in the header that opens the form', () => {
    renderWithTheme(<TopicsView />);
    fireEvent.click(screen.getByRole('button', { name: 'New topic' }));
    expect(screen.getByTestId('topic-edit-form')).toBeInTheDocument();
  });

  it('filters the list by name as you type, and Escape clears it', () => {
    renderWithTheme(<TopicsView />);
    const search = screen.getByRole('searchbox', { name: 'Search topics' });
    fireEvent.change(search, { target: { value: 'go' } });
    expect(screen.getByText('Goal')).toBeInTheDocument();
    expect(screen.queryByText('Journal')).toBeNull();
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText('No topics match “zzz”.')).toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search).toHaveValue('');
    expect(screen.getByText('Journal')).toBeInTheDocument();
  });
});

describe('TopicsView (needs unlock)', () => {
  beforeEach(() => {
    vi.mocked(useInitializeData).mockReturnValue({
      isReady: false,
      isLoading: false,
      needsUnlock: true,
      handleUnlock: vi.fn(),
    });
  });

  it('shows unlock dialog', () => {
    renderWithTheme(<TopicsView />);
    expect(screen.getByTestId('unlock-dialog')).toBeInTheDocument();
  });
});

describe('TopicsView (loading)', () => {
  beforeEach(() => {
    vi.mocked(useInitializeData).mockReturnValue({
      isReady: false,
      isLoading: true,
      needsUnlock: false,
      handleUnlock: vi.fn(),
    });
  });

  it('shows loading spinner', () => {
    renderWithTheme(<TopicsView />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });
});
