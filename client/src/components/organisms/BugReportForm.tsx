import { useMemo, useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { FormWrap, Section, SectionHead, SectionLabel, Chips, Chip, BoxInput, BoxText, FieldNote } from '../molecules/fields/formKit.js';
import { PillButton } from '../atoms/PillButton.js';
import { BUG_AREAS, SUPPORT_EMAIL, bugEmail, deviceLabel } from '../../utils/bugReport.js';

/* The bug form (public page /report-a-bug, linked from the landing footer and
   Settings → Report a Bug), built from the custom-field kit (formKit) like
   every field form. It doesn't send anything itself: it opens the reporter's
   email app with the report addressed to support, so nothing is stored on
   the server and there's no telemetry. If no email app opens, the report can
   be copied and sent by hand. */

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
  const [area, setArea] = useState<string>(BUG_AREAS[0]);
  const [happened, setHappened] = useState('');
  const [steps, setSteps] = useState('');
  const [device, setDevice] = useState(() => (typeof navigator === 'undefined' ? '' : deviceLabel(navigator.userAgent)));
  const [replyTo, setReplyTo] = useState('');
  const [opened, setOpened] = useState(false);
  const [copied, setCopied] = useState(false);

  const email = useMemo(() => bugEmail({ area, happened, steps, device, replyTo }), [area, happened, steps, device, replyTo]);

  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!happened.trim()) return;
    window.location.href = email.href;
    setOpened(true);
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
          <SectionHead><SectionLabel as="p" id="bug-area-label">Where in the app?</SectionLabel></SectionHead>
          <Chips role="radiogroup" aria-labelledby="bug-area-label">
            {BUG_AREAS.map(a => (
              <Chip key={a} type="button" role="radio" aria-checked={area === a} $active={area === a} onClick={() => setArea(a)}>{a}</Chip>
            ))}
          </Chips>
        </Section>
        <Section>
          <SectionHead><SectionLabel as="label" htmlFor="bug-happened">What happened?</SectionLabel></SectionHead>
          <BoxText id="bug-happened" rows={4} required maxLength={4000} value={happened} onChange={e => setHappened(e.target.value)}
            placeholder="What you expected, and what happened instead" />
          <FieldNote>Please leave out passwords, recovery keys and health details. Bug reports go by regular email, which isn’t encrypted.</FieldNote>
        </Section>
        <Section>
          <SectionHead><SectionLabel as="label" htmlFor="bug-steps">What were you doing? (optional)</SectionLabel></SectionHead>
          <BoxText id="bug-steps" rows={3} maxLength={4000} value={steps} onChange={e => setSteps(e.target.value)}
            placeholder="The steps just before it went wrong" />
        </Section>
        <Section>
          <SectionHead><SectionLabel as="label" htmlFor="bug-device">Device and browser (optional)</SectionLabel></SectionHead>
          <BoxInput id="bug-device" maxLength={120} value={device} onChange={e => setDevice(e.target.value)} placeholder="Safari on iPhone" />
        </Section>
        <Section>
          <SectionHead><SectionLabel as="label" htmlFor="bug-reply">Email for a reply (optional)</SectionLabel></SectionHead>
          <BoxInput id="bug-reply" type="email" maxLength={254} value={replyTo} onChange={e => setReplyTo(e.target.value)} autoComplete="email" />
        </Section>
      </FormWrap>
      <Actions>
        <PillButton type="submit" disabled={!happened.trim()}>Email the report</PillButton>
        <span>Opens your email app, addressed to {SUPPORT_EMAIL}.</span>
      </Actions>
      {opened && (
        <Fallback role="status">
          <strong>Didn’t open?</strong> Send it to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> yourself:
          <pre>{`Subject: ${email.subject}\n\n${email.body}`}</pre>
          <PillButton type="button" $variant="neutral" onClick={copy}>{copied ? 'Copied' : 'Copy the report'}</PillButton>
        </Fallback>
      )}
    </form>
  );
}
