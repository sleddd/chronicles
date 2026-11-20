import type { ReactNode } from 'react';
import styled from 'styled-components';
import type { SharedLine } from '../../utils/aiJson.js';

/*
 * Asked every time an AI sharing button is pressed (AI task planning, AI
 * insights), before anything is sent: where the unencrypted data is going and
 * exactly what goes. Each line opens to the items by name. Props only — the
 * caller's OK / Cancel buttons do the sending. There is no "don't ask again".
 */

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.55;
  color: var(--text-secondary);
`;

const Warning = styled.p`
  margin: 0;
  font-weight: 600;
  color: var(--color-danger);
`;

const Lines = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  li + li { border-top: 1px solid var(--border-subtle); }
  li { padding: 12px 16px; }
  summary { cursor: pointer; color: var(--text-primary); }
  summary:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 4px; }
  ol {
    margin: 10px 0 2px;
    padding-left: 22px;
    max-height: 180px;
    overflow-y: auto;
    font-size: 14px;
    color: var(--text-muted);
    overflow-wrap: anywhere;
  }
`;

const Plain = styled.span`
  color: var(--text-primary);
`;

const Small = styled.p`
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
`;

export function AiSharePrompt({ provider, lines, approxTokens, note, children }: {
  /** Where it goes, by name ("Claude (Anthropic API)") */
  provider: string;
  lines: SharedLine[];
  approxTokens: number;
  /** One more line under the list (e.g. how many items didn't fit) */
  note?: string;
  /** A control that changes what is sent (the insights period), above the list */
  children?: ReactNode;
}) {
  return (
    <Wrap>
      <Warning role="alert">Your unencrypted data is about to be shared with {provider}.</Warning>
      {children}
      <div>
        <Small style={{ marginBottom: 8 }}>What will be shared:</Small>
        <Lines>
          {lines.map(line => (
            <li key={line.label}>
              {line.items.length > 0 ? (
                <details>
                  <summary>{line.label}</summary>
                  <ol>{line.items.map((item, i) => <li key={i} style={{ padding: '2px 0', border: 'none' }}>{item}</li>)}</ol>
                </details>
              ) : <Plain>{line.label}</Plain>}
            </li>
          ))}
        </Lines>
      </div>
      {note && <Small>{note}</Small>}
      <Small>
        About {approxTokens.toLocaleString('en-US')} tokens, charged by your provider. Its terms apply to what it receives.
        Nothing is stored unencrypted in Chronicles.
      </Small>
    </Wrap>
  );
}
