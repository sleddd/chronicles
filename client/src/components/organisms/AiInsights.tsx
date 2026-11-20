import { useMemo, useRef, useState, type ReactNode } from 'react';
import styled from 'styled-components';
import { Modal } from '../atoms/Modal.js';
import { PillButton } from '../atoms/PillButton.js';
import { Spinner } from '../atoms/Spinner.js';
import { AiSharePrompt } from '../molecules/AiSharePrompt.js';
import { FilterTabs } from '../molecules/FilterTabs.js';
import { CrisisCard, SupportNotice } from '../molecules/CrisisCard.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { aiFeatureJson, aiProviderName, classifyFeatureReply } from '../../services/aiAssistant.js';
import { queueAnalyticsEvent } from '../../services/analyticsQueue.js';
import { copyText } from '../../utils/clipboard.js';
import { toDateStr } from '../../utils/dateUtils.js';
import { addDays } from '../../utils/planner.js';
import { stripHtml } from '../../utils/stripHtml.js';
import { entryTitleText } from '../../utils/entryTitle.js';
import { topicEntries } from '../../utils/topicIndex.js';
import { replyNeedsReview, replyPatternScreen, type RiskResult } from '../../utils/chatSafety.js';
import {
  INSIGHTS_PERIODS, buildInsightsRequest, insightsText, parseInsights,
  type AiInsightsResult, type InsightsPeriod,
} from '../../utils/aiInsights.js';
import type { RiskKind } from '@shared/validation/schemas';

/*
 * AI insights (the Journal's title row, only while its switch is on and agreed
 * to in this browser). One press, one request: the share prompt first, then a
 * reflection with prompts to copy or write about. Only Journal-topic entries
 * are sent. The request and the answer live in this component's memory and go
 * when the panel closes — never in storage, a setting or a log. The answer is
 * screened like a chat reply, and help is shown when the writing shows risk.
 */

const Center = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px 0;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

const Note = styled.p<{ $error?: boolean }>`
  margin: 0 0 16px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: ${({ $error }) => ($error ? 'var(--color-danger)' : 'var(--text-muted)')};
`;

const Reflection = styled.p`
  margin: 0 0 26px;
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.7;
  color: var(--text-primary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const Section = styled.section`
  & + & { margin-top: 24px; }
  h3 {
    margin: 0 0 4px;
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 300;
    color: var(--text-primary);
  }
  ul { list-style: none; margin: 0; padding: 0; }
  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px 16px;
    padding: 14px 0;
    border-bottom: 1px solid var(--border-subtle);
    font-family: var(--font-sans);
    font-size: 15px;
    line-height: 1.5;
    color: var(--text-secondary);
  }
  li > span { flex: 1 1 260px; overflow-wrap: anywhere; }
`;

const RowActions = styled.div`
  display: flex;
  gap: 8px;
`;

const SmallPill = styled(PillButton)`
  && { min-width: 0; padding: 5px 14px; }
`;

type Step = 'share' | 'working' | 'result';
/** `withheld`: the answer isn't shown (harmful, or its review failed). `kind`: what the help is about, null when unknown */
type Shown = { result: AiInsightsResult | null; risk: RiskResult; withheld: boolean; kind: RiskKind | null };

const PERIOD_TABS = INSIGHTS_PERIODS.map(p => ({ value: String(p.value), label: p.label }));

export function AiInsights({ trigger, onWrite }: {
  /** The button that opens it (the Journal passes its own pill) */
  trigger: (open: () => void) => ReactNode;
  /** "Write about this": start a new Journal entry from a prompt */
  onWrite: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (<>
    {trigger(() => setOpen(true))}
    {open && <InsightsPanel onClose={() => setOpen(false)} onWrite={onWrite} />}
  </>);
}

function InsightsPanel({ onClose, onWrite }: { onClose: () => void; onWrite: (prompt: string) => void }) {
  const journalId = useEntriesStore(s => s.allTopics.find(t => t.name.trim().toLowerCase() === 'journal')?.id ?? null);
  const journal = useEntriesStore(s => (journalId === null ? null : topicEntries(s.decryptedEntries, journalId)));

  const [period, setPeriod] = useState<InsightsPeriod>(7);
  const [step, setStep] = useState<Step>('share');
  const [error, setError] = useState('');
  const [shown, setShown] = useState<Shown | null>(null);
  const [copied, setCopied] = useState('');
  // A request can't be called back: an answer that arrives after Cancel is dropped
  const runRef = useRef(0);

  // What would be sent for the period chosen (the share prompt shows exactly this)
  const request = useMemo(() => {
    const today = toDateStr(new Date());
    const firstDay = addDays(today, -(period - 1));
    // Only the period's entries are turned into plain text: doing that for a whole long journal stalls the panel
    const texts = (journal ?? [])
      .map(e => ({ e, day: toDateStr(e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt)) }))
      .filter(({ day }) => day >= firstDay && day <= today)
      .map(({ e, day }) => ({ id: e.id, day, title: entryTitleText(e.content), text: stripHtml(e.content) }));
    return buildInsightsRequest(texts, period, today, firstDay);
  }, [journal, period]);

  const send = async () => {
    const run = ++runRef.current;
    const sent = request;
    setError('');
    setStep('working');
    try {
      const answer = await aiFeatureJson('aiInsights', sent.system, sent.prompt, 2048);
      if (run !== runRef.current) return;
      const result = parseInsights(answer);
      // Screened like a chat reply: patterns first, then the classifier for an
      // answer that touches these topics. A review that fails withholds it
      const text = insightsText(result);
      let harmful = replyPatternScreen(text);
      let reviewFailed = false;
      if (!harmful && replyNeedsReview(text)) {
        try { harmful = await classifyFeatureReply('aiInsights', text, sent.digest); } catch { reviewFailed = true; }
      }
      if (run !== runRef.current) return;
      // A failed review withholds the answer, but its kind of risk is unknown: never guessed
      const withheld = !!harmful || reviewFailed;
      const kind = harmful ?? sent.risk.kind;
      if (withheld || sent.risk.rating !== 'none') {
        const rating = sent.risk.rating === 'none' ? 'concern' : sent.risk.rating;
        queueAnalyticsEvent({ event: 'crisis_card_shown', rating, kind });
      }
      setShown({ result: withheld ? null : result, risk: sent.risk, withheld, kind });
      setStep('result');
    } catch (err) {
      if (run !== runRef.current) return;
      setError(err instanceof Error ? err.message : 'That didn’t work. Try again.');
      setStep('share');
    }
  };

  const close = () => { runRef.current++; onClose(); };
  const copy = async (text: string) => {
    if (await copyText(text)) { setCopied(text); setTimeout(() => setCopied(c => (c === text ? '' : c)), 1600); }
  };

  const footer = step === 'share' ? (<>
    <PillButton type="button" $variant="neutral" onClick={close}>Cancel</PillButton>
    <PillButton type="button" disabled={request.count === 0} onClick={() => { void send(); }}>OK</PillButton>
  </>) : step === 'working' ? (
    <PillButton type="button" $variant="neutral" onClick={close}>Cancel</PillButton>
  ) : (<>
    {shown?.result && (
      <PillButton type="button" $variant="neutral" onClick={() => { void copy(shown.result!.reflection); }}>
        {copied === shown.result.reflection ? 'Copied' : 'Copy reflection'}
      </PillButton>
    )}
    <PillButton type="button" onClick={close}>Close</PillButton>
  </>);

  const help = shown && (shown.withheld || shown.risk.rating !== 'none') && (
    shown.risk.rating === 'urgent'
      ? <CrisisCard urgent kind={shown.kind} withheld={shown.withheld} />
      : <SupportNotice kind={shown.kind} withheld={shown.withheld} />
  );

  return (
    <Modal open onClose={close} title="AI insights" size="md" footer={footer}>
      {step === 'share' && (<>
        {error && <Note $error role="alert">{error}</Note>}
        <AiSharePrompt provider={aiProviderName()} lines={request.shared} approxTokens={request.approxTokens}
          note={request.count === 0
            ? 'There are no Journal entries in this period.'
            : request.leftOut > 0 ? `${request.leftOut} older entries are left out to keep the request small.` : undefined}>
          <FilterTabs options={PERIOD_TABS} active={String(period)} onChange={v => setPeriod(Number(v) as InsightsPeriod)} label="Period" bordered={false} flush />
        </AiSharePrompt>
      </>)}
      {step === 'working' && <Center role="status"><Spinner size={32} />Reading your entries…</Center>}
      {step === 'result' && shown && (<>
        <Note>Written by an AI model, not a person. It can be wrong, and it is not medical or mental-health advice.</Note>
        {help}
        {shown.result && (<>
          <Reflection style={help ? { marginTop: 20 } : undefined}>{shown.result.reflection}</Reflection>
          {shown.result.prompts.length > 0 && (
            <Section aria-label="Reflection prompts">
              <h3>Reflection prompts</h3>
              <ul>
                {shown.result.prompts.map(p => (
                  <li key={p}>
                    <span>{p}</span>
                    <RowActions>
                      <SmallPill type="button" $variant="neutral" onClick={() => { void copy(p); }}>{copied === p ? 'Copied' : 'Copy'}</SmallPill>
                      <SmallPill type="button" onClick={() => { onWrite(p); close(); }}>Write about this</SmallPill>
                    </RowActions>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {shown.result.chatSuggestions.length > 0 && (
            <Section aria-label="To ask an AI chat">
              <h3>To ask an AI chat</h3>
              <ul>
                {shown.result.chatSuggestions.map(s => (
                  <li key={s}>
                    <span>{s}</span>
                    <RowActions>
                      <SmallPill type="button" $variant="neutral" onClick={() => { void copy(s); }}>{copied === s ? 'Copied' : 'Copy'}</SmallPill>
                    </RowActions>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>)}
      </>)}
    </Modal>
  );
}
