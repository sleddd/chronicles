import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { CalendarView } from '@/views/CalendarView';
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

vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: vi.fn((selector: (s: any) => any) =>
    selector({
      decryptedEntries: [],
      allTopics: [],
      featureFlags: {},
    })
  ),
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn((selector: (s: any) => any) =>
    selector({
      headerColor: '#4A5568',
      setSelectedEntryId: vi.fn(),
    })
  ),
}));

vi.mock('@/components/templates/AppTemplate', () => ({
  AppTemplate: ({ children }: any) => <div data-testid="content-template">{children}</div>,
}));

vi.mock('@/components/organisms/CalendarGrid', () => ({
  CalendarGrid: () => <div data-testid="calendar-grid">Calendar Grid</div>,
}));

vi.mock('@/components/organisms/CalendarDayDetail', () => ({
  CalendarDayDetail: () => <div data-testid="calendar-day-detail" />,
}));

vi.mock('@/components/atoms/EmptyState', () => ({
  EmptyState: ({ message }: any) => <div data-testid="empty-state">{message}</div>,
}));

vi.mock('@/components/atoms/Spinner', () => ({
  Spinner: () => <span data-testid="spinner">Loading...</span>,
}));

vi.mock('@/components/organisms/UnlockDialog', () => ({
  UnlockDialog: () => <div data-testid="unlock-dialog" />,
}));

vi.mock('@/utils/topicIcons', () => ({
  getTopicIcon: vi.fn(() => null),
}));

vi.mock('@/utils/stripHtml', () => ({
  builtinEntryName: (cf: Record<string, unknown> | undefined | null) => { if (!cf) return ''; for (const k of ['eventName','meetingName','goalObjective','milestoneObjective','taskDescription','mealDescription']) { const v = cf[k]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; },
  stripHtml: vi.fn((html: string) => html.replace(/<[^>]*>/g, '')),
}));

describe('CalendarView', () => {
  it('renders without crashing', () => {
    renderWithTheme(<CalendarView />);
    expect(screen.getByTestId('content-template')).toBeInTheDocument();
  });

  it('renders the calendar grid when ready', () => {
    renderWithTheme(<CalendarView />);
    expect(screen.getByTestId('calendar-grid')).toBeInTheDocument();
  });

  it('does not show unlock dialog when not needed', () => {
    renderWithTheme(<CalendarView />);
    expect(screen.queryByTestId('unlock-dialog')).not.toBeInTheDocument();
  });
});

describe('CalendarView (needs unlock)', () => {
  beforeEach(() => {
    vi.mocked(useInitializeData).mockReturnValue({
      isReady: false,
      isLoading: false,
      needsUnlock: true,
      handleUnlock: vi.fn(),
    });
  });

  it('shows unlock dialog when encryption needs unlocking', () => {
    renderWithTheme(<CalendarView />);
    expect(screen.getByTestId('unlock-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });
});

describe('CalendarView (loading)', () => {
  beforeEach(() => {
    vi.mocked(useInitializeData).mockReturnValue({
      isReady: false,
      isLoading: true,
      needsUnlock: false,
      handleUnlock: vi.fn(),
    });
  });

  it('shows spinner when loading', () => {
    renderWithTheme(<CalendarView />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });
});
