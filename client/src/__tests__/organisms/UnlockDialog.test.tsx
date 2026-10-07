import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { UnlockDialog } from '@/components/organisms/UnlockDialog';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('UnlockDialog', () => {
  it('renders unlock title and description', () => {
    renderWithTheme(<UnlockDialog onUnlock={vi.fn()} />);
    expect(screen.getByText('Unlock Your Journal')).toBeInTheDocument();
    expect(screen.getByText(/Enter your password to decrypt/)).toBeInTheDocument();
  });

  it('renders password field and unlock button', () => {
    renderWithTheme(<UnlockDialog onUnlock={vi.fn()} />);
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument();
  });

  it('calls onUnlock with password', async () => {
    const onUnlock = vi.fn().mockResolvedValue(undefined);
    renderWithTheme(<UnlockDialog onUnlock={onUnlock} />);

    fireEvent.change(screen.getByPlaceholderText('Enter your password'), {
      target: { value: 'mypassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => {
      expect(onUnlock).toHaveBeenCalledWith('mypassword', false);
    });
  });

  it('shows error on failed unlock', async () => {
    const onUnlock = vi.fn().mockRejectedValue(new Error('Wrong'));
    renderWithTheme(<UnlockDialog onUnlock={onUnlock} />);

    fireEvent.change(screen.getByPlaceholderText('Enter your password'), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => {
      expect(screen.getByText('Incorrect password. Please try again.')).toBeInTheDocument();
    });
  });
});
