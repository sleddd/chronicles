import styled from 'styled-components';
import { NAV_COMPACT } from '../../styles/breakpoints.js';

/**
 * The app's outlined pill action (Save entry, Save, Cancel): tracked uppercase
 * label in a hairline pill (sentence case in light theme). `accent` for the primary action, neutral otherwise.
 * `solid` is a page's New button in its header (New task, New goal, New topic…): filled in the accent
 * with dark text (white in light theme) on wider screens — on the photo too — and the outlined accent pill on phones and
 * tablets, where it sits in the top bar. It carries `data-solid` so the photo's glass rule leaves it be.
 */
type Variant = 'accent' | 'neutral' | 'solid';
// A data attribute isn't in the button's prop types, so it's handed over as a plain object
const solidMark = ({ $variant }: { $variant?: Variant }) => ($variant === 'solid' ? { 'data-solid': '' } : {}) as object;
export const PillButton = styled.button.attrs<{ $variant?: Variant }>(solidMark)<{ $variant?: Variant }>`
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
  color: ${({ $variant }) => ($variant === 'neutral' ? 'var(--text-secondary)' : 'var(--color-accent-line)')};
  background: var(--bg-control, transparent);
  border: 1px solid ${({ $variant }) => ($variant === 'neutral' ? 'var(--border-pill, var(--border-strong))' : 'var(--color-accent-line)')};
  border-radius: var(--r-full, 999px);
  cursor: pointer;
  transition: background 150ms, opacity 150ms;
  &:hover:not(:disabled) { background: ${({ $variant }) => ($variant === 'neutral' ? 'var(--bg-hover)' : 'var(--color-accent-subtle)')}; }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
  &:disabled { color: var(--text-disabled); border-color: var(--border-default); cursor: not-allowed; }
  /* Light: sentence case at normal spacing — small tracked capitals look faint on white */
  html[data-theme='light'] & { text-transform: none; letter-spacing: normal; font-size: 14px; font-weight: 500; }
  ${({ $variant }) => $variant === 'solid' && `
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: #15181d;
    /* Light theme: white text on the accent */
    html[data-theme='light'] & { color: #fff; }
    &:hover:not(:disabled) { background: var(--color-accent-hover); border-color: var(--color-accent-hover); }
    ${NAV_COMPACT} {
      background: var(--bg-control, transparent);
      border-color: var(--color-accent-line);
      color: var(--color-accent-line);
      html[data-theme='light'] & { color: var(--color-accent-line); }
      &:hover:not(:disabled) { background: var(--color-accent-subtle); border-color: var(--color-accent-line); }
    }
  `}
`;
