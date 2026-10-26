import { useState, type FormEvent, type ReactNode } from 'react';
import styled from 'styled-components';
import { TextInput } from '../atoms/TextInput.js';
import { PasswordInput } from '../atoms/PasswordInput.js';
import { Button } from '../atoms/Button.js';
import { Spinner } from '../atoms/Spinner.js';
import { FormField } from '../molecules/FormField.js';
import { authFields } from '../atoms/AuthForm.js';

/* Fields closer together than the app's forms */
const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 6px;
  ${authFields}
  /* Each field row: less padding, label closer to its box */
  & > div:has(> label[for]) { padding: 4px 0; gap: 8px; }
`;

const ErrorBanner = styled.div`
  padding: ${({ theme }) => theme.spacing.sm}px ${({ theme }) => theme.spacing.md}px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid ${({ theme }) => theme.colors.danger};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  color: ${({ theme }) => theme.colors.danger};
  font-size: ${({ theme }) => theme.fontSize.sm}px;
`;

const SuggestionsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
`;

const SuggestionLabel = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-right: 2px;
`;

const SuggestionChip = styled.button`
  padding: 3px 10px;
  font-size: 15px;
  font-family: ${({ theme }) => theme.fontFamily.ui};
  color: ${({ theme }) => theme.colors.text};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  &:hover { background: rgba(0,0,0,0.04); border-color: ${({ theme }) => theme.colors.textMuted}; }
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

interface RegisterFormProps {
  onSubmit: (data: { email: string; username: string; password: string }) => Promise<void>;
  /** Prefilled email (from a beta sign-up link) */
  initialEmail?: string;
  /** Shown above Create account (the consent card) */
  extra?: ReactNode;
  /** Create account stays disabled until this is true (every consent box ticked) */
  canSubmit?: boolean;
}

export function RegisterForm({ onSubmit, extra, canSubmit = true, initialEmail = '' }: RegisterFormProps) {
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

    // Password — collect all failures at once
    const pwErrors: string[] = [];
    if (password.length < 12) pwErrors.push('at least 12 characters');
    if (!/[A-Z]/.test(password)) pwErrors.push('an uppercase letter');
    if (!/[a-z]/.test(password)) pwErrors.push('a lowercase letter');
    if (!/[0-9]/.test(password)) pwErrors.push('a number');
    if (pwErrors.length > 0) errors.password = `Password must contain ${pwErrors.join(', ')}`;

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

  return (
    <Form onSubmit={handleSubmit}>
      {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

      <FormField label="Email" htmlFor="reg-email" error={fieldErrors.email}>
        <TextInput
          id="reg-email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
        />
      </FormField>

      <FormField label="Username" htmlFor="reg-username" error={fieldErrors.username}>
        <TextInput
          id="reg-username"
          value={username}
          onChange={e => { setUsername(e.target.value); setUsernameSuggestions([]); }}
          placeholder="Choose a username"
          required
          autoComplete="username"
        />
        {usernameSuggestions.length > 0 && (
          <SuggestionsRow>
            <SuggestionLabel>Try:</SuggestionLabel>
            {usernameSuggestions.map(s => (
              <SuggestionChip
                key={s}
                type="button"
                onClick={() => { setUsername(s); setUsernameSuggestions([]); setFieldErrors(prev => ({ ...prev, username: '' })); }}
              >
                {s}
              </SuggestionChip>
            ))}
          </SuggestionsRow>
        )}
      </FormField>

      <FormField label="Password" htmlFor="reg-password" error={fieldErrors.password}>
        <PasswordInput
          id="reg-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Min 12 chars, uppercase, lowercase, number"
          required
          autoComplete="new-password"
        />
      </FormField>

      <FormField label="Confirm Password" htmlFor="reg-confirm" error={fieldErrors.confirmPassword}>
        <PasswordInput
          id="reg-confirm"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          placeholder="Re-enter password"
          required
          autoComplete="new-password"
        />
      </FormField>

      {extra}

      <Button type="submit" fullWidth disabled={loading || !canSubmit} variant="secondary">
        {loading ? <Spinner size={18} /> : 'Create account'}
      </Button>
    </Form>
  );
}
