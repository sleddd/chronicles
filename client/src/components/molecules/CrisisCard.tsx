import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import styled from 'styled-components';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { Icon } from '../atoms/core/Icon.jsx';
import type { RiskKind } from '../../utils/chatSafety.js';

/* The AI chat's crisis resources (Safety protocol). Two forms:
   - SupportNotice: a quiet box under the AI's reply (concern / elevated) —
     "If you or someone you know is having a difficult time, support is
     available." with a "Find resources" link that opens one-tap chips;
   - CrisisCard: the full card for urgent signs (911 first, pinned, pauses
     the chat), or its one-line compact form once the chat goes on.
   Eating-disorder risk puts the eating-disorder helpline ahead of the
   general lines. Props only (the notice keeps its own open/closed state). */

const Card = styled.section<{ $urgent: boolean; $scroll?: boolean }>`
  align-self: stretch;
  ${({ $scroll }) => ($scroll ? `
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    /* Scroll cue: a soft shade appears at an edge only while there is more
       to scroll that way (the covers scroll with the content) */
    background:
      linear-gradient(var(--bg-panel) 30%, transparent) center top / 100% 32px no-repeat local,
      linear-gradient(transparent, var(--bg-panel) 70%) center bottom / 100% 32px no-repeat local,
      radial-gradient(farthest-side at 50% 0, rgba(0,0,0,0.18), transparent) center top / 100% 12px no-repeat scroll,
      radial-gradient(farthest-side at 50% 100%, rgba(0,0,0,0.18), transparent) center bottom / 100% 12px no-repeat scroll,
      var(--bg-panel, var(--bg-sunken));
  ` : '')}
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
  gap: 10px;
`;

const Name = styled.p`
  margin: 0;
  font-weight: 600;
  span { font-weight: 400; color: var(--text-muted); }
`;

const Links = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
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
    key: 'emergency', name: 'In danger right now', detail: '',
    actions: [{ label: 'Call 911', href: 'tel:911' }],
  },
  lifeline: {
    key: 'lifeline', name: '988 Suicide & Crisis Lifeline', detail: 'Free, 24 hours a day',
    actions: [
      { label: 'Call 988', href: 'tel:988' },
      { label: 'Text 988', href: 'sms:988' },
      { label: 'Chat online', href: 'https://988lifeline.org/chat/' },
    ],
  },
  textLine: {
    key: 'textLine', name: 'Crisis Text Line', detail: 'Free, 24 hours a day',
    actions: [{ label: 'Text HOME to 741741', href: 'sms:741741?&body=HOME' }],
  },
  eating: {
    key: 'eating', name: 'National Alliance for Eating Disorders',
    detail: 'Mon–Fri, 9 a.m.–7 p.m. Eastern',
    actions: [{ label: 'Call 866-662-1235', href: 'tel:18666621235' }],
  },
  abroad: {
    key: 'abroad', name: 'Outside the US', detail: 'Free helplines by country',
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
  /** Fill the space it's given and scroll inside it (with an edge cue) if it must */
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function CrisisCard({ urgent = false, kind, paused = false, withheld = false, action, compact = false, fill = false, className, style }: CrisisCardProps) {
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
    <Card $urgent={urgent} $scroll={fill} className={className} style={style} role="alert" aria-live="assertive" aria-label="Crisis resources">
      <Heading>{urgent ? 'If you might act on this, please reach someone now.' : 'You can talk to a person right now.'}</Heading>
      {withheld && <Sub>That reply was withheld because it wasn’t safe to show.</Sub>}
      {paused && <Sub>The chat is paused. Reach someone below, or keep talking when you’re ready.</Sub>}
      <List>
        {crisisLineOrder(urgent, kind).map(k => {
          const line = LINES[k];
          return (
            <li key={k}>
              <Name>{line.name}{line.detail && <span> · {line.detail}</span>}</Name>
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

// ── Support notice (concern / elevated) ─────────────────────────────────────

const Notice = styled.aside`
  align-self: stretch;
  display: flex;
  gap: 10px;
  padding: 10px 14px;
  background: var(--bg-panel, var(--bg-sunken));
  border: 1px solid var(--border-card);
  border-radius: 10px;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
`;

const NoticeIcon = styled(MaterialIcon)`
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--text-muted);
`;

const NoticeBody = styled.div`
  flex: 1;
  min-width: 0;
  p { margin: 0; }
`;

const FindLink = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-top: 4px;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-weight: 600;
  color: var(--color-accent-link, var(--color-accent));
  cursor: pointer;
  &:hover { text-decoration: underline; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  svg { transition: transform 150ms; }
  &[aria-expanded='true'] svg { transform: rotate(180deg); }
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
`;

interface Chip { key: string; label: string; title: string; href: string }

const CHIPS: Record<string, Chip[]> = {
  lifeline: [
    { key: 'call988', label: 'Call 988', title: '988 Suicide & Crisis Lifeline — free, 24 hours a day', href: 'tel:988' },
    { key: 'text988', label: 'Text 988', title: '988 Suicide & Crisis Lifeline — free, 24 hours a day', href: 'sms:988' },
    { key: 'chat988', label: 'Chat with 988', title: '988 Suicide & Crisis Lifeline online chat', href: 'https://988lifeline.org/chat/' },
  ],
  textLine: [{ key: 'ctl', label: 'Text HOME to 741741', title: 'Crisis Text Line — free, 24 hours a day', href: 'sms:741741?&body=HOME' }],
  eating: [{ key: 'ed', label: 'Eating disorder helpline', title: 'National Alliance for Eating Disorders — 866-662-1235, Mon–Fri 9 a.m.–7 p.m. Eastern', href: 'tel:18666621235' }],
  abroad: [{ key: 'intl', label: 'Outside the US', title: 'findahelpline.com — free helplines by country', href: 'https://findahelpline.com' }],
  emergency: [{ key: '911', label: 'Call 911', title: 'In danger right now — emergency services', href: 'tel:911' }],
};

/** Chips in the order the lines are listed for this kind of risk (911 last — this isn't the urgent card). */
export function supportChips(kind: RiskKind | null): Chip[] {
  return [...crisisLineOrder(false, kind), 'emergency'].flatMap(k => CHIPS[k]);
}

interface SupportNoticeProps {
  kind: RiskKind | null;
  /** The AI's reply was held back */
  withheld?: boolean;
}

export function SupportNotice({ kind, withheld = false }: SupportNoticeProps) {
  const [open, setOpen] = useState(false);
  const chipsId = useId();
  return (
    <Notice role="note" aria-label="Crisis resources">
      <NoticeIcon $size={20} aria-hidden="true">volunteer_activism</NoticeIcon>
      <NoticeBody>
        {withheld && <p>That reply was withheld because it wasn’t safe to show.</p>}
        <p>If you or someone you know is having a difficult time, support is available.</p>
        <FindLink type="button" aria-expanded={open} aria-controls={chipsId} onClick={() => setOpen(o => !o)}>
          Find resources <Icon name="chevron-down" size={14} strokeWidth={2} aria-hidden="true" />
        </FindLink>
        {open && (
          <Chips id={chipsId}>
            {supportChips(kind).map(c => (
              <Act key={c.key} href={c.href} title={c.title}
                {...(c.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                {c.label}
              </Act>
            ))}
          </Chips>
        )}
      </NoticeBody>
    </Notice>
  );
}
