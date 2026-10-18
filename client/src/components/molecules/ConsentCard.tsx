import styled from 'styled-components';
import { Checkbox } from '../atoms/core/Checkbox.jsx';
import { LEGAL_DETAILS } from '@shared/legal/index.js';

/* The sign-up / re-consent card (Health Data Compliance Pack, part 7): three
   separate, never pre-checked boxes — 18+, the Terms (risk notice and image
   rules), and health data consent on its own, as Washington law requires —
   plus how to get a breach notice (email, or a mailed letter to a postal
   address). Links open the full text in a new tab so nothing typed is lost.
   When only some items changed, `show` limits the card to those. Props only. */

export interface ConsentValue {
  age: boolean;
  terms: boolean;
  health: boolean;
  breachNotice: 'email' | 'mail';
  postalAddress: string;
}

export const EMPTY_CONSENT: ConsentValue = { age: false, terms: false, health: false, breachNotice: 'email', postalAddress: '' };

/** True when every shown box is ticked (and a postal address is given for mail). */
export function consentComplete(v: ConsentValue, show = { age: true, terms: true, health: true, notice: true }): boolean {
  return (!show.age || v.age) && (!show.terms || v.terms) && (!show.health || v.health)
    && (!show.notice || v.breachNotice === 'email' || v.postalAddress.trim().length >= 8);
}

const Card = styled.fieldset`
  margin: 0;
  padding: 18px 18px 16px;
  border: 1px solid var(--border-card);
  border-radius: var(--r-lg, 6px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-secondary);
  legend {
    padding: 0 6px;
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 300;
    color: var(--text-primary);
  }
  .ch-check { align-items: flex-start; }
  .ch-check__label { line-height: 1.5; }
  a { color: var(--color-accent-link, var(--color-accent)); }
`;

const Intro = styled.p`
  margin: 0;
  color: var(--text-muted);
`;

const Notice = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Radios = styled.div`
  display: flex;
  gap: 18px;
  label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  input { accent-color: var(--color-accent); }
`;

const Address = styled.textarea`
  width: 100%;
  min-height: 72px;
  padding: 10px 12px;
  border: 1px solid var(--border-card);
  border-radius: var(--r-lg, 6px);
  background: transparent;
  font: inherit;
  color: var(--text-primary);
  resize: vertical;
  &:focus { outline: none; border-color: var(--color-accent); }
`;

const SmallNote = styled.p`
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
`;

interface ConsentCardProps {
  value: ConsentValue;
  onChange: (v: ConsentValue) => void;
  /** Which items to ask for (re-consent shows only what changed) */
  show?: { age: boolean; terms: boolean; health: boolean; notice: boolean };
  /** "Before you start" on sign-up; "We've updated our terms" on re-consent */
  title?: string;
}

export function ConsentCard({ value, onChange, show = { age: true, terms: true, health: true, notice: true }, title = 'Before you start' }: ConsentCardProps) {
  const set = (patch: Partial<ConsentValue>) => onChange({ ...value, ...patch });
  return (
    <Card>
      <legend>{title}</legend>
      <Intro>Chronicles keeps your journal and health information encrypted on your own device. Please read and agree to each item below.</Intro>

      {show.age && (
        <Checkbox checked={value.age} onChange={e => set({ age: e.target.checked })} label="I’m 18 or older." />
      )}

      {show.terms && (
        <Checkbox checked={value.terms} onChange={e => set({ terms: e.target.checked })} label={<>
          I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>, including the Risk
          Notice and the image rules. I understand that no app is perfectly secure, and I accept the risks it describes.
        </>} />
      )}

      {show.health && (
        <Checkbox checked={value.health} onChange={e => set({ health: e.target.checked })} label={<>
          I consent to Chronicles collecting the health information I choose to enter, such as medications, allergies,
          symptoms, sleep, mood, cycle and meals, to run the features I use. It is never sold, and it’s shared only as
          the <a href="/health-privacy" target="_blank" rel="noopener noreferrer">Health Data Privacy Policy</a> describes.
          I can withdraw by deleting my account or writing to {LEGAL_DETAILS.contactEmail}.
        </>} />
      )}

      {show.notice && (
        <Notice role="radiogroup" aria-label="If there’s ever a security incident, notify me by">
          <span>If there’s ever a security incident, notify me by:</span>
          <Radios>
            <label><input type="radio" name="breach-notice" checked={value.breachNotice === 'email'} onChange={() => set({ breachNotice: 'email' })} /> Email</label>
            <label><input type="radio" name="breach-notice" checked={value.breachNotice === 'mail'} onChange={() => set({ breachNotice: 'mail' })} /> Mailed letter</label>
          </Radios>
          {value.breachNotice === 'mail' && (
            <>
              <Address aria-label="Postal address for mailed notices" placeholder="Postal address" value={value.postalAddress}
                onChange={e => set({ postalAddress: e.target.value })} maxLength={500} />
              <SmallNote>Your address is stored readable on our server, only to mail you a notice.</SmallNote>
            </>
          )}
        </Notice>
      )}
    </Card>
  );
}
