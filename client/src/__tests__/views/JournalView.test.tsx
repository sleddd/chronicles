import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { JournalView } from '@/views/JournalView';
import { renderWithTheme } from '../testUtils';
import { useEncryption } from '@/contexts/EncryptionContext';

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => vi.fn()),
  useLocation: vi.fn(() => ({ pathname: '/journal', state: null })),
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    encryptionData: { encryptionEnabled: true, kekSalt: 'salt', encryptedMasterKey: 'mk', kekWrapIv: 'iv' },
  })),
}));

vi.mock('@/contexts/EncryptionContext', () => ({
  useEncryption: vi.fn(() => ({
    isUnlocked: false,
    unlock: vi.fn(),
    decryptPosts: vi.fn().mockResolvedValue([]),
    encryptPost: vi.fn(),
  })),
}));

// Stable setter references to avoid infinite re-renders
const { setters, entriesState, uiState } = vi.hoisted(() => {
  const setters = {
    setDecryptedEntries: (() => {}) as any,
    setRawEntries: (() => {}) as any,
    setTopics: (() => {}) as any,
    setFeatureFlags: (() => {}) as any,
    setLoading: (() => {}) as any,
    addDecryptedEntry: (() => {}) as any,
    updateDecryptedEntry: (() => {}) as any,
    removeEntry: (() => {}) as any,
    setSelectedEntryId: (() => {}) as any,
    setShowMobileEditor: (() => {}) as any,
    setSelectedTopicId: (() => {}) as any,
    setHeaderColor: (() => {}) as any,
    setThemeMode: (() => {}) as any,
    setBackgroundImage: (() => {}) as any,
    setBackgroundOpacity: (() => {}) as any,
  };

  const entriesState = {
    decryptedEntries: [] as any[],
    topics: [] as any[],
    isInitialized: true,
    isLoading: false,
    ...setters,
  };

  const uiState = {
    selectedEntryId: null,
    showMobileEditor: false,
    viewMode: 'date' as const,
    selectedDate: new Date(2024, 5, 15),
    selectedTopicId: null,
    topicCustomFields: {},
    topicHideText: {},
    headerColor: '#4A5568',
    backgroundImage: '',
    ...setters,
  };
  return { setters, entriesState, uiState };
});

// Mocked stores start from the real stores' full initial state (so new
// fields/setters don't break this test) with the overrides above on top.
// Built once, so every selector returns stable references.
vi.mock('@/stores/entriesStore', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/stores/entriesStore')>();
  const state = Object.assign({}, real.useEntriesStore.getState(), entriesState);
  Object.assign(entriesState, state);
  const fn = vi.fn((selector?: (s: any) => any) =>
    selector ? selector(entriesState) : entriesState
  );
  (fn as any).getState = () => entriesState;
  return { ...real, useEntriesStore: fn };
});

vi.mock('@/stores/uiStore', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/stores/uiStore')>();
  const state = Object.assign({}, real.useUIStore.getState(), uiState);
  Object.assign(uiState, state);
  const fn = vi.fn((selector?: (s: any) => any) =>
    selector ? selector(uiState) : uiState
  );
  (fn as any).getState = () => uiState;
  return { ...real, useUIStore: fn };
});

vi.mock('@/services/api', () => ({
  entries: { getAll: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  topics: { getAll: vi.fn().mockResolvedValue([]) },
  settings: { getAll: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/components/templates/AppTemplate', () => ({
  AppTemplate: ({ children }: any) => <div data-testid="app-template">{children}</div>,
}));

vi.mock('@/components/templates/JournalTemplate', () => ({
  JournalTemplate: ({ sidePanel, editorPanel }: any) => (
    <div data-testid="journal-template">{sidePanel}{editorPanel}</div>
  ),
  SidePanel: ({ children }: any) => <div data-testid="side-panel">{children}</div>,
  EditorPanel: ({ children }: any) => <div data-testid="editor-panel">{children}</div>,
  MobileBackButton: ({ onClick }: any) => <button onClick={onClick}>Back</button>,
}));

vi.mock('@/components/atoms/LoadingCenter', () => ({
  LoadingCenter: ({ children }: any) => <div data-testid="loading-center">{children}</div>,
}));

vi.mock('@/components/atoms/EmptyEditor', () => ({
  EmptyEditor: ({ children }: any) => <div data-testid="empty-editor">{children}</div>,
}));

vi.mock('@/components/atoms/SidePadding', () => ({
  SidePadding: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/atoms/QuickEntryCard', () => ({
  QuickEntryCard: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/atoms/Spinner', () => ({
  Spinner: () => <span data-testid="spinner">Loading...</span>,
}));

vi.mock('@/components/molecules/TopicFilterBar', () => ({
  TopicFilterBar: () => <div data-testid="topic-filter-bar" />,
}));

vi.mock('@/components/organisms/ViewTabs', () => ({
  ViewTabs: () => <div data-testid="view-tabs" />,
}));

vi.mock('@/components/organisms/QuickEntry', () => ({
  QuickEntry: () => <div data-testid="quick-entry" />,
}));

vi.mock('@/components/organisms/EntryList', () => ({
  EntryList: () => <div data-testid="entry-list" />,
}));

vi.mock('@/components/organisms/EntryForm', () => ({
  EntryForm: () => <div data-testid="entry-form" />,
}));

vi.mock('@/components/organisms/SearchPanel', () => ({
  SearchPanel: () => <div data-testid="search-panel" />,
}));

vi.mock('@/components/organisms/MiniCalendar', () => ({
  MiniCalendar: () => <div data-testid="mini-calendar" />,
}));

vi.mock('@/components/organisms/UnlockDialog', () => ({
  UnlockDialog: ({ onUnlock }: any) => (
    <div data-testid="unlock-dialog">
      <button onClick={() => onUnlock('password')}>Unlock</button>
    </div>
  ),
}));

vi.mock('@/components/organisms/ShareModal', () => ({
  ShareModal: () => <div data-testid="share-modal" />,
}));

vi.mock('@/utils/topicIcons', () => ({
  getTopicIcon: vi.fn(() => null),
}));

vi.mock('@/utils/stripHtml', () => ({
  builtinEntryName: (cf: Record<string, unknown> | undefined | null) => { if (!cf) return ''; for (const k of ['eventName','meetingName','goalObjective','milestoneObjective','taskDescription','mealDescription']) { const v = cf[k]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; },
  stripHtml: vi.fn((html: string) => html.replace(/<[^>]*>/g, '')),
}));

describe('JournalView (locked)', () => {
  it('renders without crashing', () => {
    renderWithTheme(<JournalView />);
    expect(screen.getByTestId('app-template')).toBeInTheDocument();
  });

  it('shows unlock dialog when encryption is enabled but not unlocked', () => {
    renderWithTheme(<JournalView />);
    expect(screen.getByTestId('unlock-dialog')).toBeInTheDocument();
  });

  it('shows empty editor message when locked', () => {
    renderWithTheme(<JournalView />);
    expect(screen.getByTestId('empty-editor')).toBeInTheDocument();
    expect(screen.getByText('Unlock your journal to view entries')).toBeInTheDocument();
  });
});

describe('JournalView (unlocked, loaded)', () => {
  beforeEach(() => {
    vi.mocked(useEncryption).mockReturnValue({
      isUnlocked: true,
      unlock: vi.fn(),
      decryptPosts: vi.fn().mockResolvedValue([]),
      encryptPost: vi.fn(),
    } as any);
    // isInitialized: true prevents the data-loading useEffect from firing
  });

  it('renders journal template with side and editor panels', () => {
    renderWithTheme(<JournalView />);
    expect(screen.getByTestId('journal-template')).toBeInTheDocument();
  });

  it('renders the entry list in the side panel', () => {
    renderWithTheme(<JournalView />);
    expect(screen.getByTestId('entry-list')).toBeInTheDocument();
  });

  it('renders the entry form in the editor panel', () => {
    renderWithTheme(<JournalView />);
    expect(screen.getByTestId('entry-form')).toBeInTheDocument();
  });

  it('renders the view tabs', () => {
    renderWithTheme(<JournalView />);
    expect(screen.getByTestId('view-tabs')).toBeInTheDocument();
  });

  it('renders the quick entry component', () => {
    renderWithTheme(<JournalView />);
    expect(screen.getByTestId('quick-entry')).toBeInTheDocument();
  });
});
