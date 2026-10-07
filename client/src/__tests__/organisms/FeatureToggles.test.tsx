import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { FeatureToggles } from '@/components/organisms/FeatureToggles';

vi.mock('@/services/api', () => ({
  settings: {
    getAll: vi.fn().mockResolvedValue([
      { key: 'foodEnabled', value: true },
      { key: 'medicationEnabled', value: false },
    ]),
    upsert: vi.fn().mockResolvedValue(undefined),
  },
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('FeatureToggles', () => {
  it('renders features title', () => {
    renderWithTheme(<FeatureToggles />);
    expect(screen.getByText('Features')).toBeInTheDocument();
  });

  it('renders all feature toggle labels', async () => {
    renderWithTheme(<FeatureToggles />);
    await waitFor(() => {
      expect(screen.getByText('Meals Tracking')).toBeInTheDocument();
      expect(screen.getByText('Medication Tracking')).toBeInTheDocument();
      expect(screen.getByText('Goals & Milestones')).toBeInTheDocument();
      expect(screen.getByText('Exercise Tracking')).toBeInTheDocument();
      expect(screen.getByText('Allergies & Sensitivities')).toBeInTheDocument();
    });
  });
});
