import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { LoginForm } from '@/components/organisms/LoginForm';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('LoginForm', () => {
  it('renders email and password fields', () => {
    renderWithTheme(<LoginForm onSubmit={vi.fn()} />);
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
  });

  it('renders sign in button', () => {
    renderWithTheme(<LoginForm onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('calls onSubmit with email and password', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithTheme(<LoginForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'mypassword123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('test@example.com', 'mypassword123');
    });
  });

  it('displays error when onSubmit throws', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Invalid credentials'));
    renderWithTheme(<LoginForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'wrongpassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('renders forgot password button when onForgotPassword is provided', () => {
    const onForgot = vi.fn();
    renderWithTheme(<LoginForm onSubmit={vi.fn()} onForgotPassword={onForgot} />);
    const btn = screen.getByRole('button', { name: 'Forgot password?' });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onForgot).toHaveBeenCalled();
  });

  it('does not render forgot password button when handler is absent', () => {
    renderWithTheme(<LoginForm onSubmit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Forgot password?' })).not.toBeInTheDocument();
  });

  it('has no Remember me box: nothing that opens the journal is ever stored', () => {
    renderWithTheme(<LoginForm onSubmit={vi.fn()} />);
    expect(screen.queryByText(/remember me/i)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('offers the passkey button only when the browser can use one', async () => {
    const onPasskey = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderWithTheme(<LoginForm onSubmit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Sign in with a passkey' })).toBeNull();
    unmount();
    renderWithTheme(<LoginForm onSubmit={vi.fn()} onPasskey={onPasskey} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));
    await waitFor(() => expect(onPasskey).toHaveBeenCalledTimes(1));
  });

  it('shows why a passkey sign-in failed', async () => {
    const onPasskey = vi.fn().mockRejectedValue(new Error('That passkey didn’t work. Try again, or sign in with your password.'));
    renderWithTheme(<LoginForm onSubmit={vi.fn()} onPasskey={onPasskey} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That passkey didn’t work');
  });
});
