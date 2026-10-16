import { css } from 'styled-components';

/* Filled DS inputs — a sunken box shows where to type. Applied by containers
   (FormField rows, Settings cards) to every text input, select and textarea
   inside them. !important: GlobalStyle flattens every input to transparent. */

const TEXT_INPUTS = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"])';

export const filledInputs = css`
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
`;
