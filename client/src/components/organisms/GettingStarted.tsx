import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { TickMark } from '../atoms/TickMark.js';
import { cardLabel } from '../../styles/cardLabel.js';
import type { ChecklistItem, ChecklistKey } from '../../utils/onboarding.js';

/* "Getting started" (dashboard, after the welcome tour): a --bg-panel card
   with a checklist — name, city, a first entry, a medication or routine, a
   voice command, the recovery key — each with a line on how to do it and,
   while open, Show me / Try it / I've saved it on the right. Items are only
   ticked by hand (the circle); nothing is checked off for the person. All
   ticked, it says "You're all set"; × closes it for good. Props only. */

const Card = styled.section`
  position: relative;
  margin-top: 24px;
  padding: 26px 32px 18px;
  border-radius: 14px;
  background: var(--bg-panel);
  font-family: var(--font-sans);
  @media (max-width: 480px) { padding: 22px 20px 14px; }
`;

const Head = styled.div`
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding-bottom: 12px;
  margin-right: 36px;
  border-bottom: 1px solid var(--border-subtle);
  h2 { margin: 0; ${cardLabel} }
  span { font-size: 13px; color: var(--text-muted); }
`;

const Close = styled.button`
  position: absolute;
  top: 20px;
  right: 20px;
  display: inline-flex;
  padding: 6px;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 4px; }
`;

const Row = styled.div<{ $done: boolean }>`
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 60px;
  padding: 10px 0;
  & + & { border-top: 1px solid var(--border-subtle); }
`;

const Text = styled.div<{ $done: boolean }>`
  flex: 1;
  min-width: 0;
  b { display: block; font-size: 15px; font-weight: 400; color: ${({ $done }) => ($done ? 'var(--text-muted)' : 'var(--text-primary)')}; text-decoration: ${({ $done }) => ($done ? 'line-through' : 'none')}; }
  span { display: block; margin-top: 3px; font-size: 13px; line-height: 1.45; color: var(--text-muted); }
`;

/* The circle: ticks or unticks the item by hand */
const Tick = styled.button`
  flex: none;
  display: inline-flex;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 50%; }
`;

const AllSet = styled.p`
  margin: 14px 0 4px;
  font-size: 15px;
  color: var(--color-accent-soft);
`;

const ActionBtn = styled.button`
  flex: none;
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  color: var(--color-accent-link);
  cursor: pointer;
  white-space: nowrap;
  &:hover { text-decoration: underline; }
`;

/** What each open item's action is called */
const ACTION: Record<ChecklistKey, string> = {
  name: 'Show me', city: 'Show me', entry: 'Show me', health: 'Show me', voice: 'Try it', recovery: 'I’ve saved it',
};

export function GettingStarted({ items, onAction, onToggle, onDismiss }: {
  items: ChecklistItem[];
  onAction: (key: ChecklistKey) => void;
  /** Tick / untick by hand */
  onToggle: (key: ChecklistKey) => void;
  onDismiss: () => void;
}) {
  const done = items.filter(i => i.done).length;
  return (
    <Card aria-label="Getting started">
      <Head>
        <h2>Getting started</h2>
        <span>{done} of {items.length} done</span>
      </Head>
      <Close type="button" aria-label="Close getting started" title="Close" onClick={onDismiss}>
        <Icon name="x" size={18} strokeWidth={2} />
      </Close>
      {done === items.length && <AllSet>You’re all set. Close this whenever you like.</AllSet>}
      {items.map(i => (
        <Row key={i.key} $done={i.done}>
          <Tick type="button" aria-pressed={i.done} aria-label={i.done ? `Mark “${i.label}” not done` : `Mark “${i.label}” done`} onClick={() => onToggle(i.key)}>
            <TickMark checked={i.done} />
          </Tick>
          <Text $done={i.done}>
            <b>{i.label}</b>
            {!i.done && <span>{i.how}</span>}
          </Text>
          {!i.done && <ActionBtn type="button" onClick={() => onAction(i.key)}>{ACTION[i.key]}</ActionBtn>}
        </Row>
      ))}
    </Card>
  );
}
