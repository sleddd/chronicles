import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { MedHistoryView } from '@/views/MedHistoryView';
import { renderWithTheme } from '../testUtils';

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => vi.fn()),
  useLocation: vi.fn(() => ({ pathname: '/health/med-history' })),
}));

vi.mock('@/hooks/useInitializeData', () => ({
  useInitializeData: () => ({ isReady: true, isLoading: false, needsUnlock: false, handleUnlock: vi.fn() }),
}));

const topics = [{ id: 1, name: 'Medication' }, { id: 2, name: 'Meals' }];
const entries = [
  { id: 10, content: '<p>Vitamin D3</p>', metadata: { _taxonomyId: 1, _customFields: { medicationName: 'Vitamin D3', dosage: '2000 IU', _changes: [{ date: '2026-10-05', kind: 'dose', from: '1000 IU', to: '2000 IU' }] } }, createdAt: new Date('2026-09-01T12:00:00') },
  { id: 11, content: '<p>Metformin</p>', metadata: { _taxonomyId: 1, _customFields: { medicationName: 'Metformin', dosage: '500mg' } }, createdAt: new Date('2026-09-01T12:00:00') },
  { id: 20, content: '<p>Magnesium</p>', metadata: { _taxonomyId: 2, _customFields: { mealType: 'supplement', consumedDate: '2026-10-10', consumedTime: '21:00' } }, createdAt: new Date('2026-10-10T21:00:00') },
];

vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: (selector: (s: unknown) => unknown) => selector({ decryptedEntries: entries, allTopics: topics }),
}));

const dose = (id: string, med: number, date: string, status: string, time = '08:00') =>
  ({ id, medicationPostId: med, date, status, scheduledTime: time, takenAt: status === 'taken' ? `${date}T${time}:00` : null, createdAt: '' });

vi.mock('@/services/api', () => ({
  doses: {
    getAll: () => Promise.resolve({ logs: [
      dose('a', 10, '2026-10-01', 'taken'), dose('b', 10, '2026-10-02', 'taken'), dose('c', 10, '2026-10-02', 'taken', '20:00'),
      dose('d', 11, '2026-10-02', 'skipped'), dose('e', 11, '2026-10-03', 'taken'), dose('f', 10, '2026-09-28', 'taken'),
    ] }),
  },
}));

vi.mock('@/components/templates/ContentTemplate', () => ({ ContentTemplate: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/components/molecules/HealthTabBar', () => ({ HealthTabBar: () => <nav /> }));
vi.mock('@/components/molecules/SearchInput', () => ({
  SearchInput: ({ value, onChange, placeholder }: any) => <input aria-label={placeholder} value={value} onChange={e => onChange(e.target.value)} />,
}));

describe('MedHistoryView', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-19T12:00:00')); });
  afterEach(() => { vi.useRealTimers(); });

  it('lists this month\'s medications with how often each was taken', async () => {
    renderWithTheme(<MedHistoryView />);
    const d3 = (await screen.findByText('Vitamin D3')).closest('tr')!;
    expect(within(d3).getByText('3×')).toBeInTheDocument(); // September's dose is out of range
    expect(within(d3).getByText('2')).toBeInTheDocument(); // days
    const met = screen.getByText('Metformin').closest('tr')!;
    expect(within(met).getByText('1×')).toBeInTheDocument();
    expect(screen.getByText('Magnesium').closest('tr')).toBeTruthy(); // logged in Meals
    expect(screen.getByText(/doses taken across/).textContent).toMatch(/5\s*doses taken across\s*3\s*medications · 1 skipped/);
  });

  it('opens a medication to its doses, and searches by name', async () => {
    renderWithTheme(<MedHistoryView />);
    fireEvent.click((await screen.findByText('Vitamin D3')).closest('tr')!);
    expect(within(screen.getByRole('list', { name: 'Vitamin D3 doses' })).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('list', { name: 'Vitamin D3 changes' })).toHaveTextContent('Dose 1000 IU → 2000 IU');
    fireEvent.change(screen.getByLabelText('Search medications'), { target: { value: 'metf' } });
    expect(screen.queryByText('Vitamin D3')).toBeNull();
    expect(screen.getByText('Metformin')).toBeInTheDocument();
  });

  it('switches to last month', async () => {
    renderWithTheme(<MedHistoryView />);
    await screen.findByText('Vitamin D3');
    fireEvent.click(screen.getByRole('tab', { name: 'Last month' }));
    const d3 = screen.getByText('Vitamin D3').closest('tr')!;
    expect(within(d3).getByText('1×')).toBeInTheDocument();
    expect(screen.queryByText('Metformin')).toBeNull();
  });
});
