import { useState, type FormEvent, type ReactNode } from 'react';
import styled from 'styled-components';
import { PasswordInput } from '../atoms/PasswordInput.js';
import { PasswordStrengthMeter } from '../molecules/PasswordStrengthMeter.js';
import { newPasswordProblem } from '@chronicles/shared';
import { Spinner } from '../atoms/Spinner.js';
import { authFields, HiddenLabel } from '../atoms/AuthForm.js';
import { cardLabel } from '../../styles/cardLabel.js';

/* Create account, in two columns: "1 · Your sign-in" (Email, Username, Password with
   its rules and strength, Confirm password — filled boxes named by their placeholders)
   beside "2 · Before you start" (the consent card, passed in as `extra`), then a foot
   under a hairline: the sign-in link on the left, what's still needed and the
   Create account pill on the right. One column on narrow screens. */

const Form = styled.form`
  display: flex;
  flex-direction: column;
  ${authFields}
`;

const Cols = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: 32px 56px;
  align-items: start;
  @media (max-width: 860px) { grid-template-columns: minmax(0, 1fr); }
`;

const Col = styled.section`
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
`;

/* "1 · YOUR SIGN-IN": the dashboards' card label */
const Step = styled.h2`
  margin: 0 0 4px;
  ${cardLabel}
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  input { width: 100%; box-sizing: border-box; border: none; outline: none; }
`;

const FieldError = styled.p`
  margin: 0;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--color-danger);
`;

/* The password's rules as a quiet line of dots, each lit in the accent once it's met */
const Rules = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 22px;
  margin: 0;
  padding: 0 4px;
  list-style: none;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
  li { display: inline-flex; align-items: center; gap: 8px; }
  li::before { content: ''; width: 4px; height: 4px; border-radius: 50%; background: currentColor; opacity: 0.7; }
  li[data-met] { color: var(--color-accent-soft, var(--color-accent)); }
`;

const ErrorBanner = styled.div`
  margin-bottom: 16px;
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid var(--color-danger);
  border-radius: 12px;
  color: var(--color-danger);
  font-size: 14px;
`;

const SuggestionsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
`;

const SuggestionLabel = styled.span`
  font-size: 14px;
  color: var(--text-muted);
  margin-right: 2px;
`;

const SuggestionChip = styled.button`
  padding: 3px 12px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-card);
  border-radius: 999px;
  cursor: pointer;
  &:hover { border-color: var(--border-strong); color: var(--text-primary); }
`;

/* The foot: the sign-in link, then (right) what's still needed and Create account */
const Foot = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px 24px;
  margin-top: 32px;
  padding-top: 26px;
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-secondary);
  a { font-weight: 600; color: var(--color-accent-link, var(--color-accent)); text-decoration: none; &:hover { text-decoration: underline; } }
`;

const FootLink = styled.div`
  margin-top: 20px;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-secondary);
  a { font-weight: 600; color: var(--color-accent-link, var(--color-accent)); text-decoration: none; &:hover { text-decoration: underline; } }
`;

const Needed = styled.span`
  flex: 1 1 240px;
  min-width: 0;
  text-align: left;
  font-size: 15px;
  color: var(--text-muted);
`;

/* Create account: the accent pill with white text; quiet until ready */
const Submit = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 220px;
  height: 54px;
  padding: 0 36px;
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
  /* Not ready yet: a quiet grey outline */
  &:disabled { border-color: var(--border-default); background: transparent; color: var(--text-muted); cursor: default; }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 3px; }
`;

function generateUsernameSuggestions(base: string): string[] {
  const year = new Date().getFullYear();
  const r = () => String(Math.floor(Math.random() * 900) + 100);
  return [
    `${base}${year}`,
    `${base}${r()}`,
    `${base}_${r()}`,
  ];
}

/** "a, b and c" */
const listWords = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

interface RegisterFormProps {
  onSubmit: (data: { email: string; username: string; password: string }) => Promise<void>;
  /** Prefilled email (from a beta sign-up link) */
  initialEmail?: string;
  /** The right-hand column (the consent card) */
  extra?: ReactNode;
  /** Create account stays disabled until this is true (every consent box ticked) */
  canSubmit?: boolean;
  /** How many consent items are still to agree to (for the "Still needed" line) */
  consentMissing?: number;
  /** At the foot's left ("Already have an account? Sign in") */
  footStart?: ReactNode;
}

export function RegisterForm({ onSubmit, extra, canSubmit = true, initialEmail = '', consentMissing = 0, footStart }: RegisterFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    // Email
    if (!email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Enter a valid email address';
    }

    // Username
    if (username.length < 3) errors.username = 'Minimum 3 characters';

    // Password: the rules, then strength (checked here, since the server never sees it)
    const pwProblem = newPasswordProblem(password, { email, username });
    if (pwProblem) errors.password = pwProblem;

    if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    if (!validate()) return;

    setLoading(true);
    try {
      await onSubmit({ email, username, password });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      if (message.toLowerCase().includes('email')) {
        setFieldErrors(prev => ({ ...prev, email: message }));
      } else if (message.toLowerCase().includes('username')) {
        setFieldErrors(prev => ({ ...prev, username: message }));
        setUsernameSuggestions(generateUsernameSuggestions(username));
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  // The password's rules, lit as they're met
  const rules = [
    { label: '12 or more characters', met: password.length >= 12 },
    { label: 'Upper and lower case', met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: 'A number', met: /\d/.test(password) },
    { label: 'A symbol', met: /[^A-Za-z0-9]/.test(password) },
  ];

  // What's still needed before Create account
  const needed: string[] = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) needed.push('your email');
  if (username.trim().length < 3) needed.push('a username');
  if (newPasswordProblem(password, { email, username }) || password !== confirmPassword) needed.push('your password');
  if (consentMissing > 0) needed.push(`${consentMissing} ${consentMissing === 1 ? 'item' : 'items'} to agree to`);

  return (
    <Form onSubmit={handleSubmit}>
      {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

      <Cols>
        <Col aria-labelledby="reg-step-1">
          <Step id="reg-step-1">1 · Your sign-in</Step>

          <Field>
            <HiddenLabel htmlFor="reg-email">Email</HiddenLabel>
            <input id="reg-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email" required autoComplete="email" aria-invalid={!!fieldErrors.email || undefined}
              aria-describedby={fieldErrors.email ? 'reg-email-error' : undefined} />
            {fieldErrors.email && <FieldError id="reg-email-error" role="alert">{fieldErrors.email}</FieldError>}
          </Field>

          <Field>
            <HiddenLabel htmlFor="reg-username">Username</HiddenLabel>
            <input id="reg-username" value={username} onChange={e => { setUsername(e.target.value); setUsernameSuggestions([]); }}
              placeholder="Username" required autoComplete="username" aria-invalid={!!fieldErrors.username || undefined}
              aria-describedby={fieldErrors.username ? 'reg-username-error' : undefined} />
            {fieldErrors.username && <FieldError id="reg-username-error" role="alert">{fieldErrors.username}</FieldError>}
            {usernameSuggestions.length > 0 && (
              <SuggestionsRow>
                <SuggestionLabel>Try:</SuggestionLabel>
                {usernameSuggestions.map(s => (
                  <SuggestionChip key={s} type="button"
                    onClick={() => { setUsername(s); setUsernameSuggestions([]); setFieldErrors(prev => ({ ...prev, username: '' })); }}>
                    {s}
                  </SuggestionChip>
                ))}
              </SuggestionsRow>
            )}
          </Field>

          <Field>
            <HiddenLabel htmlFor="reg-password">Password</HiddenLabel>
            <PasswordInput id="reg-password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password" required autoComplete="new-password"
              aria-invalid={!!fieldErrors.password || undefined}
              aria-describedby={['reg-password-rules', fieldErrors.password ? 'reg-password-error' : ''].filter(Boolean).join(' ')} />
            <Rules id="reg-password-rules" aria-label="Password rules">
              {rules.map(r => (
                <li key={r.label} data-met={r.met ? '' : undefined}>
                  {r.label}<span className="sr-only">{r.met ? ', met' : ', not met'}</span>
                </li>
              ))}
            </Rules>
            <PasswordStrengthMeter password={password} email={email} username={username} />
            {fieldErrors.password && <FieldError id="reg-password-error" role="alert">{fieldErrors.password}</FieldError>}
          </Field>

          <Field>
            <HiddenLabel htmlFor="reg-confirm">Confirm password</HiddenLabel>
            <PasswordInput id="reg-confirm" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm password" required autoComplete="new-password"
              aria-invalid={!!fieldErrors.confirmPassword || undefined}
              aria-describedby={fieldErrors.confirmPassword ? 'reg-confirm-error' : undefined} />
            {fieldErrors.confirmPassword && <FieldError id="reg-confirm-error" role="alert">{fieldErrors.confirmPassword}</FieldError>}
          </Field>
        </Col>

        {extra && (
          <Col aria-labelledby="reg-step-2">
            <Step id="reg-step-2">2 · Before you start</Step>
            {extra}
          </Col>
        )}
      </Cols>

      <Foot>
        {/* What's still needed on the left, Create account on the right */}
        <Needed id="reg-still-needed">{needed.length > 0 && <>Still needed: {listWords(needed)}</>}</Needed>
        <Submit type="submit" disabled={loading || !canSubmit} aria-describedby={needed.length > 0 ? 'reg-still-needed' : undefined}>
          {loading ? <Spinner size={18} /> : 'Create account'}
        </Submit>
      </Foot>
      {/* The sign-in link on its own row under them */}
      {footStart && <FootLink>{footStart}</FootLink>}
    </Form>
  );
}
