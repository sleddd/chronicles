import { createContext } from 'react';
import styled from 'styled-components';
import { Label } from '../atoms/Label.js';

/* Every FormField renders as a row app-wide: label in a fixed left column,
   value on the right. Inputs are FILLED (DS: --bg-sunken box) so it's clear
   where to type — no hairline under each row; spacing separates fields.
   Phones stack the label above its box. Kept as an exported context (no-op)
   so existing provider wrappers don't break. */
export const FieldRowLayoutContext = createContext(true);

const TEXT_INPUTS = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"])';

const RowWrapper = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16px;
  padding: 14px 0; /* breathing room between rows */
  /* Same height whether the value is a box or plain text, so rows keep one rhythm */
  min-height: 46px;

  & > label {
    flex: 0 0 150px;
    margin: 0;
  }

  /* Multi-line values (notes): label lines up with the first line of text */
  &:has(textarea) {
    align-items: flex-start;
    & > label { padding-top: 11px; }
  }

  /* Values stay a readable width instead of stretching across the editor */
  & > :not(label) {
    flex: 1;
    min-width: 0;
    max-width: 560px;
  }

  /* !important: GlobalStyle flattens every input to transparent */
  ${TEXT_INPUTS}, select, textarea {
    background-color: var(--bg-sunken) !important;
    border-radius: var(--r-md, 1px);
    padding-left: 12px;
    padding-right: 12px;
    min-height: 38px;
    transition: background-color 120ms;
  }
  textarea { padding-top: 10px; padding-bottom: 10px; }
  ${TEXT_INPUTS}:hover, select:hover, textarea:hover {
    background-color: var(--bg-active) !important;
  }
  ${TEXT_INPUTS}:focus, select:focus, textarea:focus {
    outline: 1px solid var(--color-accent) !important;
    outline-offset: -1px;
  }
  /* Keep the select's chevron + room for it. */
  select {
    appearance: none;
    padding-right: 34px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2390909a' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
  }

  @media (max-width: 480px) {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    & > label { flex: none; }
  }
`;

const ErrorText = styled.span`
  font-size: var(--text-xs, 13px);
  color: var(--text-danger);
`;

interface FormFieldProps {
  /** Usually a string; a node allows mixed casing such as units ("Iron <Unit>(mg)</Unit>") */
  label: React.ReactNode;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function FormField({ label, error, htmlFor, children, style }: FormFieldProps) {
  return (
    <RowWrapper style={style}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <ErrorText>{error}</ErrorText>}
    </RowWrapper>
  );
}
