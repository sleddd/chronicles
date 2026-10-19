import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { LoginView } from '@/views/LoginView';
import { renderWithTheme } from '../testUtils';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => mockNavigate),
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    login: vi.fn().mockResolvedValue({
      encryptionEnabled: false,
      kekSalt: null,
      encryptedMasterKey: null,
      kekWrapIv: null,
    }),
  })),
}));

vi.mock('@/contexts/EncryptionContext', () => ({
  useEncryption: vi.fn(() => ({
    unlock: vi.fn(),
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

vi.mock('@/components/organisms/LoginForm', () => ({
  LoginForm: ({ onSubmit, onForgotPassword }: any) => (
    <form data-testid="login-form">
      <button type="button" onClick={() => onSubmit('test@test.com', 'password123!')}>Submit</button>
      <button type="button" data-testid="forgot" onClick={onForgotPassword}>Forgot</button>
    </form>
  ),
}));

describe('LoginView', () => {
  it('renders without crashing', () => {
    renderWithTheme(<LoginView />);
    expect(screen.getByText('Chronicles')).toBeInTheDocument();
  });

  it('displays the title "Chronicles"', () => {
    renderWithTheme(<LoginView />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chronicles');
  });

  it('renders the login form', () => {
    renderWithTheme(<LoginView />);
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });

  it('renders footer with link to register', () => {
    renderWithTheme(<LoginView />);
    const link = screen.getByRole('link', { name: 'Create an account' });
    expect(link).toHaveAttribute('href', '/sign-up');
  });

  it('navigates to /recover when forgot password is clicked', () => {
    renderWithTheme(<LoginView />);
    screen.getByTestId('forgot').click();
    expect(mockNavigate).toHaveBeenCalledWith('/recover');
  });
});
