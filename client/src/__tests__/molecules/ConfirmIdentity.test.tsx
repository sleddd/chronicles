import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { ACCOUNT_PASSWORD_LABEL, ConfirmIdentity } from '@/components/molecules/ConfirmIdentity';
import { TrustBrowser } from '@/components/molecules/TrustBrowser';
import { DraftNote, formatDraftTime } from '@/components/molecules/DraftNote';
import { SessionRow, signInMethodLabel } from '@/components/molecules/SessionRow';

describe('ConfirmIdentity', () => {
  it('says "Enter your account password", never just "Confirm"', () => {
    renderWithTheme(<ConfirmIdentity password="" onPassword={vi.fn()} />);
    expect(ACCOUNT_PASSWORD_LABEL).toBe('Enter your account password');
    expect(screen.getByLabelText('Enter your account password')).toHaveAttribute('placeholder', 'Enter your account password');
    expect(screen.queryByText(/^confirm$/i)).toBeNull();
  });

  it('shows the code box only with 2FA on, and the passkey button only when one can be used', () => {
    const { rerender } = renderWithTheme(<ConfirmIdentity password="" onPassword={vi.fn()} />);
    expect(screen.queryByLabelText('2FA code')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use a passkey' })).toBeNull();
    const onUsePasskey = vi.fn();
    rerender(<ConfirmIdentity password="" onPassword={vi.fn()} showCode code="" onCode={vi.fn()} onUsePasskey={onUsePasskey} />);
    expect(screen.getByLabelText('2FA code')).toBeInTheDocument();
    // With 2FA on, a passkey stands in for the password only: it waits for the code
    expect(screen.getByRole('button', { name: 'Use a passkey' })).toBeDisabled();
    expect(screen.getByText('with the code below, or your password and the code')).toBeInTheDocument();
    rerender(<ConfirmIdentity password="" onPassword={vi.fn()} showCode code="123456" onCode={vi.fn()} onUsePasskey={onUsePasskey} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use a passkey' }));
    expect(onUsePasskey).toHaveBeenCalledTimes(1);
  });

  it('without 2FA, a passkey alone confirms', () => {
    const onUsePasskey = vi.fn();
    renderWithTheme(<ConfirmIdentity password="" onPassword={vi.fn()} onUsePasskey={onUsePasskey} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use a passkey' }));
    expect(onUsePasskey).toHaveBeenCalledTimes(1);
    expect(screen.getByText('or your password')).toBeInTheDocument();
  });

  it('passes what is typed and Enter', () => {
    const onPassword = vi.fn();
    const onEnter = vi.fn();
    renderWithTheme(<ConfirmIdentity password="" onPassword={onPassword} onEnter={onEnter} />);
    const field = screen.getByLabelText('Enter your account password');
    fireEvent.change(field, { target: { value: 'hunter2' } });
    expect(onPassword).toHaveBeenCalledWith('hunter2');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onEnter).toHaveBeenCalledTimes(1);
  });
});

describe('TrustBrowser', () => {
  it('says what it skips, and — once ticked — what it doesn’t', () => {
    const onChange = vi.fn();
    const { rerender } = renderWithTheme(<TrustBrowser checked={false} onChange={onChange} />);
    expect(screen.getByText('Don’t ask for a code on this browser for 30 days')).toBeInTheDocument();
    expect(screen.queryByText(/password every time/)).toBeNull();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<TrustBrowser checked onChange={onChange} />);
    expect(screen.getByText(/You’ll still enter your password every time/)).toBeInTheDocument();
    // It never claims to keep anyone unlocked or signed in
    expect(screen.queryByText(/stay (unlocked|signed in)|remember me/i)).toBeNull();
  });
});

describe('DraftNote', () => {
  it('offers the unsaved writing back, with a way to throw it away', () => {
    const onRestore = vi.fn();
    const onDiscard = vi.fn();
    renderWithTheme(<DraftNote savedAt={Date.now()} onRestore={onRestore} onDiscard={onDiscard} />);
    expect(screen.getByRole('status')).toHaveTextContent(/You have unsaved writing from today at/);
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('names the day when it wasn’t today', () => {
    const now = new Date('2026-11-15T12:00:00');
    expect(formatDraftTime(new Date('2026-11-15T09:02:00').getTime(), now)).toBe('today at 9:02 AM');
    expect(formatDraftTime(new Date('2026-11-14T21:02:00').getTime(), now)).toBe('Nov 14, 9:02 PM');
  });
});

describe('SessionRow – how it signed in', () => {
  it('puts the method in words', () => {
    expect(signInMethodLabel('passkey')).toBe('a passkey');
    expect(signInMethodLabel('trusted')).toBe('your password, on a trusted browser');
    expect(signInMethodLabel(null)).toBeNull();
    expect(signInMethodLabel('something-new')).toBeNull();
  });

  it('shows it after the last-active date, and nothing when unknown', () => {
    const base = { deviceInfo: 'Safari on macOS', ipAddress: '1.2.3.4', lastActiveAt: '2026-11-15T10:00:00Z', isCurrent: false };
    const { rerender } = renderWithTheme(<SessionRow {...base} signedInWith="a passkey" />);
    expect(screen.getByText(/Signed in with a passkey/)).toBeInTheDocument();
    rerender(<SessionRow {...base} />);
    expect(screen.queryByText(/Signed in with/)).toBeNull();
  });
});
