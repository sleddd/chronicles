import { createGlobalStyle } from 'styled-components';

/* Import design-system component styles */
import '../../../design-system/components/core.css';

export const GlobalStyle = createGlobalStyle`
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html {
    font-size: 16px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    height: 100%;
    overflow: hidden;
    overscroll-behavior: none;
  }

  body {
    font-family: var(--sans, ${({ theme }) => theme.fontFamily.sans});
    color: var(--ink, ${({ theme }) => theme.colors.text});
    background-color: var(--paper, ${({ theme }) => theme.colors.background});
    line-height: 1.5;
    height: 100%;
    overflow: hidden;
    overscroll-behavior: none;
    position: fixed;
    width: 100%;
  }

  #root {
    height: 100%;
    overflow: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  button {
    cursor: pointer;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
  }

  input, textarea, select {
    font: inherit;
    color: inherit;
  }

  /* Inputs are never outlined — they separate from the canvas by fill tone,
     not a border. Each input keeps its own background; focus shows no outline. */
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([data-underline]),
  textarea,
  select {
    border: none !important;
    box-shadow: none !important;
    /* Flat, transparent fields app-wide — no filled box. background-color (not
       shorthand) so select chevron background-images survive. */
    background-color: transparent;
  }

  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([data-underline]):focus,
  textarea:focus,
  select:focus,
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([data-underline]):focus-visible,
  textarea:focus-visible,
  select:focus-visible {
    outline: none;
    border: none !important;
    box-shadow: none !important;
  }

  /* Date/time picker icons: gray, inline next to the value not pushed to the far right. */
  input[type="date"]::-webkit-calendar-picker-indicator,
  input[type="time"]::-webkit-calendar-picker-indicator,
  input[type="datetime-local"]::-webkit-calendar-picker-indicator {
    opacity: 0.4;
    filter: invert(60%);
    cursor: pointer;
    margin-left: 6px;
    margin-right: 0;
    margin-top: 3px;
    padding: 0;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  input[type="date"],
  input[type="time"],
  input[type="datetime-local"] {
    width: auto;
    display: inline-flex;
    align-items: center;
  }

  /* Checkbox / radio labels match field labels at 13px. */
  .ch-check__label,
  .ch-radio__label {
    font-size: 13px;
  }

  /* Global focus-visible outline — uses user's header color */
  a:focus-visible,
  button:focus-visible,
  [tabindex]:focus-visible {
    outline: 2px solid rgba(var(--focus-color-rgb, 78, 110, 126), 0.5);
    outline-offset: 2px;
  }

  /* Reduced motion for users who prefer it */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }

  /* Print styles — hide app chrome, show content */
  @media print {
    body {
      background: white !important;
      color: black !important;
    }

    [data-print-hide] {
      display: none !important;
    }

    main {
      overflow: visible !important;
      height: auto !important;
    }

    /* Remove fixed heights so content flows. body is position: fixed on
       screen (iOS scroll lock) — a fixed element prints as a single page,
       so it must go back to static or everything past page one is cut off. */
    html, body, #root, #root > * {
      height: auto !important;
      overflow: visible !important;
    }

    html, body {
      position: static !important;
    }

    /* Paper is white: dark-theme tokens would print pale grey on white */
    html[data-theme="dark"] {
      --text-primary: #18181c !important;
      --text-secondary: #4c4c55 !important;
      --text-tertiary: #74747f !important;
      --ink: #18181c !important;
      --ink-2: #56565f !important;
      --ink-3: #74747f !important;
      --border-subtle: #e4e6ec !important;
      --border-default: #d8dae2 !important;
      --rule: #e4e6ec !important;
      --bg-app: #ffffff !important;
      --bg-surface: #ffffff !important;
      --paper: #ffffff !important;
    }
  }

  /* Screen-reader only utility */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
`;
