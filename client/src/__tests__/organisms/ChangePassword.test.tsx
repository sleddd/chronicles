import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { ChangePassword } from '@/components/organisms/ChangePassword';

vi.mock('@/contexts/EncryptionContext', () => ({
  useEncryption: () => ({
    rewrapMasterKey: vi.fn().mockResolvedValue({
      salt: 'newsalt',
      wrappedMK: 'newwrapped',
      wrapIv: 'newiv',
    }),
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ encryptionData: { kekIterations: 600000 } }),
}));

vi.mock('@/services/api', () => ({
  auth: {
    changePassword: vi.fn().mockResolvedValue(undefined),
  },
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('ChangePassword', () => {
  it('renders security title', () => {
    renderWithTheme(<ChangePassword />);
    expect(screen.getByText('Security')).toBeInTheDocument();
  });

  it('renders change password toggle button', () => {
    renderWithTheme(<ChangePassword />);
    expect(screen.getByText('Change Password')).toBeInTheDocument();
  });

  it('does not show form initially', () => {
    renderWithTheme(<ChangePassword />);
    expect(screen.queryByText('Current Password')).not.toBeInTheDocument();
  });

  it('shows form when toggle is clicked', () => {
    renderWithTheme(<ChangePassword />);
    fireEvent.click(screen.getByText('Change Password'));
    expect(screen.getByText('Current Password')).toBeInTheDocument();
    expect(screen.getByText('New Password')).toBeInTheDocument();
    expect(screen.getByText('Confirm New Password')).toBeInTheDocument();
  });

  it('shows cancel text when form is expanded', () => {
    renderWithTheme(<ChangePassword />);
    fireEvent.click(screen.getByText('Change Password'));
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('renders update password button when expanded', () => {
    renderWithTheme(<ChangePassword />);
    fireEvent.click(screen.getByText('Change Password'));
    expect(screen.getByRole('button', { name: 'Update Password' })).toBeInTheDocument();
  });

  it('shows error when passwords do not match', async () => {
    renderWithTheme(<ChangePassword />);
    fireEvent.click(screen.getByText('Change Password'));

    const inputs = screen.getAllByDisplayValue('');
    // Fill current, new, confirm
    fireEvent.change(inputs[0], { target: { value: 'currentpass' } });
    fireEvent.change(inputs[1], { target: { value: 'NewPassword123!' } });
    fireEvent.change(inputs[2], { target: { value: 'DifferentPassword123!' } });

    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
  });

  it('shows error when new password is too short', async () => {
    renderWithTheme(<ChangePassword />);
    fireEvent.click(screen.getByText('Change Password'));

    const inputs = screen.getAllByDisplayValue('');
    fireEvent.change(inputs[0], { target: { value: 'currentpass' } });
    fireEvent.change(inputs[1], { target: { value: 'short' } });
    fireEvent.change(inputs[2], { target: { value: 'short' } });

    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 12 characters')).toBeInTheDocument();
    });
  });
});
