import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { RegisterView } from '@/views/RegisterView';
import { renderWithTheme } from '../testUtils';

const INVITE_KEY = 'chronicles.invite-v1';
const register = vi.fn();
const clearKey = vi.fn();
let submitError: unknown = null;

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => vi.fn()),
  useSearchParams: vi.fn(() => [new URLSearchParams()]),
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn(() => ({ register })) }));
vi.mock('@/contexts/EncryptionContext', () => ({
  useEncryption: vi.fn(() => ({
    clearKey,
    setupEncryption: vi.fn().mockResolvedValue({
      recoveryKey: 'abc123', wrappedMK: 'wrapped', salt: 'salt', wrapIv: 'iv', recoveryWrappedMK: 'recMK', recoveryWrapIv: 'recIv',
    }),
  })),
}));
// As the real one does: nothing in this tab's session storage carries over
vi.mock('@/hooks/useFreshSignIn', () => ({
  useFreshSignIn: () => async () => { sessionStorage.clear(); },
}));
vi.mock('@/components/templates/AuthTemplate', () => ({
  AuthTemplate: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('@/components/organisms/RegisterForm', () => ({
  RegisterForm: ({ onSubmit }: any) => (
    <button
      type="button"
      onClick={() => { void onSubmit({ email: 'a@b.com', username: 'user', password: 'Password123!' }).catch((e: unknown) => { submitError = e; }); }}
    >
      Register
    </button>
  ),
}));
vi.mock('@/components/molecules/RecoveryKeyDisplay', () => ({
  RecoveryKeyDisplay: ({ recoveryKey }: any) => <div data-testid="recovery-display">{recoveryKey}</div>,
}));

describe('RegisterView: a sign-up the server refuses', () => {
  beforeEach(() => {
    register.mockReset();
    clearKey.mockReset();
    submitError = null;
    sessionStorage.clear();
    window.history.replaceState(null, '', '/sign-up#email=a%40b.com&invite=code-123');
  });

  it('drops the key made for the attempt and keeps the invite code for a reload', async () => {
    register.mockRejectedValue(new Error('This username is already taken.'));
    renderWithTheme(<RegisterView />);
    fireEvent.click(screen.getByText('Register'));

    await waitFor(() => expect(submitError).toBeInstanceOf(Error));
    // No account came of it: this tab must not go on holding a key
    expect(clearKey).toHaveBeenCalledTimes(1);
    // The link's code is back in this tab's storage, so a reload still has it
    expect(JSON.parse(sessionStorage.getItem(INVITE_KEY) ?? 'null')).toEqual({ invite: 'code-123', email: 'a@b.com' });
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ inviteCode: 'code-123' }));
  });

  it('keeps the key and forgets the spent code once the account exists', async () => {
    register.mockResolvedValue(undefined);
    renderWithTheme(<RegisterView />);
    fireEvent.click(screen.getByText('Register'));

    await screen.findByTestId('recovery-display');
    expect(clearKey).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(INVITE_KEY)).toBeNull();
  });
});
