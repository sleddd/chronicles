import { createPortal } from 'react-dom';
import styled, { keyframes } from 'styled-components';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { useRunningTimer } from '../../hooks/useTimeTracking.js';
import { useOpenInJournal } from '../../hooks/useOpenInJournal.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { entryTitleText } from '../../utils/entryTitle.js';
import { builtinEntryName } from '../../utils/stripHtml.js';
import { formatClock } from '../../utils/timeTracking.js';

/* While a timer runs, a floating pill above the In-App AI bubble on every
   signed-in page: a pulsing accent dot, the running clock, what it's timing
   (opens it in the journal) and a round Stop. A floating overlay, so it gets
   the overlay shadow. */

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
`;

const Pill = styled.div`
  position: fixed;
  right: 24px;
  bottom: 184px;
  z-index: 900;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(360px, calc(100vw - 48px));
  height: 46px;
  padding: 0 6px 0 16px;
  border: 1px solid var(--border-pop);
  border-radius: 999px;
  background: var(--bg-tile);
  html[data-theme='light'] & { background: var(--bg-control, var(--bg-tile)); }
  box-shadow: var(--shadow-lg);
  font-family: var(--font-sans);
  @media (max-width: 768px) { right: 16px; bottom: 168px; }
`;

const Dot = styled.i`
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-accent);
  animation: ${pulse} 1.6s ease-in-out infinite;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

const Clock = styled.b`
  flex: none;
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
`;

const Name = styled.button`
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 14px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  &:hover { color: var(--text-primary); }
`;

const Stop = styled.button`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--color-accent-line);
  border-radius: 50%;
  background: transparent;
  color: var(--color-accent-soft);
  cursor: pointer;
  &:hover { color: var(--color-accent-link); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

export function RunningTimer() {
  const { running, elapsedMs, stop } = useRunningTimer();
  const entry = useEntriesStore(s => (running ? s.decryptedEntries.find(e => e.id === running.entryId) : undefined));
  const openInJournal = useOpenInJournal();
  if (!running) return null;
  const cf = (entry?.metadata as Record<string, unknown> | undefined)?._customFields as Record<string, unknown> | undefined;
  const name = entry ? (entryTitleText(entry.content) || builtinEntryName(cf) || 'Untitled') : 'Timer';
  return createPortal(
    <Pill role="status" aria-label={`Timer running for ${name}: ${formatClock(elapsedMs)}`}>
      <Dot aria-hidden="true" />
      <Clock aria-hidden="true">{formatClock(elapsedMs)}</Clock>
      {entry
        ? <Name type="button" title={`Open ${name}`} onClick={() => openInJournal(entry.id)}>{name}</Name>
        : <Name as="span">{name}</Name>}
      <Stop type="button" aria-label={`Stop the timer for ${name}`} title="Stop" onClick={stop}>
        <MaterialIcon $size={20} aria-hidden="true">stop</MaterialIcon>
      </Stop>
    </Pill>,
    document.body,
  );
}
