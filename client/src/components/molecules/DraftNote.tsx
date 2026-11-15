import styled from 'styled-components';

/**
 * "Unsaved writing from Nov 14, 9:02 PM. Restore · Discard" — shown where a
 * sealed draft was found after signing in again (services/drafts.ts).
 */
const Note = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 14px;
  padding: 10px 14px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  background: var(--bg-panel);
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
`;

const Act = styled.button<{ $quiet?: boolean }>`
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-weight: 500;
  color: ${p => (p.$quiet ? 'var(--text-muted)' : 'var(--color-accent-link)')};
  cursor: pointer;
  &:hover, &:focus-visible { text-decoration: underline; }
`;

export function formatDraftTime(savedAt: number, now = new Date()): string {
  const d = new Date(savedAt);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `today at ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}

interface DraftNoteProps {
  savedAt: number;
  onRestore: () => void;
  onDiscard: () => void;
  className?: string;
}

export function DraftNote({ savedAt, onRestore, onDiscard, className }: DraftNoteProps) {
  return (
    <Note role="status" className={className}>
      <span>You have unsaved writing from {formatDraftTime(savedAt)}.</span>
      <Act type="button" onClick={onRestore}>Restore</Act>
      <Act type="button" $quiet onClick={onDiscard}>Discard</Act>
    </Note>
  );
}
