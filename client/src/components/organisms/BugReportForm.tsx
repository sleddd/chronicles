import { useMemo, useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { FormWrap, Section, SectionHead, SectionLabel, Chips, Chip, BoxInput, BoxText, FieldNote } from '../molecules/fields/formKit.js';
import { PillButton } from '../atoms/PillButton.js';
import { Spinner } from '../atoms/Spinner.js';
import { BUG_AREAS, SUPPORT_EMAIL, bugEmail, deviceLabel, type BugReportKind } from '../../utils/bugReport.js';
import { bugReports } from '../../services/api.js';

/* The Feedback/Report a Bug form (public page /report-a-bug, linked from the
   landing footer and Settings → Feedback/Report a Bug) — feedback or a bug, chosen first, built from the custom-field kit (formKit) like
   every field form. Send report posts it to the server, which emails it to
   support through Resend — nothing is stored and there's no telemetry. If that
   can't send (not set up, offline, too many), the form falls back to the
   reporter's own email app, with the report to copy by hand. */

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 30px;
  font-size: 14px;
  color: var(--text-muted);
`;

const Fallback = styled.div`
  margin-top: 24px;
  padding: 16px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  font-size: 14px;
  pre {
    margin: 12px 0;
    padding: 12px;
    max-height: 240px;
    overflow: auto;
    border-radius: 6px;
    background: var(--bg-sunken);
    font-family: var(--font-sans);
    font-size: 13px;
    white-space: pre-wrap;
    color: var(--text-secondary);
  }
`;

export function BugReportForm() {
  const [kind, setKind] = useState<BugReportKind>('feedback');
  const [area, setArea] = useState<string>(BUG_AREAS[0]);
  const feedback = kind === 'feedback';
  const [happened, setHappened] = useState('');
  const [steps, setSteps] = useState('');
  const [device, setDevice] = useState(() => (typeof navigator === 'undefined' ? '' : deviceLabel(navigator.userAgent)));
  const [replyTo, setReplyTo] = useState('');
  const [opened, setOpened] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [website, setWebsite] = useState(''); // honeypot

  const email = useMemo(() => bugEmail({ kind, area, happened, steps, device, replyTo }), [kind, area, happened, steps, device, replyTo]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!happened.trim() || state === 'sending') return;
    setState('sending');
    try {
      await bugReports.send({ kind, area, happened, steps: feedback ? '' : steps, device, replyTo, website });
      setState('sent');
      setHappened(''); setSteps(''); setOpened(false);
    } catch {
      // Couldn't send from here: the reporter's own email app instead
      setState('idle');
      window.location.href = email.href;
      setOpened(true);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${SUPPORT_EMAIL}\nSubject: ${email.subject}\n\n${email.body}`);
      setCopied(true);
    } catch { /* the text is on screen to select by hand */ }
  };

  return (
    <form onSubmit={send} style={{ marginTop: 24 }}>
      <FormWrap>
        <Section>
          <SectionHead><SectionLabel as="p" id="bug-kind-label">What would you like to send?</SectionLabel></SectionHead>
          <Chips role="radiogroup" aria-labelledby="bug-kind-label">
            <Chip type="button" role="radio" aria-checked={feedback} $active={feedback} onClick={() => { setKind('feedback'); setState('idle'); }}>Feedback</Chip>
            <Chip type="button" role="radio" aria-checked={!feedback} $active={!feedback} onClick={() => { setKind('bug'); setState('idle'); }}>Report a bug</Chip>
          </Chips>
          <FieldNote>Ideas, suggestions and what you’d change are as welcome as bug reports.</FieldNote>
        </Section>
        <Section>
          <SectionHead><SectionLabel as="p" id="bug-area-label">Where in the app?</SectionLabel></SectionHead>
          <Chips role="radiogroup" aria-labelledby="bug-area-label">
            {BUG_AREAS.map(a => (
              <Chip key={a} type="button" role="radio" aria-checked={area === a} $active={area === a} onClick={() => setArea(a)}>{a}</Chip>
            ))}
          </Chips>
        </Section>
        <Section>
          <SectionHead><SectionLabel as="label" htmlFor="bug-happened">{feedback ? 'Your feedback' : 'What happened?'}</SectionLabel></SectionHead>
          <BoxText id="bug-happened" rows={4} required maxLength={4000} value={happened} onChange={e => setHappened(e.target.value)}
            placeholder={feedback ? 'An idea, a suggestion, something you love or something you’d change' : 'What you expected, and what happened instead'} />
          <FieldNote>Please leave out passwords, recovery keys and health details. Feedback and bug reports go by regular email, which isn’t encrypted.</FieldNote>
        </Section>
        {!feedback && <Section>
          <SectionHead><SectionLabel as="label" htmlFor="bug-steps">What were you doing? (optional)</SectionLabel></SectionHead>
          <BoxText id="bug-steps" rows={3} maxLength={4000} value={steps} onChange={e => setSteps(e.target.value)}
            placeholder="The steps just before it went wrong" />
        </Section>}
        <Section>
          <SectionHead><SectionLabel as="label" htmlFor="bug-device">Device and browser (optional)</SectionLabel></SectionHead>
          <BoxInput id="bug-device" maxLength={120} value={device} onChange={e => setDevice(e.target.value)} placeholder="Safari on iPhone" />
        </Section>
        <Section>
          <SectionHead><SectionLabel as="label" htmlFor="bug-reply">Email for a reply (optional)</SectionLabel></SectionHead>
          <BoxInput id="bug-reply" type="email" maxLength={254} value={replyTo} onChange={e => setReplyTo(e.target.value)} autoComplete="email" />
        </Section>
      </FormWrap>
      {/* Honeypot — hidden from people and screen readers */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website}
        onChange={e => setWebsite(e.target.value)} style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
      <Actions>
        <PillButton type="submit" disabled={!happened.trim() || state === 'sending'}>
          {state === 'sending' ? <Spinner size={14} /> : feedback ? 'Send feedback' : 'Send report'}
        </PillButton>
        <span role="status">
          {state === 'sent'
            ? `Thank you. Your ${feedback ? 'feedback' : 'report'} was sent to ${SUPPORT_EMAIL}.${replyTo.trim() ? ' We’ll reply to the address you gave.' : ''}`
            : `Sent to ${SUPPORT_EMAIL}.`}
        </span>
      </Actions>
      {opened && (
        <Fallback role="status">
          <strong>It couldn’t send from here, so your email app should have opened with it. Didn’t open?</strong> Send it to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> yourself:
          <pre>{`Subject: ${email.subject}\n\n${email.body}`}</pre>
          <PillButton type="button" $variant="neutral" onClick={copy}>{copied ? 'Copied' : 'Copy the report'}</PillButton>
        </Fallback>
      )}
    </form>
  );
}
