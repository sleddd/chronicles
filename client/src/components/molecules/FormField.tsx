import { createContext } from 'react';
import styled from 'styled-components';
import { Label } from '../atoms/Label.js';
import { filledInputs, TEXT_INPUTS } from '../../styles/filledInputs.js';

/* Every FormField app-wide is a styled field: label ABOVE in 12px tracked
   capitals, the value full width in a filled box with a faint 1px outline and
   the cards' 6px corner, 48px tall. Kept as an exported context (no-op) so
   existing provider wrappers don't break. */
export const FieldRowLayoutContext = createContext(true);

const RowWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  padding: 10px 0;

  & > label {
    flex: none;
    margin: 0;
    padding-top: 0;
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0.10rem;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  & > :not(label) { min-width: 0; }

  ${filledInputs}

  ${TEXT_INPUTS}, select, textarea {
    border: 1px solid var(--border-field, var(--border-default)) !important;
    border-radius: var(--r-lg, 6px); /* same corner as the cards */
    min-height: 48px;
    padding-left: 16px;
    padding-right: 16px;
    font-size: 16px;
  }
  textarea { padding-top: 13px; padding-bottom: 13px; }
  select { padding-right: 40px; background-position: right 16px center; }
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
