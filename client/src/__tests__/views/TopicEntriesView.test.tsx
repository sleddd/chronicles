import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { TopicEntriesView } from '@/views/TopicEntriesView';
import { renderWithTheme } from '../testUtils';
import { useInitializeData } from '@/hooks/useInitializeData';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => mockNavigate),
  useLocation: vi.fn(() => ({ pathname: '/entertainment/music', search: '', state: null })),
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
      allTopics: [
        { id: 1, name: 'Food', icon: 'utensils', color: null },
      ],
    })
  ),
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn((selector: (s: any) => any) =>
    selector({ headerColor: '#4A5568' })
  ),
}));

vi.mock('@/components/templates/ContentTemplate', () => ({
  ContentTemplate: ({ children }: any) => <div data-testid="content-template">{children}</div>,
}));

vi.mock('@/components/atoms/EmptyState', () => ({
  EmptyState: ({ message }: any) => <div data-testid="empty-state">{message}</div>,
}));

vi.mock('@/components/atoms/ScrollList', () => ({
  ScrollList: ({ children }: any) => <div data-testid="scroll-list">{children}</div>,
}));

vi.mock('@/components/atoms/Spinner', () => ({
  Spinner: () => <span data-testid="spinner">Loading...</span>,
}));

vi.mock('@/components/atoms/DateGroupLabel', () => ({
  DateGroup: ({ children }: any) => <div>{children}</div>,
  DateGroupLabel: ({ children }: any) => <div data-testid="date-label">{children}</div>,
}));

vi.mock('@/components/atoms/Badge', () => ({
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
}));

vi.mock('@/components/molecules/ViewHeader', () => ({
  ViewHeader: ({ title, onBack, right }: any) => (
    <div data-testid="view-header">
      <h2>{title}</h2>
      {right}
      <button onClick={onBack}>Back</button>
    </div>
  ),
}));

vi.mock('@/components/molecules/FilterTabs', () => ({
  FilterTabs: ({ options, active, onChange }: any) => (
    <div data-testid="filter-tabs">
      {options.map((o: any) => (
        <button key={o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  ),
}));

vi.mock('@/components/organisms/EditableEntryCard', () => ({
  EditableEntryCard: () => <div data-testid="editable-entry-card" />,
}));

vi.mock('@/components/organisms/NewEntryCard', () => ({
  NewEntryCard: () => <div data-testid="new-entry-card" />,
}));

vi.mock('@/components/organisms/UnlockDialog', () => ({
  UnlockDialog: () => <div data-testid="unlock-dialog" />,
}));

vi.mock('@/utils/dateUtils', () => ({
  toDateStr: vi.fn((d: Date) => d.toISOString().split('T')[0]),
  startOfWeek: vi.fn((d: Date) => d),
  startOfMonth: vi.fn((d: Date) => d),
}));

describe('TopicEntriesView', () => {
  it('renders without crashing', () => {
    renderWithTheme(
      <TopicEntriesView title="Food Tracking" topicNames={['Food']} />
    );
    expect(screen.getByTestId('content-template')).toBeInTheDocument();
  });

  it('displays the view header with title', () => {
    renderWithTheme(
      <TopicEntriesView title="Food Tracking" topicNames={['Food']} />
    );
    expect(screen.getByText('Food Tracking')).toBeInTheDocument();
  });

  it('shows entry count badge', () => {
    renderWithTheme(
      <TopicEntriesView title="Food Tracking" topicNames={['Food']} />
    );
    expect(screen.getByTestId('badge')).toHaveTextContent('(0)');
  });

  it('renders date filter tabs when showDateFilter is true', () => {
    renderWithTheme(
      <TopicEntriesView title="Food" topicNames={['Food']} showDateFilter />
    );
    expect(screen.getByTestId('filter-tabs')).toBeInTheDocument();
  });

  it('hides date filter when showDateFilter is false', () => {
    renderWithTheme(
      <TopicEntriesView title="Food" topicNames={['Food']} showDateFilter={false} />
    );
    expect(screen.queryByTestId('filter-tabs')).not.toBeInTheDocument();
  });

  it('shows empty state when no entries match', () => {
    renderWithTheme(
      <TopicEntriesView title="Food Tracking" topicNames={['Food']} />
    );
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('renders new entry card for single topic', () => {
    renderWithTheme(
      <TopicEntriesView title="Food" topicNames={['Food']} />
    );
    expect(screen.getByTestId('new-entry-card')).toBeInTheDocument();
  });

  it('navigates back when back button is clicked', () => {
    renderWithTheme(
      <TopicEntriesView title="Food" topicNames={['Food']} />
    );
    screen.getByText('Back').click();
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});

describe('TopicEntriesView (needs unlock)', () => {
  beforeEach(() => {
    vi.mocked(useInitializeData).mockReturnValue({
      isReady: false,
      isLoading: false,
      needsUnlock: true,
      handleUnlock: vi.fn(),
    });
  });

  it('shows unlock dialog', () => {
    renderWithTheme(
      <TopicEntriesView title="Food" topicNames={['Food']} />
    );
    expect(screen.getByTestId('unlock-dialog')).toBeInTheDocument();
  });
});

describe('TopicEntriesView (loading)', () => {
  beforeEach(() => {
    vi.mocked(useInitializeData).mockReturnValue({
      isReady: false,
      isLoading: true,
      needsUnlock: false,
      handleUnlock: vi.fn(),
    });
  });

  it('shows loading spinner', () => {
    renderWithTheme(
      <TopicEntriesView title="Food" topicNames={['Food']} />
    );
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });
});
