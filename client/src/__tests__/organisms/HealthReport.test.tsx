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

  it('renders summary stat cards', () => {
    renderWithTheme(<HealthReport {...defaultProps} />);
    expect(screen.getByText('Symptoms')).toBeInTheDocument();
    expect(screen.getByText('Food Entries')).toBeInTheDocument();
    expect(screen.getByText('Doses Taken')).toBeInTheDocument();
    expect(screen.getByText('Workouts')).toBeInTheDocument();
  });

  it('renders zero counts when no data', () => {
    renderWithTheme(<HealthReport {...defaultProps} />);
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBe(4);
  });

  it('renders counts from data', () => {
    renderWithTheme(
      <HealthReport
        {...defaultProps}
        symptoms={[{ name: 'headache', severity: 5, occurredAt: '2024-01-01T00:00:00Z' }] as never[]}
        foods={[{ name: 'pasta', calories: 500, ingredients: ['flour'], consumedAt: '2024-01-01', mealType: 'lunch' }] as never[]}
      />
    );
    // Multiple elements may show "1" (symptoms=1, foods=1)
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(1);
  });

  it('renders chart components', () => {
    renderWithTheme(<HealthReport {...defaultProps} />);
    expect(screen.getByTestId('correlation-chart')).toBeInTheDocument();
  });
});
