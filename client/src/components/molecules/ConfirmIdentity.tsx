import styled from 'styled-components';
import { PasswordInput } from '../atoms/PasswordInput.js';
import { TextInput } from '../atoms/TextInput.js';
import { RowPill } from './SettingsGroup.js';

/**
 * How a sensitive action is confirmed: the account password (and, with 2FA on,
 * an authenticator or backup code) — or, for an account with a passkey, one
 * touch in place of the password. A passkey never stands in for the code: with
 * 2FA on the code box shows for either way, and Use a passkey waits for it.
 *
 * The field always says "Enter your account password", never just "Confirm":
 * someone who signed in with a touch would otherwise wait for a passkey sheet
 * that isn't coming.
 */
export const ACCOUNT_PASSWORD_LABEL = 'Enter your account password';

const Or = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

interface ConfirmIdentityProps {
  password: string;
  onPassword: (value: string) => void;
  /** With 2FA on: the code box (needed with the password or a passkey) */
  showCode?: boolean;
  code?: string;
  onCode?: (value: string) => void;
  /** Shown when the account has a passkey this browser can use */
  onUsePasskey?: () => void;
  busy?: boolean;
  autoFocus?: boolean;
  onEnter?: () => void;
}

export function ConfirmIdentity({ password, onPassword, showCode, code = '', onCode, onUsePasskey, busy, autoFocus, onEnter }: ConfirmIdentityProps) {
  return (
    <>
      {onUsePasskey && (
        <Or>
          <RowPill type="button" onClick={onUsePasskey} disabled={busy || (showCode && !code.trim())}>Use a passkey</RowPill>
          <span>{showCode ? 'with the code below, or your password and the code' : 'or your password'}</span>
        </Or>
      )}
      <PasswordInput
        value={password}
        onChange={e => onPassword(e.target.value)}
        placeholder={ACCOUNT_PASSWORD_LABEL}
        aria-label={ACCOUNT_PASSWORD_LABEL}
        autoComplete="current-password"
        autoFocus={autoFocus}
        onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter(); }}
      />
      {showCode && (
        <TextInput
          value={code}
          onChange={e => onCode?.(e.target.value.slice(0, 64))}
          placeholder="Authenticator or backup code"
          aria-label="2FA code"
          autoComplete="one-time-code"
          onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter(); }}
        />
      )}
    </>
  );
}
