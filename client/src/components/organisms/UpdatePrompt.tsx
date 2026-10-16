import { useState, useSyncExternalStore } from 'react';
import styled from 'styled-components';
import { PillButton } from '../atoms/PillButton.js';
import { getPendingUpdate, subscribeToUpdate } from '../../services/appUpdate.js';

const Bar = styled.div`
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: calc(100vw - 32px);
  padding: 10px 12px 10px 18px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 14px;
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
`;

/** Non-blocking "new version" notice; reloading is the user's choice so unsaved work is safe. */
export function UpdatePrompt() {
  const apply = useSyncExternalStore(subscribeToUpdate, getPendingUpdate);
  const [dismissed, setDismissed] = useState(false);
  if (!apply || dismissed) return null;
  return (
    <Bar role="status">
      <span>A new version of Chronicles is available.</span>
      <PillButton type="button" onClick={apply}>Reload</PillButton>
      <PillButton type="button" $variant="neutral" onClick={() => setDismissed(true)}>Later</PillButton>
    </Bar>
  );
}
