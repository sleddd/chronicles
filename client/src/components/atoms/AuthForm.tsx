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
  /* Outlined boxes on the card (no fill): 56px,
     12px corners, a hairline outline, the accent outline on focus */
  && input:not([type='checkbox']):not([type='radio']) {
    min-height: 56px;
    padding-left: 18px;
    border-radius: 12px;
    /* No fill: just an outline, a little firmer than the cards' */
    background-color: transparent !important;
    border: 1px solid var(--border-default) !important;
    font-size: 17px;
    color: var(--text-primary);
  }
  && input:not([type='checkbox']):not([type='radio']):hover { background-color: transparent !important; }
  && input::placeholder { color: var(--text-secondary); opacity: 0.85; }
  /* Never a white box: focus keeps no fill, and the browser's autofill (which paints its own
     white or pale blue) is covered with the card's colour and the theme's text colour */
  && input:not([type='checkbox']):not([type='radio']):focus { background-color: transparent !important; border-color: var(--color-accent) !important; }
  /* (Stronger than GlobalStyle's input rule, whose box-shadow: none !important would
     otherwise strip this cover and let the autofill colour through) */
  &&&&&& input:-webkit-autofill,
  &&&&&& input:-webkit-autofill:hover,
  &&&&&& input:-webkit-autofill:focus,
  &&&&&& input:-webkit-autofill:focus-visible,
  &&&&&& input:autofill {
    -webkit-box-shadow: 0 0 0 1000px var(--bg-panel) inset !important;
    box-shadow: 0 0 0 1000px var(--bg-panel) inset !important;
    -webkit-text-fill-color: var(--text-primary);
    caret-color: var(--text-primary);
    transition: background-color 9999s ease-out 0s;
  }
  /* Dark controls from the browser too (autofill menus, the password reveal) */
  html[data-theme='dark'] & { color-scheme: dark; }
`;

/** A label kept for screen readers and tests, hidden from view (the placeholder names the box) */
export const HiddenLabel = styled.label`
  position: absolute !important;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
`;

export const AuthForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 8px;
  ${authFields}
`;
