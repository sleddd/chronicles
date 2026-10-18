import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
