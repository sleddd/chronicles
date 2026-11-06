import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { RegisterForm } from '@/components/organisms/RegisterForm';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('RegisterForm', () => {
  it('renders all form fields', () => {
    renderWithTheme(<RegisterForm onSubmit={vi.fn()} />);
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Choose a username')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('12+ characters: upper and lower case, a number, a symbol')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Re-enter password')).toBeInTheDocument();
  });

  it('renders create account button', () => {
    renderWithTheme(<RegisterForm onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
  });

  it('shows validation error for short password', async () => {
    const onSubmit = vi.fn();
    renderWithTheme(<RegisterForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Choose a username'), {
      target: { value: 'testuser' },
    });
    fireEvent.change(screen.getByPlaceholderText('12+ characters: upper and lower case, a number, a symbol'), {
      target: { value: 'short' },
    });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), {
      target: { value: 'short' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it('shows error for mismatched passwords', async () => {
    const onSubmit = vi.fn();
    renderWithTheme(<RegisterForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Choose a username'), {
      target: { value: 'testuser' },
    });
    fireEvent.change(screen.getByPlaceholderText('12+ characters: upper and lower case, a number, a symbol'), {
      target: { value: 'ValidPass123!' },
    });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), {
      target: { value: 'DifferentPass123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows error for short username', async () => {
    const onSubmit = vi.fn();
    renderWithTheme(<RegisterForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Choose a username'), {
      target: { value: 'ab' },
    });
    fireEvent.change(screen.getByPlaceholderText('12+ characters: upper and lower case, a number, a symbol'), {
      target: { value: 'ValidPass123!' },
    });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), {
      target: { value: 'ValidPass123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(screen.getByText('Minimum 3 characters')).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with valid data', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithTheme(<RegisterForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Choose a username'), {
      target: { value: 'testuser' },
    });
    fireEvent.change(screen.getByPlaceholderText('12+ characters: upper and lower case, a number, a symbol'), {
      target: { value: 'ValidPass123!' },
    });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), {
      target: { value: 'ValidPass123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        email: 'test@example.com',
        username: 'testuser',
        password: 'ValidPass123!',
      });
    });
  });

  it('displays error banner when onSubmit rejects', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Email taken'));
    renderWithTheme(<RegisterForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Choose a username'), {
      target: { value: 'testuser' },
    });
    fireEvent.change(screen.getByPlaceholderText('12+ characters: upper and lower case, a number, a symbol'), {
      target: { value: 'ValidPass123!' },
    });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), {
      target: { value: 'ValidPass123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(screen.getByText('Email taken')).toBeInTheDocument();
    });
  });

  it('refuses a password that meets the rules but is easy to guess, with a strength meter', async () => {
    const onSubmit = vi.fn();
    renderWithTheme(<RegisterForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Choose a username'), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByPlaceholderText('12+ characters: upper and lower case, a number, a symbol'), { target: { value: 'Password123!' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: 'Password123!' } });
    expect(screen.getByRole('status', { name: /Password strength: (Too weak|Weak|Fair)/ })).toBeInTheDocument();
    fireEvent.submit(screen.getByPlaceholderText('you@example.com').closest('form')!);
    expect(await screen.findByText(/too easy to guess/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
