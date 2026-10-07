import styled from 'styled-components';

/**
 * The app's outlined pill action (Save entry, Save, Cancel): tracked uppercase
 * label in a hairline pill. `accent` for the primary action, neutral otherwise.
 */
export const PillButton = styled.button<{ $variant?: 'accent' | 'neutral' }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 96px;
  padding: 7px 22px;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${({ $variant }) => ($variant === 'neutral' ? 'var(--text-secondary)' : 'var(--color-accent)')};
  background: transparent;
  border: 1px solid ${({ $variant }) => ($variant === 'neutral' ? 'var(--border-strong)' : 'var(--color-accent)')};
  border-radius: var(--r-full, 999px);
  cursor: pointer;
  transition: background 150ms, opacity 150ms;
  &:hover:not(:disabled) { background: ${({ $variant }) => ($variant === 'neutral' ? 'var(--bg-hover)' : 'var(--color-accent-subtle)')}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  &:disabled { color: var(--text-disabled); border-color: var(--border-default); cursor: not-allowed; }
`;
