import { useEffect, useState, type ReactNode } from 'react';
import styled from 'styled-components';
import { AuthTemplate } from '../templates/AuthTemplate.js';
import { Button } from '../atoms/Button.js';
import { Spinner } from '../atoms/Spinner.js';
import { ConsentCard, EMPTY_CONSENT, consentComplete, type ConsentValue } from '../molecules/ConsentCard.js';
import { useConsentStore, consentIsCurrent, consentNeeded } from '../../stores/consentStore.js';
import { useSignOut } from '../../hooks/useSignOut.js';

/* Before any signed-in page opens, the account must have agreed to the
   current Terms and Health Data Privacy Policy (LEGAL_VERSIONS). Accounts
   from before consent existed see the full card once; after a policy change,
   only the changed items. If the check can't load (offline), the app opens and
   asks next time rather than locking someone out of their own journal. */

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ErrorText = styled.p`
  margin: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--color-danger, #c0392b);
`;

const SignOut = styled.button`
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  color: var(--color-accent-link, var(--color-accent));
  cursor: pointer;
  &:hover { text-decoration: underline; }
`;

const Center = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
`;

export function ConsentGate({ accountKey, children }: { accountKey: string; children: ReactNode }) {
  const status = useConsentStore(s => s.status);
  const loadError = useConsentStore(s => s.loadError);
  const load = useConsentStore(s => s.load);
  const agree = useConsentStore(s => s.agree);
  const signOut = useSignOut();
  const [value, setValue] = useState<ConsentValue>(EMPTY_CONSENT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load (again) for each signed-in account
  useEffect(() => { useConsentStore.getState().reset(); void load(); }, [accountKey, load]);

  if (loadError) return <>{children}</>;
  if (!status) return <Center><Spinner size={40} /></Center>;
  if (consentIsCurrent(status)) return <>{children}</>;

  const firstTime = !status.consent || !!status.consent.healthConsentWithdrawnAt;
  const need = consentNeeded(status);
  const show = firstTime
    ? { age: true, terms: true, health: true, notice: true }
    : { age: need.age, terms: need.terms, health: need.health, notice: false };

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const breachNotice = firstTime ? value.breachNotice : status.consent!.breachNotice;
      const postalAddress = firstTime ? value.postalAddress.trim() : (status.consent!.postalAddress ?? '');
      await agree({
        termsVersion: status.current.terms,
        healthVersion: status.current.health,
        breachNotice,
        ...(breachNotice === 'mail' ? { postalAddress } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t save — try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthTemplate
      title={firstTime ? 'Before you continue' : 'We’ve updated our terms'}
      footer={<SignOut type="button" onClick={() => { void signOut(); }}>Sign out</SignOut>}
    >
      <Wrap>
        <ConsentCard value={value} onChange={setValue} show={show}
          title={firstTime ? 'Before you start' : 'Please review what changed'} />
        {error && <ErrorText role="alert">{error}</ErrorText>}
        <Button type="button" fullWidth variant="secondary" disabled={saving || !consentComplete(value, show)} onClick={() => void submit()}>
          {saving ? <Spinner size={18} /> : 'Continue'}
        </Button>
      </Wrap>
    </AuthTemplate>
  );
}
