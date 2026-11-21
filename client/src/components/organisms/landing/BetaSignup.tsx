import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import styled from 'styled-components';
import { Checkbox } from '../../atoms/core/Checkbox.jsx';
import { beta } from '../../../services/api.js';

/* The landing page's beta form: name and email in a lifted card. An
   application takes a beta seat while one is open (the server decides, in
   arrival order) and otherwise goes on the waitlist automatically. Everyone
   sees the same thank-you, so the page never shows whether seats are left. A hidden honeypot field catches bots. */

/* A lifted card: the light panel colour, a hairline and a soft shadow */
const BetaCard = styled.div`
  padding: 44px 40px 36px;
  border: 1px solid var(--border-card);
  border-radius: 16px;
  background: var(--bg-panel);
  box-shadow: 0 2px 6px rgba(20, 24, 32, 0.04), 0 24px 56px rgba(20, 24, 32, 0.10);
  @media (max-width: 600px) { padding: 28px 20px 24px; border-radius: 14px; }
`;

const Muted = styled.p`
  margin: 0;
  font-size: 13px;
  text-align: left;
  color: var(--text-muted);
`;

/* Name over email, one field a row */
const Fields = styled.div`
  display: grid;
  gap: 14px;
  margin-bottom: 22px;
`;

/* The app's field row (FormField, light theme): sentence-case label above a
   48px filled --bg-sunken box with a faint --border-field outline */
const Field = styled.label`
  display: flex;
  flex-direction: column;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  /* The placeholder names the box on screen; the label stays for screen readers (visually hidden) */
  > span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  input {
    height: 48px;
    padding: 0 16px;
    border: 1px solid var(--border-card);
    border-radius: 10px;
    background: #ffffff;
    font-family: var(--font-sans);
    font-size: 16px;
    font-weight: 400;
    color: var(--text-primary);
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }
  /* Inputs opt out of the app's flat-field rule (data-underline) */
  && input:focus { outline: 1px solid var(--color-accent-line); outline-offset: -1px; }
  input::placeholder { color: var(--text-muted); }
`;

/* The two checkboxes, inset a little from the fields' edges on both sides */
const Checks = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 26px;
  .ch-check { align-items: flex-start; }
  .ch-check__box { margin-top: 2px; }
  .ch-check__label { font-size: 14px; line-height: 1.45; color: var(--text-primary); }
`;

const Submit = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  text-align: center;
`;

/* The submit: a full-width round teal pill in tracked capitals (the mockup; dark charcoal before) */
const SUBMIT = '#34a5a2';
const SUBMIT_HOVER = '#2c8c8a';
const SubmitButton = styled.button`
  width: 100%;
  height: 50px;
  border: none;
  border-radius: 999px;
  background: ${SUBMIT};
  color: #ffffff;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 150ms;
  &:hover:not(:disabled) { background: ${SUBMIT_HOVER}; }
  &:focus-visible { outline: 2px solid ${SUBMIT}; outline-offset: 3px; }
  &:disabled { opacity: 0.6; cursor: default; }
`;

const ErrorText = styled.p`
  margin: 14px 0 0;
  font-size: 14px;
  color: var(--color-danger);
`;

const Done = styled.div`
  padding: 20px;
  border-left: 2px solid var(--color-accent);
  background: var(--color-accent-subtle);
  && h3 { margin: 0 0 6px; font-family: var(--font-display); font-size: 20px; font-weight: 300; color: var(--text-primary); }
  p { margin: 0; font-size: 14px; line-height: 1.6; }
  p + p { margin-top: 10px; }
  &:focus { outline: none; }
`;

/* Off-screen, not display:none — some bots skip hidden inputs */
const Honeypot = styled.input`
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
`;

const messageOf = (err: unknown) => (err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.');

/** `head`: what sits over the form in the card (the heading, a line and the points) */
export function BetaSignup({ head }: { head?: ReactNode } = {}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [adult, setAdult] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [trap, setTrap] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // The error under the form names what went wrong: the fields and boxes point at it while it shows
  const errorId = useId();
  const describedBy = error ? errorId : undefined;
  const boxesMissing = error !== '' && (!adult || !understood);

  // The thank-you replaces the form: move focus to it so keyboard and screen reader users land on it
  const doneRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (done) doneRef.current?.focus(); }, [done]);

  const apply = async (e: FormEvent) => {
    e.preventDefault();
    if (!adult || !understood) { setError('Tick both boxes to apply.'); return; }
    setSending(true);
    setError('');
    try {
      await beta.apply({ name: name.trim(), email: email.trim(), ...(trap ? { website: trap } : {}) });
      setDone(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSending(false);
    }
  };

  return (
      <BetaCard id="apply">
        {head}

        {done ? (
          <Done role="status" ref={doneRef} tabIndex={-1}>
            <h3>Thank you for requesting early access to Chronicles.</h3>
            <p>
              Your request has been received and added to our beta list. Please keep an eye on your inbox, and once your
              access is ready, you will receive a welcome email containing a secure link to set up your account.
            </p>
            <p>We look forward to hearing your feedback.</p>
          </Done>
        ) : (
          <form onSubmit={apply}>
            <Fields>
              <Field><span>Name</span><input placeholder="Name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={100} required data-underline aria-describedby={describedBy} /></Field>
              <Field><span>Email</span><input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" maxLength={254} required data-underline aria-describedby={describedBy} /></Field>
            </Fields>
            <Honeypot aria-hidden tabIndex={-1} autoComplete="off" name="website" value={trap} onChange={e => setTrap(e.target.value)} />
            <Checks>
              <Checkbox label="I’m 18 or older" checked={adult} onChange={e => setAdult(e.target.checked)}
                aria-describedby={describedBy} aria-invalid={boxesMissing && !adult ? true : undefined} />
              <Checkbox
                label="I understand Chronicles is still in development, things may break, and I’m responsible for keeping my recovery key safe"
                checked={understood}
                onChange={e => setUnderstood(e.target.checked)}
                aria-describedby={describedBy}
                aria-invalid={boxesMissing && !understood ? true : undefined}
              />
            </Checks>
            <Submit>
              <SubmitButton type="submit" disabled={sending}>{sending ? 'Sending…' : 'Request a beta seat'}</SubmitButton>
              <Muted>For adults 18 and older. When seats fill, you’ll join the waitlist.</Muted>
            </Submit>
            {error && <ErrorText id={errorId} role="alert">{error}</ErrorText>}
          </form>
        )}
      </BetaCard>
  );
}
