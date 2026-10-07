import styled from 'styled-components';
import { TextInput } from '../../atoms/TextInput.js';

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InputRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  & > :first-child { flex: 1; min-width: 0; }
`;

const EstimateBtn = styled.button`
  flex-shrink: 0;
  padding: 6px 2px;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-accent);
  background: transparent;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  &:hover:not(:disabled) { opacity: 0.7; }
  &:disabled { opacity: 0.5; cursor: wait; }
`;

const Hint = styled.span<{ $error?: boolean }>`
  font-family: var(--font-sans);
  font-size: 11px;
  color: ${({ $error }) => ($error ? 'var(--color-danger, #c0392b)' : 'var(--text-tertiary)')};
`;

interface CalorieInputProps {
  value: string;
  /** Typed calories — the caller marks these as manual so AI never overwrites them */
  onChange: (value: string) => void;
  /** Shown only when the AI assistant is ready */
  onEstimate?: () => void;
  estimating?: boolean;
  /** The current value came from the AI */
  isAiEstimate?: boolean;
  error?: string;
}

/** Calories input with an optional "Estimate" (AI) action and status line. */
export function CalorieInput({ value, onChange, onEstimate, estimating, isAiEstimate, error }: CalorieInputProps) {
  const hint = error
    ? error
    : estimating
      ? 'Estimating…'
      : isAiEstimate && value
        ? 'AI estimate — edit to override'
        : '';
  return (
    <Wrap>
      <InputRow>
        <TextInput type="number" value={value} onChange={e => onChange(e.target.value)} placeholder="kcal" />
        {onEstimate && (
          <EstimateBtn type="button" onClick={onEstimate} disabled={estimating}>
            Estimate
          </EstimateBtn>
        )}
      </InputRow>
      {hint && <Hint $error={!!error} role="status">{hint}</Hint>}
    </Wrap>
  );
}
