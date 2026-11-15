import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { HealthReportingView } from '@/views/HealthReportingView';
import { renderWithTheme } from '../testUtils';
import { useInitializeData } from '@/hooks/useInitializeData';

const mockNavigate = vi.fn();

vi.mock('@/hooks/useEncryptedSetting', () => ({
  useEncryptedSetting: (_key: string, fallback: unknown) => [fallback, vi.fn(), true],
}));

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => mockNavigate),
  useLocation: vi.fn(() => ({ pathname: '/health/reporting' })),
}));

vi.mock('@/hooks/useInitializeData', () => ({
  useInitializeData: vi.fn(() => ({
    isReady: false,
    isLoading: true,
  })),
}));

const stableEntries: any[] = [];
const stableTopics: any[] = [];

vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: vi.fn((selector: (s: any) => any) =>
    selector({
      decryptedEntries: stableEntries,
      allTopics: stableTopics,
    })
  ),
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn((selector: (s: any) => any) =>
    selector({ headerColor: '#4A5568' })
  ),
}));

vi.mock('@/services/api', () => ({
  doses: { getByDate: vi.fn().mockResolvedValue({ logs: [] }) },
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

vi.mock('@/components/molecules/HealthTabBar', () => ({
  HealthTabBar: () => <div data-testid="health-tab-bar" />,
}));

vi.mock('@/components/molecules/FilterTabs', () => ({
  FilterTabs: ({ options }: any) => (
    <div data-testid="filter-tabs">
      {options.map((o: any) => (
        <button key={o.value}>{o.label}</button>
      ))}
    </div>
  ),
}));

vi.mock('@/components/organisms/HealthReport', () => ({
  HealthReport: () => <div data-testid="health-report">Health Report</div>,
}));

vi.mock('@/utils/stripHtml', () => ({
  builtinEntryName: (cf: Record<string, unknown> | undefined | null) => { if (!cf) return ''; for (const k of ['eventName','meetingName','goalObjective','milestoneObjective','taskDescription','mealDescription']) { const v = cf[k]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; },
  stripHtml: vi.fn((html: string) => html.replace(/<[^>]*>/g, '')),
}));

describe('HealthReportingView (loading)', () => {
  it('renders without crashing', () => {
    renderWithTheme(<HealthReportingView />);
    expect(screen.getByTestId('content-template')).toBeInTheDocument();
  });

  it('shows loading spinner', () => {
    renderWithTheme(<HealthReportingView />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });
});


describe('HealthReportingView (ready)', () => {
  beforeEach(() => {
    vi.mocked(useInitializeData).mockReturnValue({
      isReady: true,
      isLoading: false,
    });
  });

  it('displays the Health title', () => {
    renderWithTheme(<HealthReportingView />);
    expect(screen.getByText('Health')).toBeInTheDocument();
  });

  it('renders period filter tabs', () => {
    renderWithTheme(<HealthReportingView />);
    expect(screen.getByRole('tablist', { name: 'Report period' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '30 days' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Week' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Year' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Custom' })).toBeInTheDocument();
  });

  it('renders the health report component', () => {
    renderWithTheme(<HealthReportingView />);
    expect(screen.getByTestId('health-report')).toBeInTheDocument();
  });
});
