import styled, { css } from 'styled-components';
import { outlinedInputs } from '../../styles/filledInputs.js';

/* Sign-in, sign-up and recovery fields in the custom-field style: outlined
   boxes (no fill, 1px --border-card, 10px corners, 48px, accent outline on
   focus) under sentence-case labels, in both themes. */
export const authFields = css`
  ${outlinedInputs}
  && label[for] {
    font-family: var(--font-sans);
    font-size: 15px;
    font-weight: 500;
    letter-spacing: normal;
    text-transform: none;
    color: var(--text-soft);
  }
`;

export const AuthForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 8px;
  ${authFields}
`;
