import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';

const navigate = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({
  login: vi.fn(), submitTotpCode: vi.fn(), loginWithPasskey: vi.fn(), cancel2FA: vi.fn(), endSession: vi.fn(),
  pending2FA: null as { pendingToken: string } | null,
}));
const enc = vi.hoisted(() => ({ unlock: vi.fn(), unlockWithPasskey: vi.fn(), clearKey: vi.fn() }));
const freshSignIn = vi.hoisted(() => vi.fn());
const available = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ state: null }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/contexts/EncryptionContext', () => ({ useEncryption: () => enc }));
vi.mock('@/hooks/useFreshSignIn', () => ({ useFreshSignIn: () => freshSignIn }));
vi.mock('@/components/templates/AuthTemplate', () => ({ AuthTemplate: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/services/passkeys', () => ({
  passkeysAvailable: available,
  knownPasskeys: () => [], rememberPasskey: () => {}, keepOnlyPasskeys: () => {},
  PasskeyCancelled: class PasskeyCancelled extends Error {},
  PasskeyCannotUnlock: class PasskeyCannotUnlock extends Error { constructor() { super('This passkey can’t open your journal on this device.'); } },
}));

import { LoginView } from '@/views/LoginView';
import { PasskeyCancelled } from '@/services/passkeys';

const WRAP = { encryptionEnabled: true, kekSalt: 's', encryptedMasterKey: 'k', kekWrapIv: 'i', kekIterations: 600000, recoveryWrappedMK: null, recoveryWrapIv: null };

const typeAndSubmit = () => {
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'o@example.com' } });
  fireEvent.change(screen.getByPlaceholderText('Enter password'), { target: { value: 'Correct-horse-9' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
};

beforeEach(() => {
  [...Object.values(auth), ...Object.values(enc)].forEach(f => { if (typeof f === 'function') (f as ReturnType<typeof vi.fn>).mockReset(); });
  navigate.mockReset(); freshSignIn.mockReset(); available.mockReset();
  auth.pending2FA = null;
  available.mockResolvedValue(true);
  auth.endSession.mockResolvedValue(undefined);
  freshSignIn.mockResolvedValue(undefined);
});

describe('LoginView – password', () => {
  it('clears the last person first (telling other tabs who is signing in), then opens the key and goes in', async () => {
    auth.login.mockResolvedValue(WRAP);
    enc.unlock.mockResolvedValue(undefined);
    renderWithTheme(<LoginView />);
    typeAndSubmit();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard'));
    expect(freshSignIn).toHaveBeenCalledWith('o@example.com');
    expect(freshSignIn.mock.invocationCallOrder[0]).toBeLessThan(auth.login.mock.invocationCallOrder[0]);
    // The wrap goes straight to the unlock; nothing about remembering is passed
    expect(enc.unlock).toHaveBeenCalledWith('Correct-horse-9', 's', 'k', 'i', 600000);
  });

  it('a wrong password leaves no half-claimed sign-in behind', async () => {
    auth.login.mockRejectedValue(new Error('Invalid credentials'));
    renderWithTheme(<LoginView />);
    typeAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
    expect(enc.clearKey).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('a session whose key won’t open is ended at once: signed in and keyless is never a state', async () => {
    auth.login.mockResolvedValue(WRAP);
    enc.unlock.mockRejectedValue(new Error('OperationError'));
    renderWithTheme(<LoginView />);
    typeAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Your journal couldn’t be opened');
    expect(enc.clearKey).toHaveBeenCalled();
    expect(auth.endSession).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('has no Remember me box', () => {
    renderWithTheme(<LoginView />);
    expect(screen.queryByText(/remember me/i)).toBeNull();
  });
});

describe('LoginView – passkey', () => {
  it('shows the button only where the browser can open the journal with one', async () => {
    available.mockResolvedValue(false);
    renderWithTheme(<LoginView />);
    await waitFor(() => expect(available).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Sign in with a passkey' })).toBeNull();
  });

  it('one touch signs in and opens the key, then the secret is zeroed', async () => {
    const prf = new Uint8Array(32).fill(6);
    const wrap = { credentialId: 'c', wrappedMK: 'w', wrapIv: 'i' };
    auth.loginWithPasskey.mockResolvedValue({ user: { email: 'o@example.com' }, wrap, prf });
    let seenAtUnlock: number[] = [];
    enc.unlockWithPasskey.mockImplementation(async (given: Uint8Array) => { seenAtUnlock = Array.from(given); });
    renderWithTheme(<LoginView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard'));
    expect(enc.unlockWithPasskey).toHaveBeenCalledWith(prf, wrap);
    expect(seenAtUnlock.every(b => b === 6)).toBe(true);
    expect(Array.from(prf).every(b => b === 0)).toBe(true);
    // No 2FA step and no password
    expect(auth.login).not.toHaveBeenCalled();
    expect(auth.submitTotpCode).not.toHaveBeenCalled();
  });

  it('closing the sheet says nothing and leaves nothing claimed', async () => {
    auth.loginWithPasskey.mockRejectedValue(new PasskeyCancelled());
    renderWithTheme(<LoginView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
    await waitFor(() => expect(enc.clearKey).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(auth.endSession).not.toHaveBeenCalled();
  });

  it('a passkey the server accepted whose wrap won’t open ends the session, and the secret is still zeroed', async () => {
    const prf = new Uint8Array(32).fill(6);
    auth.loginWithPasskey.mockResolvedValue({ user: {}, wrap: { credentialId: 'c', wrappedMK: 'w', wrapIv: 'i' }, prf });
    enc.unlockWithPasskey.mockRejectedValue(new Error('OperationError'));
    renderWithTheme(<LoginView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t be opened with that passkey');
    expect(auth.endSession).toHaveBeenCalledTimes(1);
    expect(Array.from(prf).every(b => b === 0)).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('LoginView – the 2FA code screen', () => {
  beforeEach(() => { auth.pending2FA = { pendingToken: 'p' }; });

  it('offers "Don’t ask for a code on this browser for 30 days", off to start, and sends it only when ticked', async () => {
    auth.submitTotpCode.mockResolvedValue(WRAP);
    enc.unlock.mockResolvedValue(undefined);
    renderWithTheme(<LoginView />);
    const box = screen.getByRole('checkbox');
    expect(box).not.toBeChecked();
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(auth.submitTotpCode).toHaveBeenCalledWith('123456', false));
  });

  it('ticked, it is sent with the authenticator code', async () => {
    auth.submitTotpCode.mockResolvedValue(WRAP);
    enc.unlock.mockResolvedValue(undefined);
    renderWithTheme(<LoginView />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(auth.submitTotpCode).toHaveBeenCalledWith('123456', true));
  });

  it('is not offered with a backup code, and never sent with one', async () => {
    auth.submitTotpCode.mockResolvedValue(WRAP);
    enc.unlock.mockResolvedValue(undefined);
    renderWithTheme(<LoginView />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Use a backup code instead' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('xxxxxx-xxxxxx'), { target: { value: 'abc123-def456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(auth.submitTotpCode).toHaveBeenCalledWith('abc123-def456', false));
  });
});
