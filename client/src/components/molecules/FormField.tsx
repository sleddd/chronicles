import { createContext } from 'react';
import styled from 'styled-components';
import { Label } from '../atoms/Label.js';

/* Every FormField renders as a borderless table row app-wide: label in a fixed
   left column, value on the right, hairline divider under each row. Kept as an
   exported context (no-op) so existing provider wrappers don't break. */
export const FieldRowLayoutContext = createContext(true);

const RowWrapper = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border-subtle);

  & > label {
    flex: 0 0 132px;
    margin: 0;
  }

  & > :not(label) {
    flex: 1;
    min-width: 0;
  }

  input, select, textarea {
    background-color: transparent !important;
    padding-left: 0;
  }
  input, textarea {
    padding-right: 0;
  }
  /* Keep the select's chevron + room for it. */
  select {
    appearance: none;
    padding-right: 26px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2390909a' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right center;
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
