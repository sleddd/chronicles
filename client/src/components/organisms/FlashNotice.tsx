import { useSyncExternalStore } from 'react';
import styled from 'styled-components';
import { clearFlash, getFlash, subscribeToFlash } from '../../services/flashNotice.js';

/* A floating bar for a short message (services/flashNotice.ts). Floats over
   the page, so it takes the overlay shadow. */
const Bar = styled.div`
  position: fixed;
  left: 50%;
  bottom: 24px;
  z-index: 1001;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  max-width: calc(100vw - 32px);
  padding: 12px 14px 12px 18px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 14px;
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
  button {
    flex: none;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: var(--text-muted);
    cursor: pointer;
  }
  button:hover { color: var(--text-secondary); }
`;

export function FlashNotice() {
  const message = useSyncExternalStore(subscribeToFlash, getFlash);
  if (!message) return null;
  return (
    <Bar role="alert">
      <span>{message}</span>
      <button type="button" onClick={clearFlash} aria-label="Dismiss">✕</button>
    </Bar>
  );
}
