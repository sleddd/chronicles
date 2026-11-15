import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { SettingsGroupRow, PillChoice, PillChoiceBtn, RowNote } from '../molecules/SettingsGroup.js';
import { useConsentStore } from '../../stores/consentStore.js';

/* Settings → Account → Sign-in and notices: how a security-incident notice
   reaches you — email, or a mailed letter (the postal address is stored
   readable, only for that). Saves as it changes: Email at once, a letter once
   its address is typed and the box is left. */

const Address = styled.textarea`
  display: block;
  width: 100%;
  min-height: 72px;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-primary);
  resize: vertical;
  &:focus { outline: none; border-color: var(--color-accent-line); }
`;

export function BreachNoticeSetting() {
  const status = useConsentStore(s => s.status);
  const load = useConsentStore(s => s.load);
  const save = useConsentStore(s => s.setBreachNotice);
  const saved = status?.consent;
  const [choice, setChoice] = useState<'email' | 'mail'>('email');
  const [address, setAddress] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => { if (!status) void load(); }, [status, load]);
  useEffect(() => {
    if (saved) { setChoice(saved.breachNotice); setAddress(saved.postalAddress ?? ''); }
  }, [saved]);

  if (!saved) return null;

  const submit = async (to: 'email' | 'mail', addr: string) => {
    if (to === saved.breachNotice && (to === 'email' || addr === (saved.postalAddress ?? ''))) return;
    if (to === 'mail' && addr.length < 8) return;
    setState('saving'); setError('');
    try { await save(to, to === 'mail' ? addr : undefined); setState('saved'); }
    catch (err) { setError(err instanceof Error ? err.message : 'That didn’t save'); setState('error'); }
  };

  const pick = (to: 'email' | 'mail') => {
    setChoice(to); setState('idle');
    void submit(to, address.trim());
  };

  const note = state === 'saving' ? 'Saving…'
    : state === 'error' ? error
    : choice === 'mail'
      ? (address.trim().length < 8 ? 'Add the address to mail a notice to.' : 'Stored readable on our server, only to mail you a notice.')
      : 'Sent to your account email.';

  return (
    <SettingsGroupRow label="Security notices" labelId="settings-breach-notice">
      <PillChoice role="radiogroup" aria-labelledby="settings-breach-notice">
        <PillChoiceBtn type="button" role="radio" aria-checked={choice === 'email'} $active={choice === 'email'} onClick={() => pick('email')}>Email</PillChoiceBtn>
        <PillChoiceBtn type="button" role="radio" aria-checked={choice === 'mail'} $active={choice === 'mail'} onClick={() => pick('mail')}>Mailed letter</PillChoiceBtn>
      </PillChoice>
      {choice === 'mail' && (
        <Address aria-label="Postal address for mailed notices" placeholder="Postal address" value={address} maxLength={500}
          onChange={e => { setAddress(e.target.value); setState('idle'); }}
          onBlur={() => void submit('mail', address.trim())} />
      )}
      <RowNote $error={state === 'error'} role="status">{note}</RowNote>
    </SettingsGroupRow>
  );
}
