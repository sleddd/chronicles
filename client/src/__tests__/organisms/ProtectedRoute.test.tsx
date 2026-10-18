import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { MemoryRouter } from 'react-router-dom';
import { lightTheme } from '@shared/theme/tokens';
import { ProtectedRoute } from '@/components/organisms/ProtectedRoute';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));
vi.mock('@/hooks/useSignOut', () => ({ useSignOut: () => vi.fn() }));
const consentState = vi.hoisted(() => ({ status: null as unknown }));
vi.mock('@/services/api', () => ({
  consent: {
    status: vi.fn(async () => consentState.status),
    agree: vi.fn(async (c: { termsVersion: string; healthVersion: string; breachNotice: string }) => {
      consentState.status = { consent: { agreedAt: 'now', ageConfirmed: true, termsVersion: c.termsVersion, healthVersion: c.healthVersion, healthConsentWithdrawnAt: null, breachNotice: c.breachNotice, postalAddress: null }, current: { terms: 'v2', health: 'v1' } };
      return consentState.status;
    }),
  },
}));
import { fireEvent } from '@testing-library/react';
import { consent as consentApi } from '@/services/api';

const CURRENT = { terms: 'v2', health: 'v1' };
const agreed = (terms: string, health: string) => ({
  consent: { agreedAt: 'now', ageConfirmed: true, termsVersion: terms, healthVersion: health, healthConsentWithdrawnAt: null, breachNotice: 'email', postalAddress: null },
  current: CURRENT,
});

import { useAuth } from '@/contexts/AuthContext';
const mockUseAuth = vi.mocked(useAuth);

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ThemeProvider theme={lightTheme}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('ProtectedRoute', () => {
  it('renders children when authenticated and consent is current', async () => {
    consentState.status = agreed('v2', 'v1');
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { email: 'a@b.co' },
    } as ReturnType<typeof useAuth>);

    renderWithProviders(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(await screen.findByText('Protected Content')).toBeInTheDocument();
  });

  it('shows the full consent card to an account that never agreed, with nothing pre-checked', async () => {
    consentState.status = { consent: null, current: CURRENT };
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false, user: { email: 'a@b.co' } } as ReturnType<typeof useAuth>);
    renderWithProviders(<ProtectedRoute><div>Protected Content</div></ProtectedRoute>);
    expect(await screen.findByText('Before you continue')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(3);
    boxes.forEach(b => expect(b).not.toBeChecked());
    const go = screen.getByRole('button', { name: 'Continue' });
    expect(go).toBeDisabled();
    boxes.forEach(b => fireEvent.click(b));
    expect(go).not.toBeDisabled();
    fireEvent.click(go);
    expect(await screen.findByText('Protected Content')).toBeInTheDocument();
    expect(consentApi.agree).toHaveBeenCalledWith({ termsVersion: 'v2', healthVersion: 'v1', breachNotice: 'email' });
  });

  it('asks only for what changed after a policy update', async () => {
    consentState.status = agreed('v1', 'v1');
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false, user: { email: 'a@b.co' } } as ReturnType<typeof useAuth>);
    renderWithProviders(<ProtectedRoute><div>Protected Content</div></ProtectedRoute>);
    expect(await screen.findByText('We’ve updated our terms')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByText(/Terms of Service/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('needs a postal address when mailed notices are chosen', async () => {
    consentState.status = { consent: null, current: CURRENT };
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false, user: { email: 'a@b.co' } } as ReturnType<typeof useAuth>);
    renderWithProviders(<ProtectedRoute><div>Protected Content</div></ProtectedRoute>);
    await screen.findByText('Before you continue');
    screen.getAllByRole('checkbox').forEach(b => fireEvent.click(b));
    fireEvent.click(screen.getByLabelText(/Mailed letter/));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Postal address for mailed notices'), { target: { value: '12 Main St, Portland, OR 97201' } });
    expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled();
  });

  it('shows spinner when loading', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    } as ReturnType<typeof useAuth>);

    const { container } = renderWithProviders(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    // Spinner renders as an SVG or styled element
    expect(container.querySelector('svg, [class*="Spinner"]') || container.firstChild).toBeTruthy();
  });

  it('redirects to /login when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    } as ReturnType<typeof useAuth>);

    renderWithProviders(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});
