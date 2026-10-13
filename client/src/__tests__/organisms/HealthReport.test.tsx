import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { HealthReport } from '@/components/organisms/HealthReport';

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

vi.mock('@/components/molecules/charts/CorrelationChart', () => ({
  CorrelationChart: ({ title }: { title: string }) => <div data-testid="correlation-chart">{title}</div>,
}));

vi.mock('@/components/molecules/charts/FrequencyChart', () => ({
  FrequencyChart: ({ title }: { title: string }) => <div data-testid="frequency-chart">{title}</div>,
}));

vi.mock('@/components/molecules/charts/SeverityTrendChart', () => ({
  SeverityTrendChart: ({ title }: { title: string }) => <div data-testid="severity-chart">{title}</div>,
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

  it('renders chart components', () => {
    renderWithTheme(<HealthReport {...defaultProps} />);
    expect(screen.getByTestId('correlation-chart')).toBeInTheDocument();
  });
});
