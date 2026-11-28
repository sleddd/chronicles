import styled from 'styled-components';

/* A task that's waiting on something (Blocked by): a small "Blocked" tag and what it's waiting on —
   on Planner cards and Your Agenda's schedule, where the task's title is struck through too.
   Props only. */

const Wrap = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  font-family: var(--font-sans);
  font-size: 12px;
  line-height: 1.3;
  color: var(--text-muted);
  .tag {
    flex: none;
    padding: 1px 7px;
    border: 1px solid color-mix(in srgb, var(--color-danger) 55%, transparent);
    border-radius: 999px;
    font-weight: 600;
    color: var(--color-danger);
  }
  .by { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

/** `by`: what it's waiting on ("Call the plumber +1"); `compact`: just the tag (the rest is its tooltip) */
export function BlockedTag({ by, compact }: { by: string; compact?: boolean }) {
  return (
    <Wrap title={`Blocked by ${by}`}>
      <span className="tag">Blocked</span>
      {!compact && <span className="by">by {by}</span>}
      {compact && <span className="sr-only">by {by}</span>}
    </Wrap>
  );
}

/** "Blocked by Call the plumber +1" → "Call the plumber +1" (undefined stays undefined) */
export const blockedBy = (text: string | undefined) => text?.replace(/^Blocked by\s+/, '');
