import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { JournalView } from '@/views/JournalView';
import { renderWithTheme } from '../testUtils';
import { useEncryption } from '@/contexts/EncryptionContext';
import { entries as entriesApi } from '@/services/api';

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
  JournalTemplate: ({ sidePanel, editorPanel, onBack }: any) => (
    <div data-testid="journal-template">
      {onBack && <button onClick={onBack}>Back</button>}
      {sidePanel}{editorPanel}
    </div>
  ),
  SidePanel: ({ children }: any) => <div data-testid="side-panel">{children}</div>,
  EditorPanel: ({ children }: any) => <div data-testid="editor-panel">{children}</div>,
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
  EntryForm: ({ onContentChange, onSave, onNew, onClose, onDelete, topicId }: any) => (
    <div data-testid="entry-form" data-topic={String(topicId)}>
      {onDelete && <button onClick={onDelete}>delete</button>}
      {onClose && <button title="Close" onClick={onClose}>close</button>}
      <button onClick={onNew}>new</button>
      <button onClick={() => onContentChange('<p>Hi</p>')}>type</button>
      <button onClick={onSave}>save</button>
    </div>
  ),
}));

vi.mock('@/utils/getOrCreateJournalTopic', () => ({
  getOrCreateJournalTopic: vi.fn().mockResolvedValue(1),
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

describe('JournalView (edit view — opened from another view)', () => {
  const unlocked = () => (useEncryption as any).mockReturnValue({
    isUnlocked: true, unlock: vi.fn(), decryptPosts: vi.fn().mockResolvedValue([]),
    encryptPost: vi.fn().mockResolvedValue({ contentEncrypted: 'c', contentIv: 'i', metadataEncrypted: 'm', metadataIv: 'mi' }),
  });

  it('opens the editor full width when arriving from another view', () => {
    unlocked();
    vi.mocked(useLocation).mockReturnValue({ pathname: '/journal', state: { from: '/health/symptoms' }, key: 'k1' } as any);
    renderWithTheme(<JournalView />);
    expect(screen.getByTitle('Close')).toBeInTheDocument();
  });

  it('keeps the plain journal collapsed', () => {
    unlocked();
    vi.mocked(useLocation).mockReturnValue({ pathname: '/journal', state: null, key: 'k2' } as any);
    renderWithTheme(<JournalView />);
    expect(screen.queryByTitle('Close')).not.toBeInTheDocument();
  });

  it('returns to the originating view on New / Discard', () => {
    unlocked();
    const nav = vi.fn();
    vi.mocked(useNavigate).mockReturnValue(nav);
    vi.mocked(useLocation).mockReturnValue({ pathname: '/journal', state: { from: '/topics/4' }, key: 'k4' } as any);
    renderWithTheme(<JournalView />);
    fireEvent.click(screen.getByText('new'));
    expect(nav).toHaveBeenCalledWith('/topics/4');
  });

  it('the × on the full-width editor returns to the originating view', () => {
    unlocked();
    const nav = vi.fn();
    vi.mocked(useNavigate).mockReturnValue(nav);
    vi.mocked(useLocation).mockReturnValue({ pathname: '/journal', state: { from: '/topics/4' }, key: 'k5' } as any);
    renderWithTheme(<JournalView />);
    fireEvent.click(screen.getByTitle('Close'));
    expect(nav).toHaveBeenCalledWith('/topics/4');
  });

  it('returns to the originating view after deleting the entry', async () => {
    unlocked();
    const nav = vi.fn();
    vi.mocked(useNavigate).mockReturnValue(nav);
    vi.mocked(useLocation).mockReturnValue({ pathname: '/journal', state: { from: '/topics/4' }, key: 'k6' } as any);
    vi.mocked(entriesApi.delete).mockResolvedValue(undefined as any);
    const entry = { id: 7, content: '<p>Toast</p>', metadata: {}, isEncrypted: true, createdAt: new Date(), updatedAt: new Date() };
    entriesState.decryptedEntries = [entry];
    (uiState as any).selectedEntryId = 7;
    try {
      renderWithTheme(<JournalView />);
      fireEvent.click(screen.getByText('delete'));
      await waitFor(() => expect(nav).toHaveBeenCalledWith('/topics/4'));
    } finally {
      entriesState.decryptedEntries = [];
      (uiState as any).selectedEntryId = null;
    }
  });

  it('returns to the originating view on save', async () => {
    unlocked();
    const nav = vi.fn();
    vi.mocked(useNavigate).mockReturnValue(nav);
    vi.mocked(useLocation).mockReturnValue({ pathname: '/journal', state: { from: '/health/symptoms' }, key: 'k3' } as any);
    vi.mocked(entriesApi.create).mockResolvedValue({ id: 5, createdAt: new Date().toISOString() } as any);
    renderWithTheme(<JournalView />);
    fireEvent.click(screen.getByText('type'));
    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(nav).toHaveBeenCalledWith('/health/symptoms'));
  });
});

describe('JournalView (new entry from a list page)', () => {
  it('starts a blank entry with the topic preset', () => {
    (useEncryption as any).mockReturnValue({
      isUnlocked: true, unlock: vi.fn(), decryptPosts: vi.fn().mockResolvedValue([]), encryptPost: vi.fn(),
    });
    vi.mocked(useLocation).mockReturnValue({ pathname: '/journal', state: { newEntryTopicId: 4, from: '/topics/4' }, key: 'n1' } as any);
    renderWithTheme(<JournalView />);
    expect(screen.getByTestId('entry-form')).toHaveAttribute('data-topic', '4');
  });
});

describe('JournalView (mobile back to list)', () => {
  it('gives the title a back caret only while the editor pane is showing', async () => {
    (useEncryption as any).mockReturnValue({
      isUnlocked: true, unlock: vi.fn(), decryptPosts: vi.fn().mockResolvedValue([]), encryptPost: vi.fn(),
    });
    const { unmount } = renderWithTheme(<JournalView />);
    expect(screen.queryByText('Back')).not.toBeInTheDocument();
    unmount();
    (uiState as any).showMobileEditor = true;
    try {
      renderWithTheme(<JournalView />);
      expect(await screen.findByText('Back')).toBeInTheDocument();
    } finally {
      (uiState as any).showMobileEditor = false;
    }
  });
});
