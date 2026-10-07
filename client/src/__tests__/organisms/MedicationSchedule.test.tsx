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

  it('renders help text', () => {
    renderWithTheme(<MedicationSchedule isReady={true} />);
    expect(screen.getByText(/Click the circle to mark/)).toBeInTheDocument();
  });

  it('shows empty state when no medications', async () => {
    renderWithTheme(<MedicationSchedule isReady={true} />);
    // Wait for async loading to complete
    await waitFor(() => {
      expect(screen.getByText('No medications scheduled')).toBeInTheDocument();
    });
  });
});
