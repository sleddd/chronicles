import styled from 'styled-components';
import { Link } from 'react-router-dom';

/* Settings actions use the app's standard pill (see PillButton, neutral) */
export const ActionButton = styled.button`
  && {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex-shrink: 0;
    padding: 7px 18px;
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--text-secondary);
    background: transparent;
    border: 1px solid var(--border-strong);
    border-radius: var(--r-full, 999px);
    cursor: pointer;
    transition: background 150ms, opacity 150ms;
    &:hover:not(:disabled) { background: var(--bg-hover); }
    &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }
`;

export const SignOutButton = styled(ActionButton)``;

/** Inline text link under a settings row (e.g. "Download example"). */
export const RowLink = styled.button`
  display: inline-block;
  margin-top: 8px;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--color-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
  &:hover { color: var(--color-accent-hover); }
`;

export const SelectedColorLabel = styled.div`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: 8px;
`;

export const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: ${({ theme }) => theme.fontFamily.ui};
  font-size: 13px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05rem;
  color: ${({ theme }) => theme.colors.text};
  text-decoration: none;
  &:hover { opacity: 0.7; }
`;
