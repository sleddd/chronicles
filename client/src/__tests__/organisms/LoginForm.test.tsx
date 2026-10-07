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
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument();
  });

  it('renders sign in button', () => {
    renderWithTheme(<LoginForm onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('calls onSubmit with email and password', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithTheme(<LoginForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter password'), {
      target: { value: 'mypassword123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('test@example.com', 'mypassword123', false);
    });
  });

  it('displays error when onSubmit throws', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Invalid credentials'));
    renderWithTheme(<LoginForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter password'), {
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
});
