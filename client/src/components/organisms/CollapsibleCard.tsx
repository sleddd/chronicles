import { useState, type ReactNode } from 'react';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';

/* Lifted panel: a surface fill a step off the canvas (visible in dark) with a soft
   hairline and slightly rounded corners; the title row collapses it. */
const Card = styled.section<{ $outlined?: boolean }>`
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  /* Outlined variant (Health dashboard): no fill, a brighter outline instead */
  ${({ $outlined }) => $outlined && 'background: transparent; border-color: var(--border-default);'}
  border-radius: var(--r-lg, 6px);
  padding: 20px 24px;
  @media (max-width: 480px) { padding: 16px; }
`;

const Heading = styled.h3`
  margin: 0;
  display: flex;
  align-items: center;
  gap: 16px;
`;

/* Optional header action (e.g. "See all"), between the title and chevron. */
const Action = styled.div`
  flex-shrink: 0;
  display: flex;
  align-items: center;
`;

const Toggle = styled.button`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 300;
  line-height: 1.2;
  color: var(--text-primary);
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 4px; }
`;

const Chevron = styled.span<{ $open: boolean }>`
  display: inline-flex;
  color: var(--text-tertiary);
  transform: rotate(${({ $open }) => ($open ? 180 : 0)}deg);
  transition: transform 150ms ease;
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const ChevronBtn = styled.button`
  display: flex;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
`;

/* Clear space under the card's title before its content */
const Body = styled.div`
  padding: 36px 0 4px;
`;

function readCollapsed(storageKey: string): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(storageKey) || '{}') as Record<string, boolean>; }
  catch { return {}; }
}

interface CollapsibleCardProps {
  /** Stable id for this card — keys its remembered state and its body element. */
  id: string;
  title: string;
  /** localStorage key holding `{ [id]: collapsed }` for a page's cards. */
  storageKey: string;
  defaultOpen?: boolean;
  /** Control shown in the title row, left of the chevron (kept outside the toggle button). */
  action?: ReactNode;
  /** No fill, a brighter outline (Health dashboard) */
  outlined?: boolean;
  children: ReactNode;
}

/**
 * Bordered card whose title toggles the body. Open/closed is remembered per
 * card in this browser (falls back to `defaultOpen`). The body stays mounted
 * while hidden so form drafts survive collapsing.
 */
export function CollapsibleCard({ id, title, storageKey, defaultOpen = true, action, outlined, children }: CollapsibleCardProps) {
  const [open, setOpen] = useState(() => {
    const saved = readCollapsed(storageKey)[id];
    return saved === undefined ? defaultOpen : !saved;
  });
  const bodyId = `card-${id}`;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(storageKey, JSON.stringify({ ...readCollapsed(storageKey), [id]: !next })); } catch { /* storage unavailable */ }
  };
  return (
    <Card aria-label={title} $outlined={outlined}>
      <Heading>
        <Toggle type="button" onClick={toggle} aria-expanded={open} aria-controls={bodyId}>
          {title}
          {!action && <Chevron $open={open} aria-hidden="true"><Icon name="chevron-down" size={18} strokeWidth={1.8} /></Chevron>}
        </Toggle>
        {action && (
          <>
            <Action>{action}</Action>
            {/* Second hit target for the chevron; the title button is the accessible toggle */}
            <ChevronBtn type="button" onClick={toggle} tabIndex={-1} aria-hidden="true">
              <Chevron $open={open}><Icon name="chevron-down" size={18} strokeWidth={1.8} /></Chevron>
            </ChevronBtn>
          </>
        )}
      </Heading>
      <Body id={bodyId} hidden={!open}>{children}</Body>
    </Card>
  );
}
