import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { MedicationSchedule } from '@/components/organisms/MedicationSchedule';

vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      decryptedEntries: [],
      allTopics: [],
    }),
}));

// Dose → Meals sync is covered by its own helpers; stub it here
vi.mock('@/hooks/useDoseToMeals', () => ({
  useDoseToMeals: () => ({ onTaken: vi.fn().mockResolvedValue(undefined), onUntaken: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ headerColor: '#4A5568' }),
}));

vi.mock('@/services/api', () => ({
  doses: {
    getByDate: vi.fn().mockResolvedValue({ logs: [] }),
    log: vi.fn().mockResolvedValue({ log: {} }),
  },
}));

vi.mock('@/utils/stripHtml', () => ({
  builtinEntryName: (cf: Record<string, unknown> | undefined | null) => { if (!cf) return ''; for (const k of ['eventName','meetingName','goalObjective','milestoneObjective','taskDescription','mealDescription']) { const v = cf[k]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; },
  stripHtml: (html: string) => html.replace(/<[^>]*>/g, ''),
}));

vi.mock('@/utils/dateUtils', () => ({
  toDateStr: (d: Date) => d.toISOString().split('T')[0],
  formatTime12h: (t: string) => t,
  formatDateDisplay: (d: string) => d,
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('MedicationSchedule', () => {
  it('renders date navigation', () => {
    renderWithTheme(<MedicationSchedule isReady={true} />);
    expect(screen.getByTitle('Previous day')).toBeInTheDocument();
    expect(screen.getByTitle('Next day')).toBeInTheDocument();
  });

  it('titles the panel and says Today for the current day', () => {
    renderWithTheme(<MedicationSchedule isReady={true} />);
    expect(screen.getByText('Medications')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('shows empty state when no medications', async () => {
    renderWithTheme(<MedicationSchedule isReady={true} />);
    // Wait for async loading to complete
    await waitFor(() => {
      expect(screen.getByText('No medications scheduled')).toBeInTheDocument();
    });
  });
});

describe('MedicationSchedule — grouped doses', () => {
  it('groups doses by time with a count and Take all, which marks each one taken', async () => {
    vi.resetModules();
    vi.doMock('@/stores/entriesStore', () => ({
      useEntriesStore: (selector: (s: Record<string, unknown>) => unknown) =>
        selector({
          allTopics: [{ id: 9, name: 'Medication' }],
          decryptedEntries: [
            { id: 1, content: '<p>Vitamin C</p>', metadata: { _taxonomyId: 9, _customFields: { scheduleTimes: ['08:00'], isActive: true } } },
            { id: 2, content: '<p>Montelukast</p>', metadata: { _taxonomyId: 9, _customFields: { scheduleTimes: ['08:00'], isActive: true } } },
          ],
        }),
    }));
    const api = await import('@/services/api');
    const { MedicationSchedule: Fresh } = await import('@/components/organisms/MedicationSchedule');
    renderWithTheme(<Fresh isReady={true} />);
    await waitFor(() => expect(screen.getByText('Vitamin C')).toBeInTheDocument());
    expect(screen.getByText('0 / 2')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Take all' }).click();
    await waitFor(() => expect((api.doses.log as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2));
  });
});
