import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';

const enc = vi.hoisted(() => ({ passwordSource: vi.fn() }));
const addPasskey = vi.hoisted(() => vi.fn());

vi.mock('@/contexts/EncryptionContext', () => ({ useEncryption: () => enc }));
vi.mock('@/hooks/useAddPasskey', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useAddPasskey')>()),
  useAddPasskey: () => addPasskey,
}));
vi.mock('@/services/passkeys', () => ({
  suggestedPasskeyName: () => 'Safari on macOS',
  PasskeyCancelled: class PasskeyCancelled extends Error {},
  PasskeyCannotUnlock: class PasskeyCannotUnlock extends Error {},
  createPasskey: vi.fn(),
}));

import { PasskeyOffer } from '@/components/organisms/PasskeyOffer';
import { PasskeyCancelled, PasskeyCannotUnlock } from '@/services/passkeys';

const SOURCE = { kind: 'password', password: 'Correct-horse-9', params: {}, confirmToken: 't'.repeat(64) };

beforeEach(() => {
  enc.passwordSource.mockReset(); addPasskey.mockReset();
  enc.passwordSource.mockResolvedValue(SOURCE);
  addPasskey.mockResolvedValue([]);
});

describe('PasskeyOffer (the last step of creating an account)', () => {
  it('says what a passkey does and that the password and recovery key keep working', () => {
    renderWithTheme(<PasskeyOffer email="o@example.com" password={() => 'x'} onDone={vi.fn()} />);
    expect(screen.getByText(/sign in with your fingerprint, face or device PIN/)).toBeInTheDocument();
    expect(screen.getByText(/Your password and recovery key keep working/)).toBeInTheDocument();
  });

  it('adds one with the password just chosen, asking for nothing again, then goes on', async () => {
    const onDone = vi.fn();
    const password = vi.fn(() => 'Correct-horse-9');
    renderWithTheme(<PasskeyOffer email="o@example.com" password={password} onDone={onDone} />);
    // The password is read only when Add is pressed
    expect(password).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(enc.passwordSource).toHaveBeenCalledWith('Correct-horse-9', 'o@example.com', 'passkey-add', undefined);
    expect(addPasskey).toHaveBeenCalledWith(SOURCE, 't'.repeat(64), 'Safari on macOS', expect.any(Function));
  });

  it('is optional: Not now goes straight on and adds nothing', () => {
    const onDone = vi.fn();
    renderWithTheme(<PasskeyOffer email="o@example.com" password={() => 'x'} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(addPasskey).not.toHaveBeenCalled();
    expect(enc.passwordSource).not.toHaveBeenCalled();
  });

  it('closing the passkey sheet leaves the offer there, with no error', async () => {
    addPasskey.mockRejectedValue(new PasskeyCancelled());
    const onDone = vi.fn();
    renderWithTheme(<PasskeyOffer email="o@example.com" password={() => 'x'} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add a passkey' })).not.toBeDisabled());
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.queryByText(/Couldn’t add/)).toBeNull();
  });

  it('a passkey a password manager took (it can’t open the journal) costs no password check on the retry', async () => {
    addPasskey.mockRejectedValueOnce(new (PasskeyCannotUnlock as any)('This passkey can’t open your journal.'));
    addPasskey.mockResolvedValueOnce([]);
    const onDone = vi.fn();
    renderWithTheme(<PasskeyOffer email="o@example.com" password={() => 'Correct-horse-9'} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));
    expect(await screen.findByText('This passkey can’t open your journal.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    // The confirmation was never spent by the server, so it is reused: one check, not two
    expect(enc.passwordSource).toHaveBeenCalledTimes(1);
    expect(addPasskey).toHaveBeenCalledTimes(2);
  });

  it('says why when it fails, and Not now still works', async () => {
    addPasskey.mockRejectedValue(new Error('This passkey can’t open your journal on this device.'));
    const onDone = vi.fn();
    renderWithTheme(<PasskeyOffer email="o@example.com" password={() => 'x'} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));
    expect(await screen.findByText('This passkey can’t open your journal on this device.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
