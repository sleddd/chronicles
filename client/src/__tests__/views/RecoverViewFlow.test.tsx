import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { RecoverView } from '@/views/RecoverView';
import { renderWithTheme } from '../testUtils';

/* The recovery key's wrap of the master key is asked for only with a proof of
   that key (and a 2FA code): an email alone gets the proof's salt and no more. */

const recoverAndRewrap = vi.fn();
const adoptSession = vi.fn();
const clearKey = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => vi.fn()),
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ adoptSession }) }));
vi.mock('@/contexts/EncryptionContext', () => ({ useEncryption: () => ({ recoverAndRewrap, clearKey }) }));
vi.mock('@/hooks/useFreshSignIn', () => ({ useFreshSignIn: () => vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/components/molecules/RecoveryKeyDisplay', () => ({ RecoveryKeyDisplay: ({ recoveryKey }: any) => <div>New key {recoveryKey}</div> }));
vi.mock('@/hooks/useDarkAuthTheme', () => ({ useDarkAuthTheme: vi.fn() }));
vi.mock('@chronicles/shared', async (original) => ({
  ...(await original<typeof import('@chronicles/shared')>()),
  deriveRecoveryProof: vi.fn(async (key: string, salt: string) => `proof(${key},${salt})`),
  deriveAuthSecret: vi.fn(async () => 'secret'),
  newRecoveryProof: vi.fn(async () => ({ recoveryKeyHash: 'newhash', recoveryKeySalt: 'newsalt' })),
}));

const getRecoveryParams = vi.fn();
const recoveryWrap = vi.fn();
const recover = vi.fn();
vi.mock('@/services/api', () => {
  class ApiError extends Error {
    constructor(public status: number, message: string, public retryAfterSec?: number, public body: Record<string, unknown> = {}) { super(message); }
  }
  return {
    ApiError,
    auth: {
      getRecoveryParams: (...a: unknown[]) => getRecoveryParams(...a),
      recoveryWrap: (...a: unknown[]) => recoveryWrap(...a),
      recover: (...a: unknown[]) => recover(...a),
    },
  };
});
import { ApiError } from '@/services/api';

const KEY = 'ABCD-EFGH-IJKL-MNOP-QRST';
const CLEAN = KEY.replace(/-/g, '');
const PASSWORD = 'Qz7!vexing-Harbor-plume-42';

async function toKeyStep() {
  renderWithTheme(<RecoverView />);
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@b.com' } });
  fireEvent.click(screen.getByText('Continue'));
  await screen.findByPlaceholderText('Enter your recovery key');
  fireEvent.change(screen.getByPlaceholderText('Enter your recovery key'), { target: { value: KEY } });
}

beforeEach(() => {
  vi.clearAllMocks();
  getRecoveryParams.mockResolvedValue({ recoveryKeySalt: 'salt' });
  recoveryWrap.mockResolvedValue({ recoveryWrappedMK: 'rw', recoveryWrapIv: 'ri', recoveryToken: 'tok', totpEnabled: false });
  recoverAndRewrap.mockResolvedValue({ salt: 's', wrappedMK: 'w', wrapIv: 'i', newRecoveryKey: 'fresh', newRecoveryWrappedMK: 'nrw', newRecoveryWrapIv: 'nri' });
  recover.mockResolvedValue({ user: { email: 'a@b.com', username: 'a' } });
});

describe('RecoverView: the wrapped key comes only for a checked recovery key', () => {
  it('asks for the wrap with a proof of the key, then resets with the token it was given', async () => {
    await toKeyStep();
    fireEvent.click(screen.getByText('Verify'));
    await screen.findByText('New Password');

    // The key itself is never sent: only its proof, made with the salt the email got
    expect(recoveryWrap).toHaveBeenCalledWith({ email: 'a@b.com', recoveryProof: `proof(${CLEAN},salt)` });
    expect(JSON.stringify(recoveryWrap.mock.calls)).not.toContain(CLEAN + '"');

    fireEvent.change(screen.getByPlaceholderText('Min 12 chars'), { target: { value: PASSWORD } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: PASSWORD } });
    fireEvent.click(screen.getByText('Reset password'));

    await waitFor(() => expect(recover).toHaveBeenCalled());
    expect(recoverAndRewrap).toHaveBeenCalledWith(CLEAN, 'rw', 'ri', PASSWORD);
    expect(recover.mock.calls[0][0]).toMatchObject({ email: 'a@b.com', recoveryProof: `proof(${CLEAN},salt)`, recoveryToken: 'tok' });
    expect(recover.mock.calls[0][0].code).toBeUndefined();
  });

  it('a wrong key goes no further, and nothing is unwrapped', async () => {
    recoveryWrap.mockRejectedValue(new ApiError(401, 'Recovery failed'));
    await toKeyStep();
    fireEvent.click(screen.getByText('Verify'));

    expect(await screen.findByText('Recovery failed')).toBeInTheDocument();
    expect(screen.queryByText('New Password')).not.toBeInTheDocument();
    expect(recoverAndRewrap).not.toHaveBeenCalled();
  });

  it('with 2FA on, asks for a code at the key step and sends it with the proof', async () => {
    recoveryWrap
      .mockRejectedValueOnce(new ApiError(401, 'Enter the code from your authenticator app or a backup code', undefined, { requires2FA: true }))
      .mockResolvedValueOnce({ recoveryWrappedMK: 'rw', recoveryWrapIv: 'ri', recoveryToken: 'tok', totpEnabled: true });
    await toKeyStep();
    fireEvent.click(screen.getByText('Verify'));

    const code = await screen.findByPlaceholderText('123456 or xxxxxx-xxxxxx');
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify'));

    await screen.findByText('New Password');
    expect(recoveryWrap).toHaveBeenLastCalledWith({ email: 'a@b.com', recoveryProof: `proof(${CLEAN},salt)`, code: '123456' });
    // That code is spent: the next step doesn't ask again while the token is good
    expect(screen.queryByPlaceholderText('123456 or xxxxxx-xxxxxx')).not.toBeInTheDocument();
  });

  it('a token that ran out: the reset asks for a code, and sends that in its place', async () => {
    recover
      .mockRejectedValueOnce(new ApiError(401, 'Enter the code from your authenticator app or a backup code', undefined, { requires2FA: true }))
      .mockResolvedValueOnce({ user: { email: 'a@b.com', username: 'a' } });
    await toKeyStep();
    fireEvent.click(screen.getByText('Verify'));
    await screen.findByText('New Password');
    fireEvent.change(screen.getByPlaceholderText('Min 12 chars'), { target: { value: PASSWORD } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: PASSWORD } });
    fireEvent.click(screen.getByText('Reset password'));

    const code = await screen.findByPlaceholderText('123456 or xxxxxx-xxxxxx');
    expect(clearKey).toHaveBeenCalled();
    fireEvent.change(code, { target: { value: '654321' } });
    fireEvent.click(screen.getByText('Reset password'));

    await waitFor(() => expect(recover).toHaveBeenCalledTimes(2));
    expect(recover.mock.calls[1][0].code).toBe('654321');
    expect(recover.mock.calls[1][0].recoveryToken).toBeUndefined();
  });
});
