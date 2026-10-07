import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { GoalsView } from '@/views/GoalsView';
import { renderWithTheme } from '../testUtils';
import { useInitializeData } from '@/hooks/useInitializeData';

const mockNavigate = vi.fn();

const { mockLocation, mockSearchParams } = vi.hoisted(() => ({
  mockLocation: { pathname: '/', search: '', hash: '', state: null, key: 'default' },
  mockSearchParams: [new URLSearchParams(), () => {}] as const,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => mockNavigate),
  useLocation: vi.fn(() => mockLocation),
  useSearchParams: vi.fn(() => mockSearchParams),
}));

vi.mock('@/hooks/useInitializeData', () => ({
  useInitializeData: vi.fn(() => ({
    isReady: true,
    isLoading: false,
    needsUnlock: false,
    handleUnlock: vi.fn(),
  })),
}));

// Stable references, like real Zustand state — fresh arrays per selector call
// would loop the view's memo → setState effects forever.
const { entriesState, uiState } = vi.hoisted(() => ({
  entriesState: {
    decryptedEntries: [],
    allTopics: [
      { id: 1, name: 'Goal', icon: 'bullseye', color: null },
      { id: 2, name: 'Milestone', icon: 'flag', color: null },
      { id: 3, name: 'Task', icon: 'check', color: null },
    ],
    featureFlags: {},
    updateDecryptedEntry: () => {},
    addDecryptedEntry: () => {},
    removeEntry: () => {},
  } as any,
  uiState: { accentColor: '#4A5568', setSelectedEntryId: () => {}, setShowMobileEditor: () => {} } as any,
}));

vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: Object.assign(
    vi.fn((selector: (s: any) => any) => selector(entriesState)),
    { getState: () => entriesState },
  ),
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: Object.assign(
    vi.fn((selector: (s: any) => any) => selector(uiState)),
    { getState: () => uiState },
  ),
}));

vi.mock('@/contexts/EncryptionContext', () => ({
  useEncryption: vi.fn(() => ({
    encryptPost: vi.fn(),
  })),
}));

vi.mock('@/services/api', () => ({
  entries: { update: vi.fn(), create: vi.fn() },
}));

vi.mock('@/components/templates/ContentTemplate', () => ({
  ContentTemplate: ({ children }: any) => <div data-testid="content-template">{children}</div>,
}));

vi.mock('@/components/atoms/EmptyState', () => ({
  EmptyState: ({ message, submessage }: any) => (
    <div data-testid="empty-state">{message}{submessage && <span>{submessage}</span>}</div>
  ),
}));

vi.mock('@/components/atoms/ScrollList', () => ({
  ScrollList: ({ children }: any) => <div data-testid="scroll-list">{children}</div>,
}));

vi.mock('@/components/atoms/Spinner', () => ({
  Spinner: () => <span data-testid="spinner">Loading...</span>,
}));

vi.mock('@/components/molecules/ViewHeader', () => ({
  ViewHeader: ({ title, onBack }: any) => (
    <div data-testid="view-header">
      <h2>{title}</h2>
      <button onClick={onBack}>Back</button>
    </div>
  ),
}));

vi.mock('@/components/molecules/PlanningTabBar', () => ({
  PlanningTabBar: () => <nav data-testid="planning-tab-bar" />,
}));

vi.mock('@/components/molecules/FilterTabs', () => ({
  FilterTabs: ({ options, active, onChange }: any) => (
    <div data-testid="filter-tabs">
      {options.map((o: any) => (
        <button key={o.value} onClick={() => onChange(o.value)} data-active={o.value === active}>
          {o.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/components/molecules/TabBar', () => ({
  TabBar: ({ tabs, active, onChange }: any) => (
    <div data-testid="tab-bar">
      {tabs.map((t: any) => (
        <button key={t.value} onClick={() => onChange(t.value)} data-active={t.value === active}>
          {t.value}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/components/organisms/GoalCard', () => ({
  GoalCard: () => <div data-testid="goal-card" />,
}));

vi.mock('@/components/organisms/MilestoneCard', () => ({
  MilestoneCard: () => <div data-testid="milestone-card" />,
}));

vi.mock('@/components/organisms/UnlockDialog', () => ({
  UnlockDialog: () => <div data-testid="unlock-dialog" />,
}));

vi.mock('@/utils/stripHtml', () => ({
  builtinEntryName: (cf: Record<string, unknown> | undefined | null) => { if (!cf) return ''; for (const k of ['eventName','meetingName','goalObjective','milestoneObjective','taskDescription','mealDescription']) { const v = cf[k]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; },
  stripHtml: vi.fn((html: string) => html.replace(/<[^>]*>/g, '')),
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) => <div>{children}</div>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => <div>{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: {},
}));

describe('GoalsView', () => {
  it('renders without crashing', () => {
    renderWithTheme(<GoalsView />);
    expect(screen.getByTestId('content-template')).toBeInTheDocument();
  });

  it('displays the Planning title and the planning tabs', () => {
    renderWithTheme(<GoalsView />);
    expect(screen.getByText('Planning')).toBeInTheDocument();
    expect(screen.getByTestId('planning-tab-bar')).toBeInTheDocument();
  });

  it('shows empty state when no goals exist', () => {
    renderWithTheme(<GoalsView />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });
});

describe('GoalsView (needs unlock)', () => {
  beforeEach(() => {
    vi.mocked(useInitializeData).mockReturnValue({
      isReady: false,
      isLoading: false,
      needsUnlock: true,
      handleUnlock: vi.fn(),
    });
  });

  it('shows unlock dialog', () => {
    renderWithTheme(<GoalsView />);
    expect(screen.getByTestId('unlock-dialog')).toBeInTheDocument();
  });
});

describe('GoalsView (loading)', () => {
  beforeEach(() => {
    vi.mocked(useInitializeData).mockReturnValue({
      isReady: false,
      isLoading: true,
      needsUnlock: false,
      handleUnlock: vi.fn(),
    });
  });

  it('shows loading spinner', () => {
    renderWithTheme(<GoalsView />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });
});
