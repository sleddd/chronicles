import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';

const navigate = vi.hoisted(() => vi.fn());
const available = vi.hoisted(() => vi.fn());
const offer = vi.hoisted(() => ({ password: '' as string, email: '' as string }));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useSearchParams: () => [new URLSearchParams()],
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ register: vi.fn().mockResolvedValue(undefined) }) }));
vi.mock('@/contexts/EncryptionContext', () => ({
  useEncryption: () => ({
    setupEncryption: vi.fn().mockResolvedValue({ recoveryKey: 'rk', wrappedMK: 'w', salt: 's', wrapIv: 'i', recoveryWrappedMK: 'rw', recoveryWrapIv: 'ri' }),
  }),
}));
vi.mock('@/hooks/useFreshSignIn', () => ({ useFreshSignIn: () => vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/stores/consentStore', () => ({ useConsentStore: (sel: (s: { agree: () => Promise<void> }) => unknown) => sel({ agree: async () => undefined }) }));
vi.mock('@chronicles/shared', async importOriginal => ({
  ...(await importOriginal<typeof import('@chronicles/shared')>()),
  deriveAuthSecret: async () => 'a'.repeat(64),
  newRecoveryProof: async () => ({ recoveryKeyHash: 'h'.repeat(64), recoveryKeySalt: 's'.repeat(32) }),
}));
vi.mock('@/services/passkeys', () => ({ passkeysAvailable: available }));
vi.mock('@/components/templates/AuthTemplate', () => ({
  AuthTemplate: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h1>{title}</h1>{children}</div>,
}));
vi.mock('@/components/organisms/RegisterForm', () => ({
  RegisterForm: ({ onSubmit }: { onSubmit: (d: { email: string; username: string; password: string }) => Promise<void> }) => (
    <button type="button" onClick={() => void onSubmit({ email: 'o@example.com', username: 'olivia', password: 'Correct-horse-9' })}>Register</button>
  ),
}));
vi.mock('@/components/molecules/ConsentCard', () => ({
  ConsentCard: () => null, EMPTY_CONSENT: { breachNotice: 'email', postalAddress: '' }, consentComplete: () => true,
}));
vi.mock('@/components/molecules/RecoveryKeyDisplay', () => ({
  RecoveryKeyDisplay: ({ onConfirm }: { onConfirm: () => void }) => <button type="button" onClick={onConfirm}>I’ve saved it</button>,
}));
vi.mock('@/components/organisms/PasskeyOffer', () => ({
  PasskeyOffer: ({ email, password, onDone }: { email: string; password: () => string; onDone: () => void }) => {
    offer.email = email;
    return (
      <div data-testid="passkey-offer">
        <button type="button" onClick={() => { offer.password = password(); onDone(); }}>Add a passkey</button>
        <button type="button" onClick={onDone}>Not now</button>
      </div>
    );
  },
}));

import { RegisterView } from '@/views/RegisterView';

const signUpAndSaveKey = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));
  fireEvent.click(await screen.findByRole('button', { name: 'I’ve saved it' }));
};

beforeEach(() => { navigate.mockReset(); available.mockReset(); Object.assign(offer, { password: '', email: '' }); });

describe('RegisterView – the passkey step', () => {
  it('comes after the recovery key, where the browser can use a passkey', async () => {
    available.mockResolvedValue(true);
    renderWithTheme(<RegisterView />);
    await waitFor(() => expect(available).toHaveBeenCalled());
    await signUpAndSaveKey();
    expect(await screen.findByRole('heading', { name: 'Sign In With One Touch' })).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    expect(offer.email).toBe('o@example.com');
    // The password just chosen confirms it: nothing is typed again
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));
    expect(offer.password).toBe('Correct-horse-9');
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('is optional: Not now goes to the app', async () => {
    available.mockResolvedValue(true);
    renderWithTheme(<RegisterView />);
    await waitFor(() => expect(available).toHaveBeenCalled());
    await signUpAndSaveKey();
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('is skipped where the browser can’t use a passkey that opens the journal', async () => {
    available.mockResolvedValue(false);
    renderWithTheme(<RegisterView />);
    await waitFor(() => expect(available).toHaveBeenCalled());
    await signUpAndSaveKey();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard'));
    expect(screen.queryByTestId('passkey-offer')).toBeNull();
  });
});
