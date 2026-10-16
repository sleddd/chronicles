import { createContext } from 'react';
import styled from 'styled-components';
import { Label } from '../atoms/Label.js';
import { filledInputs } from '../../styles/filledInputs.js';

/* Every FormField renders as a row app-wide: label in a fixed left column,
   value on the right. Inputs are FILLED (DS: --bg-sunken box) so it's clear
   where to type — no hairline under each row; spacing separates fields.
   Phones stack the label above its box. Kept as an exported context (no-op)
   so existing provider wrappers don't break. */
export const FieldRowLayoutContext = createContext(true);

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

  ${filledInputs}

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
