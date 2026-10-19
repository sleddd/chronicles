import { useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { Button } from '../atoms/Button.js';
import { Spinner } from '../atoms/Spinner.js';
import { RememberMe } from '../molecules/RememberMe.js';
import { authFields } from '../atoms/AuthForm.js';

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
  ${authFields}
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const FieldLabel = styled.label``;

const InputWrap = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  /* The input itself carries the outline (authFields); Show sits inside it */
  input { padding-right: 64px !important; }
`;

const StyledInput = styled.input`
  flex: 1;
  height: 48px;
  font-size: 16px;
  color: var(--text-primary);
  background: transparent;
  border: none;
  outline: none;
  &::placeholder { color: var(--text-disabled); }
`;

const ShowBtn = styled.button`
  position: absolute;
  right: 6px;
  padding: 0 10px;
  font-size: 12px;
  color: var(--text-tertiary);
  background: none;
  border: none;
  cursor: pointer;
  &:hover { color: var(--text-primary); }
`;

const ErrorBanner = styled.div`
  padding: 10px 14px;
  background: var(--color-danger-subtle, rgba(239,68,68,0.1));
  border: 1px solid var(--color-danger);
  border-radius: var(--r-md);
  color: var(--color-danger);
  font-size: 13px;
`;

interface LoginFormProps {
  onSubmit: (email: string, password: string, remember: boolean) => Promise<void>;
  onForgotPassword?: () => void;
}

export function LoginForm({ onSubmit, onForgotPassword }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onSubmit(email, password, remember);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form onSubmit={handleSubmit}>
      {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

      <Field>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <InputWrap>
          <StyledInput
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </InputWrap>
      </Field>

      <Field>
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <InputWrap>
          <StyledInput
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter password"
            required
            autoComplete="current-password"
          />
          <ShowBtn type="button" onClick={() => setShowPassword(v => !v)}>
            {showPassword ? 'Hide' : 'Show'}
          </ShowBtn>
        </InputWrap>
      </Field>

      <RememberMe checked={remember} onChange={setRemember} />

      <Button type="submit" fullWidth disabled={loading} variant="secondary">
        {loading ? <Spinner size={18} /> : 'Sign in'}
      </Button>

      {onForgotPassword && (
        <Button type="button" variant="ghost" onClick={onForgotPassword}>
          Forgot password?
        </Button>
      )}
    </Form>
  );
}
