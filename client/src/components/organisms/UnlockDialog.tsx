import { useState, useRef, useId, type FormEvent } from 'react';
import styled from 'styled-components';
import { createPortal } from 'react-dom';
import { Button } from '../atoms/Button.js';
import { Spinner } from '../atoms/Spinner.js';
import { RememberMe } from '../molecules/RememberMe.js';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${({ theme }) => theme.zIndex.modal};
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
`;

const Card = styled.div`
  width: 100%;
  max-width: 380px;
  padding: ${({ theme }) => theme.spacing.xl}px;
  background: var(--bg-surface);
  border-radius: 0;
  box-shadow: ${({ theme }) => theme.shadow.lg};
`;

const Title = styled.h2`
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 200;
  color: var(--text-primary);
  margin-bottom: 20px;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const InputWrap = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  border: 1px solid var(--border-default);
  border-radius: var(--r-md);
  background: var(--bg-sunken);
  &:focus-within { border-color: var(--color-accent); }
`;

const StyledInput = styled.input`
  flex: 1;
  height: 42px;
  padding: 0 14px;
  font-size: 15px;
  color: var(--text-primary);
  background: transparent;
  border: none;
  outline: none;
  &::placeholder { color: var(--text-disabled); }
`;

const ShowBtn = styled.button`
  padding: 0 12px;
  font-size: 12px;
  color: var(--text-tertiary);
  background: none;
  border: none;
  cursor: pointer;
  &:hover { color: var(--text-primary); }
`;

const ErrorText = styled.div`
  font-size: 13px;
  color: var(--color-danger);
`;

interface UnlockDialogProps {
  /** `remember` is offered only on the lock screen (no onCancel). */
  onUnlock: (password: string, remember?: boolean) => Promise<void>;
  /** When provided, the dialog is dismissible (used for on-demand unlocks, e.g. Settings). */
  onCancel?: () => void;
}

export function UnlockDialog({ onUnlock, onCancel }: UnlockDialogProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const errorId = useId();

  useFocusTrap(cardRef, true);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onUnlock(password, !onCancel && remember);
    } catch {
      setError('Incorrect password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <Overlay>
      <Card ref={cardRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <Title id={titleId}>Unlock Your Journal</Title>
        <Form onSubmit={handleSubmit}>
          {error && <ErrorText role="alert" id={errorId}>{error}</ErrorText>}
          <InputWrap>
            <StyledInput
              id="unlock-pw"
              type={showPassword ? 'text' : 'password'}
              aria-label="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoFocus
              autoComplete="current-password"
              aria-describedby={error ? errorId : undefined}
            />
            <ShowBtn type="button" onClick={() => setShowPassword(v => !v)}>
              {showPassword ? 'Hide' : 'Show'}
            </ShowBtn>
          </InputWrap>
          {!onCancel && <RememberMe checked={remember} onChange={setRemember} />}
          <Button type="submit" fullWidth disabled={loading} variant="secondary">
            {loading ? <Spinner size={18} /> : 'Unlock'}
          </Button>
          {onCancel && (
            <Button type="button" fullWidth variant="ghost" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
          )}
        </Form>
      </Card>
    </Overlay>,
    document.body,
  );
}
