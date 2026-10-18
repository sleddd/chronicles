import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { FormField } from '../molecules/FormField.js';
import { ActionButton, OutlinedSection } from '../atoms/SettingsAtoms.js';
import { Spinner } from '../atoms/Spinner.js';
import { useConsentStore } from '../../stores/consentStore.js';

/* Settings → Account: how a security-incident notice reaches you — email, or a
   mailed letter (the postal address is stored readable, only for that). */

const Radios = styled.div`
  display: flex;
  gap: 18px;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-secondary);
  label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  input { accent-color: var(--color-accent); }
`;

const Address = styled.textarea`
  width: 100%;
  min-height: 72px;
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-primary);
  resize: vertical;
  &:focus { outline: none; border-color: var(--color-accent); }
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
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
  const changed = choice !== saved.breachNotice || (choice === 'mail' && address.trim() !== (saved.postalAddress ?? ''));
  const valid = choice === 'email' || address.trim().length >= 8;

  const submit = async () => {
    setState('saving'); setError('');
    try { await save(choice, choice === 'mail' ? address.trim() : undefined); setState('saved'); }
    catch (err) { setError(err instanceof Error ? err.message : 'That didn’t save'); setState('error'); }
  };

  return (
    <OutlinedSection>
    <FormField label="Security notices">
      <Radios role="radiogroup" aria-label="Send security incident notices by">
        <label><input type="radio" name="settings-breach-notice" checked={choice === 'email'} onChange={() => { setChoice('email'); setState('idle'); }} /> Email</label>
        <label><input type="radio" name="settings-breach-notice" checked={choice === 'mail'} onChange={() => { setChoice('mail'); setState('idle'); }} /> Mailed letter</label>
      </Radios>
      {choice === 'mail' && (
        <Address aria-label="Postal address for mailed notices" placeholder="Postal address" value={address} maxLength={500}
          onChange={e => { setAddress(e.target.value); setState('idle'); }} />
      )}
      <Row>
        <span>{state === 'saved' ? 'Saved' : state === 'error' ? error : choice === 'mail' ? 'Stored readable on our server, only to mail you a notice.' : 'Sent to your account email.'}</span>
        {changed && (
          <ActionButton onClick={() => void submit()} disabled={!valid || state === 'saving'}>
            {state === 'saving' ? <Spinner size={14} /> : 'Save'}
          </ActionButton>
        )}
      </Row>
    </FormField>
    </OutlinedSection>
  );
}
