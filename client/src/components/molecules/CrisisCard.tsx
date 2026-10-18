import styled from 'styled-components';
import type { CSSProperties, ReactNode } from 'react';
import type { RiskKind } from '../../utils/chatSafety.js';

/* The AI chat's crisis card (Safety protocol): free help, reachable straight
   from the card — each line has one-tap actions (call, text, chat). Urgent
   leads with 911; eating-disorder risk puts the eating-disorder helpline
   ahead of the general lines. Props only. */

const Card = styled.section<{ $urgent: boolean }>`
  align-self: stretch;
  padding: 14px 16px;
  background: var(--bg-panel, var(--bg-sunken));
  border: 1px solid var(--border-card);
  border-left: ${({ $urgent }) => ($urgent ? '3px solid var(--color-danger, #c0392b)' : '1px solid var(--border-card)')};
  border-radius: 10px;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
`;

const Heading = styled.h3`
  margin: 0;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
`;

const Sub = styled.p`
  margin: 4px 0 0;
  color: var(--text-muted);
`;

const List = styled.ul`
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Name = styled.p`
  margin: 0;
  font-weight: 600;
`;

const Detail = styled.p`
  margin: 0;
  color: var(--text-muted);
`;

const Links = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
`;

/* One-tap action: a small outlined pill */
const Act = styled.a`
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid var(--border-pill, var(--border-default));
  border-radius: var(--r-full, 999px);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  text-decoration: none;
  &:hover { border-color: var(--color-accent-line, var(--color-accent)); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const Actions = styled.div`
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
`;

/* One line of links, for the card pinned at the top after an urgent sign */
const Compact = styled.div`
  align-self: stretch;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border-subtle);
  border-left: 3px solid var(--color-danger, #c0392b);
  font-family: var(--font-sans);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
  a { color: var(--color-accent-link, var(--color-accent)); font-weight: 600; }
`;

interface Line { key: string; name: string; detail: string; actions: { label: string; href: string }[] }

const LINES: Record<string, Line> = {
  emergency: {
    key: 'emergency', name: 'In danger right now', detail: 'Call emergency services.',
    actions: [{ label: 'Call 911', href: 'tel:911' }],
  },
  lifeline: {
    key: 'lifeline', name: '988 Suicide & Crisis Lifeline', detail: 'Free, 24 hours a day.',
    actions: [
      { label: 'Call 988', href: 'tel:988' },
      { label: 'Text 988', href: 'sms:988' },
      { label: 'Chat online', href: 'https://988lifeline.org/chat/' },
    ],
  },
  textLine: {
    key: 'textLine', name: 'Crisis Text Line', detail: 'Text HOME to 741741. Free, 24 hours a day.',
    actions: [{ label: 'Text HOME', href: 'sms:741741?&body=HOME' }],
  },
  eating: {
    key: 'eating', name: 'National Alliance for Eating Disorders',
    detail: 'Licensed therapists, Monday to Friday, 9 a.m. to 7 p.m. Eastern.',
    actions: [{ label: 'Call 866-662-1235', href: 'tel:18666621235' }],
  },
  abroad: {
    key: 'abroad', name: 'Outside the US', detail: 'Free helplines by country.',
    actions: [{ label: 'findahelpline.com', href: 'https://findahelpline.com' }],
  },
};

/** The order the lines are listed in for a rating and kind of risk. */
export function crisisLineOrder(urgent: boolean, kind: RiskKind | null): string[] {
  const middle = kind === 'eating_disorder' ? ['lifeline', 'eating', 'textLine'] : ['lifeline', 'textLine', 'eating'];
  return urgent ? ['emergency', ...middle, 'abroad'] : [...middle, 'abroad'];
}

interface CrisisCardProps {
  urgent?: boolean;
  kind: RiskKind | null;
  /** The chat is paused (elevated / urgent) until "Keep talking" */
  paused?: boolean;
  /** The AI's reply was held back */
  withheld?: boolean;
  /** e.g. the "Keep talking" button while paused */
  action?: ReactNode;
  /** One line of the key numbers (the pinned card once the chat goes on) */
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function CrisisCard({ urgent = false, kind, paused = false, withheld = false, action, compact = false, className, style }: CrisisCardProps) {
  if (compact) {
    return (
      <Compact className={className} style={style} role="region" aria-label="Crisis resources">
        Help is here: <a href="tel:911">911</a> in danger · call or text <a href="tel:988">988</a> · text HOME to <a href="sms:741741?&body=HOME">741741</a>
        {kind === 'eating_disorder' && <> · <a href="tel:18666621235">866-662-1235</a></>}
        {' '}· <a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer">outside the US</a>
      </Compact>
    );
  }
  return (
    <Card $urgent={urgent} className={className} style={style} role="alert" aria-live="assertive" aria-label="Crisis resources">
      <Heading>{urgent ? 'If you might act on this, please reach someone now.' : 'You can talk to a person right now.'}</Heading>
      {withheld && <Sub>That reply was withheld because it wasn’t safe to show.</Sub>}
      {paused && <Sub>The chat is paused. Reach someone below, or keep talking when you’re ready.</Sub>}
      <List>
        {crisisLineOrder(urgent, kind).map(k => {
          const line = LINES[k];
          return (
            <li key={k}>
              <Name>{line.name}</Name>
              <Detail>{line.detail}</Detail>
              <Links>
                {line.actions.map(a => (
                  <Act key={a.label} href={a.href}
                    {...(a.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                    {a.label}
                  </Act>
                ))}
              </Links>
            </li>
          );
        })}
      </List>
      {action && <Actions>{action}</Actions>}
    </Card>
  );
}
