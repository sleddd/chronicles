import { useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { Spinner } from '../atoms/Spinner.js';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { authFields, HiddenLabel } from '../atoms/AuthForm.js';
import { PasswordInput } from '../atoms/PasswordInput.js';

/* Sign in: Email and Password as filled boxes named by their placeholders (the labels
   kept for screen readers), Show inside the password box, "Forgot password?" under it on
   the right, a full-width accent Sign in pill, "or", then an outlined passkey pill */

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 18px;
  ${authFields}
`;

/* One field: the same as Create account's */
const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  input { width: 100%; box-sizing: border-box; border: none; outline: none; }
`;

const Forgot = styled.button`
  align-self: flex-end;
  margin-top: -4px;
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--color-accent-link, var(--color-accent));
  cursor: pointer;
  &:hover { text-decoration: underline; }
`;

/* The main action: a full-width accent pill with white text */
const Primary = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  height: 54px;
  margin-top: 10px;
  /* An accent outline pill (accent text, no fill); hover fills it */
  border: 1px solid var(--color-accent-line, var(--color-accent));
  border-radius: 999px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 17px;
  font-weight: 600;
  color: var(--color-accent-line, var(--color-accent));
  transition: border-color 150ms, color 150ms;
  cursor: pointer;
  /* Hover: the background a step darker (the white text stays white) */
  /* Hover: no fill, the outline and text a brighter accent */
  &:hover:not(:disabled) { border-color: color-mix(in srgb, var(--color-accent) 65%, #fff); color: color-mix(in srgb, var(--color-accent) 65%, #fff); }
  &:disabled { opacity: 0.55; cursor: default; }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 3px; }
`;

/* The other way in: an outlined pill */
const Secondary = styled(Primary)`
  margin-top: 0;
  border: 1px solid var(--border-default);
  background: transparent;
  font-weight: 500;
  color: var(--text-primary);
  & > span:first-child { color: var(--color-accent); }
  &:hover:not(:disabled) { filter: none; background: transparent; border-color: var(--border-strong); color: var(--text-primary); }
`;

const Quiet = styled.button`
  align-self: center;
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); text-decoration: underline; }
`;

const ErrorBanner = styled.div`
  padding: 10px 14px;
  background: var(--color-danger-subtle, rgba(239,68,68,0.1));
  border: 1px solid var(--color-danger);
  border-radius: 12px;
  color: var(--color-danger);
  font-size: 14px;
`;

const Or = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 4px 0;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
  &::before, &::after { content: ''; flex: 1; height: 1px; background: var(--border-subtle); }
`;

interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  onForgotPassword?: () => void;
  /** Sign in with a passkey: shown when given (the browser can do it). Rejects with a message to show, or resolves. */
  onPasskey?: (any?: boolean) => Promise<void>;
  /** This browser asks for the passkeys it knows first: offer a way to pick another once that didn't sign in */
  passkeyChoice?: boolean;
}

export function LoginForm({ onSubmit, onForgotPassword, onPasskey, passkeyChoice }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  const [passkeyTried, setPasskeyTried] = useState(false);

  const handlePasskey = async (any = false) => {
    if (!onPasskey) return;
    setError('');
    setPasskeyBusy(true);
    try {
      await onPasskey(any);
      // Still here: the sheet was closed, or the passkey it asked for isn't on this device
      setPasskeyTried(true);
    } catch (err) {
      setPasskeyTried(true);
      setError(err instanceof Error ? err.message : 'That passkey didn’t work');
    } finally {
      setPasskeyBusy(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onSubmit(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form onSubmit={handleSubmit}>
      {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

      {/* The same boxes as Create account's: a plain input for the email, PasswordInput (with its Show) for the password */}
      <Field>
        <HiddenLabel htmlFor="email">Email</HiddenLabel>
        <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="Email" required autoComplete="email" />
      </Field>

      <Field>
        <HiddenLabel htmlFor="password">Password</HiddenLabel>
        <PasswordInput id="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Password" required autoComplete="current-password" />
      </Field>

      {onForgotPassword && (
        <Forgot type="button" onClick={onForgotPassword}>Forgot password?</Forgot>
      )}

      <Primary type="submit" disabled={loading || passkeyBusy}>
        {loading ? <Spinner size={18} /> : 'Sign in'}
      </Primary>

      {onPasskey && (
        <>
          <Or>or</Or>
          <Secondary type="button" disabled={passkeyBusy || loading} onClick={() => void handlePasskey()}>
            {passkeyBusy ? <Spinner size={18} /> : <><MaterialIcon $size={20} aria-hidden="true">key</MaterialIcon>Sign in with a passkey</>}
          </Secondary>
          {passkeyChoice && passkeyTried && (
            <Quiet type="button" disabled={passkeyBusy || loading} onClick={() => void handlePasskey(true)}>
              Use a different passkey
            </Quiet>
          )}
        </>
      )}
    </Form>
  );
}
