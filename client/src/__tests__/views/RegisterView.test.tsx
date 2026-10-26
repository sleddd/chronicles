import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { RegisterView } from '@/views/RegisterView';
import { renderWithTheme } from '../testUtils';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => mockNavigate),
  useSearchParams: vi.fn(() => [new URLSearchParams()]),
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    register: vi.fn(),
  })),
}));

vi.mock('@/contexts/EncryptionContext', () => ({
  useEncryption: vi.fn(() => ({
    setupEncryption: vi.fn().mockResolvedValue({
      recoveryKey: 'abc123',
      wrappedMK: 'wrapped',
      salt: 'salt',
      wrapIv: 'iv',
      recoveryWrappedMK: 'recMK',
      recoveryWrapIv: 'recIv',
    }),
  })),
}));

vi.mock('@/components/templates/AuthTemplate', () => ({
  AuthTemplate: ({ title, children, footer }: any) => (
    <div>
      <h1>{title}</h1>
      <div data-testid="auth-body">{children}</div>
      {footer && <div data-testid="auth-footer">{footer}</div>}
    </div>
  ),
}));

vi.mock('@/components/organisms/RegisterForm', () => ({
  RegisterForm: ({ onSubmit }: any) => (
    <form data-testid="register-form">
      <button type="button" onClick={() => onSubmit({ email: 'a@b.com', username: 'user', password: 'Password123!' })}>
        Register
      </button>
    </form>
  ),
}));

vi.mock('@/components/molecules/RecoveryKeyDisplay', () => ({
  RecoveryKeyDisplay: ({ recoveryKey, onConfirm }: any) => (
    <div data-testid="recovery-display">
      <span>{recoveryKey}</span>
      <button onClick={onConfirm}>Confirm</button>
    </div>
  ),
}));

describe('RegisterView', () => {
  it('renders without crashing', () => {
    renderWithTheme(<RegisterView />);
    expect(screen.getByText('Create Account')).toBeInTheDocument();
  });

  it('displays the registration form initially', () => {
    renderWithTheme(<RegisterView />);
    expect(screen.getByTestId('register-form')).toBeInTheDocument();
  });

  it('renders footer with link to login', () => {
    renderWithTheme(<RegisterView />);
    const link = screen.getByRole('link', { name: 'Sign in' });
    expect(link).toHaveAttribute('href', '/login');
  });

  it('shows the title "Create Account"', () => {
    renderWithTheme(<RegisterView />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Create Account');
  });
});
