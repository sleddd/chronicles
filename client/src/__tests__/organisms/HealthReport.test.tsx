import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { HealthReport } from '@/components/organisms/HealthReport';
import * as analysis from '@/utils/correlationAnalysis';

vi.mock('@/utils/correlationAnalysis', () => ({
  calculateCorrelations: vi.fn().mockReturnValue([]),
  calculateExerciseCorrelations: vi.fn().mockReturnValue([]),
  calculateSymptomFrequency: vi.fn().mockReturnValue([]),
  calculateSeverityTrend: vi.fn().mockReturnValue([]),
  calculateExerciseImpact: vi.fn().mockReturnValue([]),
  calculateExerciseFrequency: vi.fn().mockReturnValue([]),
  calculateSymptomCoOccurrences: vi.fn().mockReturnValue([]),
  calculateWellnessTrend: vi.fn().mockReturnValue([]),
  calculateWellnessInsights: vi.fn().mockReturnValue([]),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('HealthReport', () => {
  const defaultProps = {
    symptoms: [],
    foods: [],
    medLogs: [],
    exercises: [],
    wellness: [],
    period: 'week' as const,
    accentColor: '#4281a4',
  };

  it('does not render the count tiles or calorie summary', () => {
    renderWithTheme(
      <HealthReport
        {...defaultProps}
        foods={[{ name: 'pasta', calories: 500, ingredients: ['flour'], consumedAt: '2024-01-01', mealType: 'lunch' }] as never[]}
      />
    );
    expect(screen.queryByText('Food Entries')).not.toBeInTheDocument();
    expect(screen.queryByText('Doses Taken')).not.toBeInTheDocument();
    expect(screen.queryByText('Workouts')).not.toBeInTheDocument();
    expect(screen.queryByText('Calorie Summary')).not.toBeInTheDocument();
  });

  it('says nothing is logged yet when the period is empty', () => {
    renderWithTheme(<HealthReport {...defaultProps} />);
    expect(screen.getByText(/Nothing logged in this period yet/)).toBeInTheDocument();
  });

  it('shows the Wellness tiles, the Insights panel and the Symptoms section', () => {
    renderWithTheme(
      <HealthReport
        {...defaultProps}
        wellness={[{ id: 1, date: '2026-10-12', waterGlasses: 6, waterGoal: 8, moodScore: 3, sleepHours: 7, sleepQuality: 0 }]}
        symptoms={[{ id: 2, name: 'Headache', severity: 8, occurredAt: '2026-10-12T09:00:00' }]}
      />
    );
    expect(screen.getByText('Wellness')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sleep/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Insights')).toBeInTheDocument();
    expect(screen.getByText('Frequency and severity')).toBeInTheDocument();
    expect(screen.getByText('Headache')).toBeInTheDocument();
    expect(screen.getByText('1×')).toBeInTheDocument();
  });

  it('shows exercise totals and the severity change after workouts', () => {
    const { calculateExerciseImpact } = vi.mocked(analysis);
    calculateExerciseImpact.mockReturnValueOnce([{ exerciseType: 'other', avgSeverityBefore: 0, avgSeverityAfter: 5, improvement: -5, occurrences: 2 }]);
    renderWithTheme(
      <HealthReport
        {...defaultProps}
        period="month"
        exercises={[{ id: 3, name: 'Walk', exerciseType: 'other', duration: 0, intensity: 'low', performedAt: '2026-10-12T09:00:00' }]}
      />
    );
    expect(screen.getByText('This month')).toBeInTheDocument();
    expect(screen.getByText('All logged as Other')).toBeInTheDocument();
    expect(screen.getByText('+5')).toBeInTheDocument();
  });

  it('cross-tracks food with symptoms: possible triggers and what came before a symptom', () => {
    const foods = [] as { id: number; name: string; consumedAt: string; ingredients: string[] }[];
    const symptoms = [] as { id: number; name: string; severity: number; occurredAt: string }[];
    for (let d = 1; d <= 8; d++) {
      const day = `2026-10-0${d}`.replace(/0(\d\d)$/, '$1');
      foods.push({ id: d, name: d % 2 ? 'Pizza' : 'Salad', consumedAt: `${day}T12:00:00`, ingredients: [] });
      if (d % 2) symptoms.push({ id: 100 + d, name: 'Bloating', severity: 5, occurredAt: `${day}T15:00:00` });
    }
    symptoms.push({ id: 200, name: 'Headache', severity: 5, occurredAt: '2026-10-02T13:00:00' });
    const medLogs = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, medicationPostId: 1, medicationName: 'Metformin', takenAt: `2026-10-0${i + 1}T11:00:00` }));
    renderWithTheme(<HealthReport {...defaultProps} foods={foods} symptoms={symptoms} medLogs={medLogs} />);
    expect(screen.getByText('What comes before symptoms')).toBeInTheDocument();
    const triggers = screen.getByRole('region', { name: 'Possible triggers' });
    expect(triggers).toHaveTextContent('Pizza → Bloating');
    expect(triggers).toHaveTextContent('Food · before 4 of 4 times · ~3 h before');
    expect(triggers).toHaveTextContent('Metformin → Bloating'); // an everyday pill still shows
    expect(screen.queryByText('Most eaten ingredients')).toBeNull();
    const before = screen.getByRole('region', { name: 'Before a symptom' });
    expect(before).toHaveTextContent('Pizza');
    expect(before).toHaveTextContent('4 of 4 times');
    fireEvent.click(screen.getByRole('button', { name: 'Headache' }));
    expect(before).toHaveTextContent('Salad');
    expect(before).toHaveTextContent('1 of 1 time');
  });

  it('confirms a trigger or marks it not a trigger, and keeps confirmed ones pinned', () => {
    const foods = [1, 3, 5].map(d => ({ id: d, name: 'Pizza', consumedAt: `2026-10-0${d}T12:00:00`, ingredients: [] }));
    const symptoms = [1, 3, 5].map(d => ({ id: 10 + d, name: 'Bloating', severity: 5, occurredAt: `2026-10-0${d}T15:00:00` }));
    const onReview = vi.fn();
    const triggers = () => within(screen.getByRole('region', { name: 'Possible triggers' }));
    const { rerender } = renderWithTheme(<HealthReport {...defaultProps} foods={foods} symptoms={symptoms} onReviewTrigger={onReview} />);
    fireEvent.click(triggers().getByRole('button', { name: 'Confirm Pizza → Bloating' }));
    expect(onReview).toHaveBeenCalledWith(expect.objectContaining({ kind: 'food', trigger: 'Pizza', symptom: 'Bloating' }), 'confirmed');
    fireEvent.click(triggers().getByRole('button', { name: 'Pizza → Bloating is not a trigger' }));
    expect(onReview).toHaveBeenLastCalledWith(expect.objectContaining({ trigger: 'Pizza' }), 'dismissed');

    const confirmed = { 'food|pizza|bloating': { verdict: 'confirmed' as const, at: '2026-10-19', kind: 'food' as const, trigger: 'Pizza', symptom: 'Bloating' },
      'food|shellfish|hives': { verdict: 'confirmed' as const, at: '2026-09-02', kind: 'food' as const, trigger: 'Shellfish', symptom: 'Hives' } };
    rerender(<ThemeProvider theme={lightTheme}><HealthReport {...defaultProps} foods={foods} symptoms={symptoms} triggerReviews={confirmed} onReviewTrigger={onReview} /></ThemeProvider>);
    expect(screen.getByRole('region', { name: 'Possible triggers' })).toHaveTextContent('Confirmed Oct 19');
    expect(screen.getByRole('region', { name: 'Possible triggers' })).toHaveTextContent('Shellfish → Hives');
    expect(screen.getByRole('region', { name: 'Possible triggers' })).toHaveTextContent('not seen in this period');
    // Before a symptom only shows reviews for the chosen symptom
    expect(screen.getByRole('region', { name: 'Before a symptom' })).toHaveTextContent('Confirmed Oct 19');
    expect(screen.getByRole('region', { name: 'Before a symptom' })).not.toHaveTextContent('Shellfish');
    fireEvent.click(triggers().getByRole('button', { name: 'Undo confirm Pizza → Bloating' }));
    expect(onReview).toHaveBeenLastCalledWith(expect.objectContaining({ trigger: 'Pizza' }), null);

    const dismissed = { 'food|pizza|bloating': { ...confirmed['food|pizza|bloating'], verdict: 'dismissed' as const } };
    rerender(<ThemeProvider theme={lightTheme}><HealthReport {...defaultProps} foods={foods} symptoms={symptoms} triggerReviews={dismissed} onReviewTrigger={onReview} /></ThemeProvider>);
    expect(screen.queryByRole('button', { name: 'Confirm Pizza → Bloating' })).toBeNull(); // gone from both lists
    fireEvent.click(triggers().getByRole('button', { name: /1 marked not a trigger · Show/ }));
    fireEvent.click(triggers().getByRole('button', { name: 'Restore Pizza → Bloating' }));
    expect(onReview).toHaveBeenLastCalledWith(expect.objectContaining({ trigger: 'Pizza' }), null);
  });

  it('reviews from Before a symptom, and folds a long hidden list five at a time', () => {
    const foods = [1, 3, 5].map(d => ({ id: d, name: 'Pizza', consumedAt: `2026-10-0${d}T12:00:00`, ingredients: [] }));
    const symptoms = [1, 3, 5].map(d => ({ id: 10 + d, name: 'Bloating', severity: 5, occurredAt: `2026-10-0${d}T15:00:00` }));
    const onReview = vi.fn();
    const many = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`food|old ${i}|bloating`,
      { verdict: 'dismissed' as const, at: `2026-09-0${i + 1}`, kind: 'food' as const, trigger: `Old ${i}`, symptom: 'Bloating' }]));
    renderWithTheme(<HealthReport {...defaultProps} foods={foods} symptoms={symptoms} triggerReviews={many} onReviewTrigger={onReview} />);
    const before = within(screen.getByRole('region', { name: 'Before a symptom' }));
    fireEvent.click(before.getByRole('button', { name: 'Pizza → Bloating is not a trigger' }));
    expect(onReview).toHaveBeenLastCalledWith(expect.objectContaining({ trigger: 'Pizza', symptom: 'Bloating' }), 'dismissed');
    fireEvent.click(before.getByRole('button', { name: /7 marked not a trigger · Show/ }));
    expect(before.getAllByRole('button', { name: /^Restore/ })).toHaveLength(5);
    expect(before.getAllByRole('button', { name: /^Restore/ })[0]).toHaveAccessibleName('Restore Old 6 → Bloating'); // newest first
    fireEvent.click(before.getByRole('button', { name: 'Show 2 more' }));
    expect(before.getAllByRole('button', { name: /^Restore/ })).toHaveLength(7);
    expect(before.queryByRole('button', { name: /more$/ })).toBeNull();
  });

  it('lists what changed, marks it on the charts and opens its entry', () => {
    const onOpen = vi.fn();
    const changes = [
      { date: '2026-10-12', text: 'Aspirin dose 325 mg → 650 mg', source: 'medication' as const, entryId: 5 },
      { date: '2026-10-11', text: 'Cut out dairy', source: 'other' as const, entryId: 6 },
    ];
    const wellness = ['2026-10-10', '2026-10-12', '2026-10-13'].map((date, i) => ({ id: i, date, waterGlasses: 6, waterGoal: 8, moodScore: 3, sleepHours: 7, sleepQuality: 0 }));
    vi.mocked(analysis.calculateWellnessTrend).mockReturnValue(wellness.map(w => ({ date: w.date, waterGlasses: 6, waterGoal: 8, moodScore: 3, sleepHours: 7, sleepQuality: 0 })));
    const { container } = renderWithTheme(<HealthReport {...defaultProps} wellness={wellness} changes={changes} onOpenChange={onOpen}
      symptoms={[{ id: 1, name: 'Headache', severity: 5, occurredAt: '2026-10-12T10:00:00' }]} />);
    const panel = screen.getByRole('region', { name: 'Changes in this period' });
    expect(panel).toHaveTextContent('Aspirin dose 325 mg → 650 mg');
    expect(panel).toHaveTextContent('Medication');
    expect(panel).toHaveTextContent('Other');
    fireEvent.click(screen.getByRole('button', { name: 'Cut out dairy' }));
    expect(onOpen).toHaveBeenCalledWith(6);
    // Both changes land on the Oct 12 point (Oct 11 wasn't logged): one marker, both in the key
    expect(container.querySelectorAll('[data-marker]')).toHaveLength(1);
    expect(screen.getByRole('list', { name: 'Changes on this chart' }).children).toHaveLength(2);
    expect(screen.getByLabelText('Changed: Aspirin dose 325 mg → 650 mg')).toBeInTheDocument(); // ◆ over the Oct 12 bar
    vi.mocked(analysis.calculateWellnessTrend).mockReturnValue([]);
  });
});
