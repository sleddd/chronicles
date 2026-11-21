import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { PillButton } from '../atoms/PillButton.js';

/*
 * The minute before an idle sign-out (WCAG 2.2.1): a floating note with the
 * seconds left and Stay signed in. It doesn't take focus — focusing it would
 * count as someone being here and put the sign-out off by itself — but it is
 * announced (role="alert"), and any key, tap or click anywhere keeps the
 * session, as Stay signed in does. What is announced is one fixed sentence:
 * the seconds ticking down are for the eye only, or a screen reader would
 * start the alert again every second and never reach the button.
 */

const Panel = styled.div`
  position: fixed;
  left: 50%;
  bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  z-index: 10000;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px 20px;
  max-width: calc(100vw - 32px);
  padding: 16px 20px;
  border: 1px solid var(--border-pop, var(--border-card));
  border-radius: 14px;
  background: var(--bg-tile);
  box-shadow: var(--shadow-xl);
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-primary);
`;

export function IdleWarning({ signOutAt, onStay }: { signOutAt: number; onStay: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((signOutAt - now) / 1000));
  return createPortal(
    <Panel role="alert">
      <span className="sr-only">You’ll be signed out in about a minute because no one has been here for a while.</span>
      <span aria-hidden="true">You’ll be signed out in {left} {left === 1 ? 'second' : 'seconds'} because no one has been here for a while.</span>
      <PillButton type="button" onClick={onStay}>Stay signed in</PillButton>
    </Panel>,
    document.body,
  );
}
