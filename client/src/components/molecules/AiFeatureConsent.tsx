import { useState } from 'react';
import styled from 'styled-components';
import { Checkbox } from '../atoms/core/Checkbox.jsx';
import { RowPill } from './SettingsGroup.js';
import { AI_FEATURE_NOTICE, AI_SHARING_CHECKS, AI_SHARING_CONSENT } from '../../utils/chatDisclosure.js';

/*
 * What someone reads and agrees to before AI task planning or AI insights is
 * switched on (Settings → In-App AI): what that feature sends and costs, the
 * sharing statement (the same words as the Terms and the privacy policy), and
 * two boxes that are never pre-ticked. Props only — the caller saves.
 */

const Box = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px;
  border: 1px solid var(--color-danger);
  border-radius: 10px;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-secondary);
  h4 {
    margin: 0;
    font-family: var(--font-sans);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-danger);
  }
  ul { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
`;

const Checks = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
`;

export function AiFeatureConsent({ feature, provider, onAgree, onCancel }: {
  feature: keyof typeof AI_FEATURE_NOTICE;
  /** Where the data goes, by name ("Claude (Anthropic API)") */
  provider: string;
  onAgree: () => void;
  onCancel: () => void;
}) {
  const [ticked, setTicked] = useState<boolean[]>(() => AI_SHARING_CHECKS.map(() => false));
  const allTicked = ticked.every(Boolean);
  return (
    <Box role="group" aria-label="Before you turn this on">
      <h4>Read this before you turn it on</h4>
      <ul>
        <li>What you send goes from this browser straight to {provider}.</li>
        {AI_FEATURE_NOTICE[feature].map(line => <li key={line}>{line}</li>)}
      </ul>
      <ul>
        {AI_SHARING_CONSENT.map(line => <li key={line}>{line}</li>)}
      </ul>
      <Checks>
        {AI_SHARING_CHECKS.map((label, i) => (
          <Checkbox key={label} label={label} checked={ticked[i]}
            onChange={e => setTicked(t => t.map((v, n) => (n === i ? e.target.checked : v)))} />
        ))}
      </Checks>
      <Actions>
        <RowPill type="button" onClick={onCancel}>Not now</RowPill>
        <RowPill type="button" $tone="accent" disabled={!allTicked} onClick={onAgree}>Turn on</RowPill>
      </Actions>
    </Box>
  );
}
