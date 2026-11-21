import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';

const api = vi.hoisted(() => ({
  passkeys: vi.fn(),
  passkeyRegisterOptions: vi.fn(),
  passkeyRegister: vi.fn(),
  passkeyRename: vi.fn(),
  passkeyRemove: vi.fn(),
  passkeyRemoveAll: vi.fn(),
  trustedBrowsers: vi.fn(),
  forgetTrustedBrowser: vi.fn(),
}));
const svc = vi.hoisted(() => ({
  passkeysAvailable: vi.fn(),
  createPasskey: vi.fn(),
  confirmWithPasskey: vi.fn(),
}));
const enc = vi.hoisted(() => ({
  passwordSource: vi.fn(),
  verifyKeySource: vi.fn(),
  passkeyWrapWith: vi.fn(),
}));

vi.mock('@/services/api', () => ({
  auth: api,
  ApiError: class ApiError extends Error {},
}));
vi.mock('@/services/passkeys', () => ({
  ...svc,
  suggestedPasskeyName: () => 'Safari on macOS',
  knownPasskeys: () => [], rememberPasskey: () => {}, keepOnlyPasskeys: () => {}, forgetPasskeysHere: () => {},
  PasskeyCancelled: class PasskeyCancelled extends Error {},
  PasskeyCannotUnlock: class PasskeyCannotUnlock extends Error {},
}));
vi.mock('@/contexts/EncryptionContext', () => ({ useEncryption: () => enc }));
vi.mock('@chronicles/shared', () => ({ deriveAuthSecret: async (pw: string) => `secret-of-${pw}` }));
vi.mock('@shared/crypto/authSecret.js', () => ({ deriveAuthSecret: async (pw: string) => `secret-of-${pw}`, legacyPasswordForm: () => null }));
vi.mock('@/services/flashNotice', () => ({ showFlash: vi.fn() }));

import { PasskeySettings } from '@/components/organisms/PasskeySettings';
import { TrustedBrowsersSettings } from '@/components/organisms/TrustedBrowsersSettings';

const ONE = [{ id: 7, name: 'MacBook', synced: true, createdAt: '2026-11-01T10:00:00Z', lastUsedAt: null }];
const forget = vi.fn();
const newPrf = () => new Uint8Array(32).fill(4);

beforeEach(() => {
  [...Object.values(api), ...Object.values(svc), ...Object.values(enc)].forEach(f => f.mockReset());
  forget.mockReset();
  svc.passkeysAvailable.mockResolvedValue(true);
  api.passkeys.mockResolvedValue([]);
  enc.passwordSource.mockImplementation(async (password: string) => ({ kind: 'password', password, params: {}, confirmToken: 'p'.repeat(64) }));
  enc.verifyKeySource.mockResolvedValue(undefined);
  enc.passkeyWrapWith.mockResolvedValue({ wrappedMK: 'W', wrapIv: 'I' });
  api.passkeyRegisterOptions.mockResolvedValue({ options: { challenge: 'c' } });
  svc.createPasskey.mockImplementation(async () => ({ response: { id: 'new' }, credentialId: 'new', prf: newPrf(), forget }));
});

const openAdd = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Add passkey' }));
  return screen.getByLabelText('Enter your account password');
};

describe('PasskeySettings', () => {
  it('explains what a passkey does, and hides Add where the browser can’t use one', async () => {
    const { unmount } = renderWithTheme(<PasskeySettings email="o@example.com" totpEnabled={false} />);
    expect(await screen.findByText(/Sign in and open your journal with a fingerprint, face or device PIN/)).toBeInTheDocument();
    unmount();
    svc.passkeysAvailable.mockResolvedValue(false);
    renderWithTheme(<PasskeySettings email="o@example.com" totpEnabled={false} />);
    expect(await screen.findByText(/This browser can’t use a passkey that opens your journal/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add passkey' })).toBeNull();
  });

  it('adding asks for the account password in those words, and checks it (and the code) before anything is made on the device', async () => {
    enc.passwordSource.mockRejectedValue(new Error('Current password incorrect'));
    renderWithTheme(<PasskeySettings email="o@example.com" totpEnabled={false} />);
    const password = await openAdd();
    fireEvent.change(password, { target: { value: 'wrong' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add passkey' }).at(-1)!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Current password incorrect');
    expect(svc.createPasskey).not.toHaveBeenCalled();
    expect(api.passkeyRegister).not.toHaveBeenCalled();
  });

  it('adds one: confirms with the password, makes it, wraps the key under its secret, stores both under the confirmation’s token', async () => {
    api.passkeyRegister.mockResolvedValue({ passkeys: ONE });
    const usable = vi.fn();
    renderWithTheme(<PasskeySettings email="o@example.com" totpEnabled={false} onUsable={usable} />);
    const password = await openAdd();
    fireEvent.change(password, { target: { value: 'hunter2' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add passkey' }).at(-1)!);

    expect(await screen.findByText('Passkey added. You can sign in with it from now on.')).toBeInTheDocument();
    expect(enc.passkeyWrapWith).toHaveBeenCalledWith(expect.objectContaining({ kind: 'password', password: 'hunter2' }), expect.any(Uint8Array), 'new');
    const sent = api.passkeyRegister.mock.calls[0][0];
    expect(enc.passwordSource).toHaveBeenCalledWith('hunter2', 'o@example.com', 'passkey-add', undefined);
    expect(sent).toMatchObject({ response: { id: 'new' }, wrappedMK: 'W', wrapIv: 'I', name: 'Safari on macOS', confirmToken: 'p'.repeat(64) });
    expect(sent.currentAuthSecret).toBeUndefined();
    // The password itself, and the passkey's secret, go nowhere
    expect(Object.values(sent)).not.toContain('hunter2');
    expect(sent.prf).toBeUndefined();
    expect(screen.getByText('MacBook')).toBeInTheDocument();
    await waitFor(() => expect(usable).toHaveBeenLastCalledWith(true));
  });

  it('with 2FA on the code goes with the password (once), and must be typed', async () => {
    api.passkeyRegister.mockResolvedValue({ passkeys: ONE });
    renderWithTheme(<PasskeySettings email="o@example.com" totpEnabled />);
    const password = await openAdd();
    fireEvent.change(password, { target: { value: 'hunter2' } });
    const go = screen.getAllByRole('button', { name: 'Add passkey' }).at(-1)!;
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByLabelText('2FA code'), { target: { value: '123456' } });
    fireEvent.click(go);
    await waitFor(() => expect(api.passkeyRegister).toHaveBeenCalled());
    expect(enc.passwordSource).toHaveBeenCalledWith('hunter2', 'o@example.com', 'passkey-add', '123456');
    // The code is single-use: it is not sent a second time with the passkey itself
    expect(api.passkeyRegister.mock.calls[0][0].code).toBeUndefined();
  });

  it('asks the device to drop a passkey the server refused to store', async () => {
    api.passkeyRegister.mockRejectedValue(new Error('Invalid code'));
    renderWithTheme(<PasskeySettings email="o@example.com" totpEnabled={false} />);
    const password = await openAdd();
    fireEvent.change(password, { target: { value: 'hunter2' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add passkey' }).at(-1)!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid code');
    expect(forget).toHaveBeenCalledTimes(1);
  });

  it('with a passkey already, another can be added by a touch: its token, no password (with 2FA on, the code goes with the touch)', async () => {
    api.passkeys.mockResolvedValue(ONE);
    api.passkeyRegister.mockResolvedValue({ passkeys: [...ONE, { ...ONE[0], id: 8, name: 'Phone' }] });
    svc.confirmWithPasskey.mockResolvedValue({ confirmToken: 't'.repeat(64), wrap: { credentialId: 'old', wrappedMK: 'w', wrapIv: 'i' }, prf: new Uint8Array(32).fill(2) });
    renderWithTheme(<PasskeySettings email="o@example.com" totpEnabled />);
    await openAdd();
    // A passkey stands in for the password only: it waits for the code
    expect(screen.getByRole('button', { name: 'Use a passkey' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('2FA code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use a passkey' }));
    await waitFor(() => expect(api.passkeyRegister).toHaveBeenCalled());
    expect(svc.confirmWithPasskey).toHaveBeenCalledWith('passkey-add', '123456');
    const sent = api.passkeyRegister.mock.calls[0][0];
    expect(sent.confirmToken).toBe('t'.repeat(64));
    expect(sent.currentAuthSecret).toBeUndefined();
    expect(sent.code).toBeUndefined();
    expect(enc.passkeyWrapWith).toHaveBeenCalledWith(expect.objectContaining({ kind: 'passkey' }), expect.any(Uint8Array), 'new');
  });

  it('removing one asks first and needs the password', async () => {
    api.passkeys.mockResolvedValue(ONE);
    api.passkeyRemove.mockResolvedValue({ passkeys: [] });
    renderWithTheme(<PasskeySettings email="o@example.com" totpEnabled={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(screen.getByText(/Remove “MacBook”\? It can no longer sign in/)).toBeInTheDocument();
    const go = screen.getAllByRole('button', { name: 'Remove' }).at(-1)!;
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Enter your account password'), { target: { value: 'hunter2' } });
    fireEvent.click(go);
    await waitFor(() => expect(api.passkeyRemove).toHaveBeenCalledWith(7, { currentAuthSecret: 'secret-of-hunter2' }));
    expect(await screen.findByText('Passkey removed. It can no longer sign in.')).toBeInTheDocument();
  });

  it('offers Remove all for a lost device', async () => {
    api.passkeys.mockResolvedValue(ONE);
    api.passkeyRemoveAll.mockResolvedValue({ passkeys: [] });
    renderWithTheme(<PasskeySettings email="o@example.com" totpEnabled={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove all passkeys' }));
    expect(screen.getByText(/Do this if a device was lost or stolen. Your password and recovery key still work/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Enter your account password'), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove all' }));
    await waitFor(() => expect(api.passkeyRemoveAll).toHaveBeenCalled());
  });

  it('renames in place', async () => {
    api.passkeys.mockResolvedValue(ONE);
    api.passkeyRename.mockResolvedValue({ success: true });
    renderWithTheme(<PasskeySettings email="o@example.com" totpEnabled={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Passkey name'), { target: { value: 'Work laptop' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename' }).at(-1)!);
    await waitFor(() => expect(api.passkeyRename).toHaveBeenCalledWith(7, 'Work laptop'));
    expect(await screen.findByText('Work laptop')).toBeInTheDocument();
  });
});

describe('TrustedBrowsersSettings', () => {
  it('lists the browsers that skip the code and forgets one', async () => {
    api.trustedBrowsers.mockResolvedValue([
      { id: 3, label: 'Safari on macOS', isCurrent: true, createdAt: '2026-11-01T10:00:00Z', expiresAt: '2026-12-01T10:00:00Z', lastUsedAt: null },
    ]);
    api.forgetTrustedBrowser.mockResolvedValue({ success: true });
    renderWithTheme(<TrustedBrowsersSettings />);
    expect(screen.getByText(/Your password is still asked every time/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByText(/Safari on macOS \(this browser\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Forget' }));
    await waitFor(() => expect(api.forgetTrustedBrowser).toHaveBeenCalledWith(3));
    await waitFor(() => expect(screen.queryByText(/Safari on macOS/)).toBeNull());
  });

  it('says how to add one when there are none, and a failed load is not "none"', async () => {
    api.trustedBrowsers.mockResolvedValueOnce([]);
    const { unmount } = renderWithTheme(<TrustedBrowsersSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByText(/None yet\. Tick “Don’t ask for a code on this browser for 30 days”/)).toBeInTheDocument();
    unmount();
    api.trustedBrowsers.mockRejectedValueOnce(new Error('offline'));
    renderWithTheme(<TrustedBrowsersSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    await waitFor(() => expect(api.trustedBrowsers).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/None yet/)).toBeNull();
  });
});
