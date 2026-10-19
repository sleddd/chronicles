import { useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { Checkbox } from '../../atoms/core/Checkbox.jsx';
import { beta } from '../../../services/api.js';

/* The landing page's "Sign up to try" form in a white card. An
   application takes a beta seat while one is open (the server decides, in
   arrival order) and otherwise goes on the waitlist automatically. Everyone
   sees the same thank-you, so the page never shows whether seats are left. A hidden honeypot field catches bots. */

export const TRACK_OPTIONS = [
  { value: 'journal', label: 'Daily journal' },
  { value: 'health', label: 'Health and wellness' },
  { value: 'planning', label: 'Goals and tasks' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'kitchen', label: 'Meals and recipes' },
  { value: 'finance', label: 'Budget and bills' },
  { value: 'everything', label: 'A bit of everything' },
] as const;

export const DEVICE_OPTIONS = [
  { value: 'ios', label: 'iPhone or iPad' },
  { value: 'android', label: 'Android phone or tablet' },
  { value: 'desktop', label: 'Computer' },
  { value: 'mixed', label: 'A mix' },
] as const;

/* A white card with a hairline and a soft shadow around the form */
const BetaCard = styled.div`
  max-width: 680px;
  margin: 8px auto 0;
  padding: 40px 40px 36px;
  border: 1px solid #e3e5e8;
  border-radius: 20px;
  background: #ffffff;
  box-shadow: 0 2px 6px rgba(20, 24, 32, 0.04), 0 22px 54px rgba(20, 24, 32, 0.08);
  @media (max-width: 600px) { padding: 26px 20px 24px; border-radius: 16px; }
`;

const Muted = styled.p`
  margin: 0;
  font-size: 14px;
  color: var(--text-muted);
`;

/* Two fields a row (one on phones) */
const Fields = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px 20px;
  margin-bottom: 24px;
  @media (max-width: 600px) { grid-template-columns: minmax(0, 1fr); gap: 18px; }
`;

/* The app's field row (FormField, light theme): sentence-case label above a
   48px filled box with a faint --border-field outline and 6px corners */
const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  input, select {
    height: 52px;
    padding: 0 16px;
    border: 1px solid var(--border-field);
    border-radius: 10px;
    background: #ffffff;
    font-family: var(--font-sans);
    font-size: 16px;
    font-weight: 400;
    color: #1f2128;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }
  /* The app's select chevron (filledInputs), not the browser's arrow; the
     outline is forced back on (GlobalStyle strips borders from selects) */
  && select { border: 1px solid var(--border-field) !important; }
  select {
    appearance: none;
    padding-right: 40px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23575d68' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 16px center;
    cursor: pointer;
  }
  /* Inputs opt out of the app's flat-field rule (data-underline); selects
     can't, so focus is an outline on both */
  && input:focus, && select:focus { outline: 1px solid var(--color-accent); outline-offset: -1px; }
  input::placeholder { color: #8a9099; }
`;

/* The two checkboxes, inset a little from the fields' edges on both sides */
const Checks = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
  padding: 0 16px;
  @media (max-width: 600px) { padding: 0 8px; }
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

/* The submit: full width, filled deep teal, softly rounded */
const SubmitButton = styled.button`
  width: 100%;
  height: 54px;
  border: none;
  border-radius: 10px;
  background: var(--color-accent-line);
  color: #ffffff;
  font-family: var(--font-sans);
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms;
  &:hover:not(:disabled) { background: var(--color-accent-hover); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; }
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
  h4 { margin: 0 0 6px; font-family: var(--font-display); font-size: 20px; font-weight: 300; color: var(--text-primary); }
  p { margin: 0; font-size: 14px; }
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

export function BetaSignup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [trackFirst, setTrackFirst] = useState<string>(TRACK_OPTIONS[0].value);
  const [device, setDevice] = useState<string>(DEVICE_OPTIONS[0].value);
  const [adult, setAdult] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [trap, setTrap] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);


  const apply = async (e: FormEvent) => {
    e.preventDefault();
    if (!adult || !understood) { setError('Tick both boxes to apply.'); return; }
    setSending(true);
    setError('');
    try {
      await beta.apply({ name: name.trim(), email: email.trim(), trackFirst, device, ...(trap ? { website: trap } : {}) });
      setDone(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSending(false);
    }
  };


  return (
      <BetaCard id="apply">


        {done ? (
          <Done role="status">
            <h4>Thank you for signing up to test Chronicles.</h4>
            <p>We can’t wait to hear what you think, and we’ll reach out by email.</p>
          </Done>
        ) : (
          <form onSubmit={apply}>
            <Fields>
              <Field>Name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={100} required placeholder="Ada Lovelace" data-underline /></Field>
              <Field>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" maxLength={254} required placeholder="you@example.com" data-underline /></Field>
              <Field>What would you track first?
                <select value={trackFirst} onChange={e => setTrackFirst(e.target.value)}>
                  {TRACK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field>Device you’ll use most
                <select value={device} onChange={e => setDevice(e.target.value)}>
                  {DEVICE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </Fields>
            <Honeypot aria-hidden tabIndex={-1} autoComplete="off" name="website" value={trap} onChange={e => setTrap(e.target.value)} />
            <Checks>
              <Checkbox label="I’m 18 or older" checked={adult} onChange={e => setAdult(e.target.checked)} />
              <Checkbox
                label="I understand Chronicles is still in development, things may break, and I’m responsible for keeping my recovery key safe"
                checked={understood}
                onChange={e => setUnderstood(e.target.checked)}
              />
            </Checks>
            <Submit>
              <SubmitButton type="submit" disabled={sending}>{sending ? 'Sending…' : 'Sign Up For Beta'}</SubmitButton>
              <Muted>If the beta is full, your application joins the waitlist.</Muted>
            </Submit>
            {error && <ErrorText role="alert">{error}</ErrorText>}
          </form>
        )}
      </BetaCard>
  );
}
