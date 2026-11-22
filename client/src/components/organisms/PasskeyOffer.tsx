import { useState } from 'react';
import styled from 'styled-components';
import { useAddPasskey, usePasskeyAddConfirmation } from '../../hooks/useAddPasskey.js';
import { PasskeyCancelled, suggestedPasskeyName } from '../../services/passkeys.js';
import { PASSKEY_LASTPASS_NOTE } from '../../utils/passkeyProblem.js';
import { Button } from '../atoms/Button.js';
import { Spinner } from '../atoms/Spinner.js';
import { ErrorBanner } from '../atoms/ErrorBanner.js';

/*
 * The last step of creating an account, where the browser can do it: add a
 * passkey, so signing in from then on is one touch (fingerprint, face or the
 * device PIN) with no password to type. Optional — "Not now" goes straight to
 * the app, and Settings → Security → Passkeys adds one later.
 *
 * The password just chosen confirms it (the account is seconds old and has no
 * 2FA yet), so nothing is asked for again.
 */

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Text = styled.p`
  margin: 0;
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.55;
  color: var(--text-secondary);
`;

const Quiet = styled.p`
  margin: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-muted);
`;

interface PasskeyOfferProps {
  email: string;
  /** The password just chosen: read once, when Add is pressed */
  password: () => string;
  /** Added, or skipped: on to the app */
  onDone: () => void;
}

export function PasskeyOffer({ email, password, onDone }: PasskeyOfferProps) {
  const confirmation = usePasskeyAddConfirmation();
  const addPasskey = useAddPasskey();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [secondTouch, setSecondTouch] = useState(false);

  const add = async () => {
    setError('');
    setBusy(true);
    try {
      const source = await confirmation.confirm(password(), email);
      await addPasskey(source, source.confirmToken, suggestedPasskeyName(), () => setSecondTouch(true));
      onDone();
    } catch (err) {
      confirmation.failed(err);
      // Closing the sheet is not an error: the offer stays, with Not now beside it
      if (!(err instanceof PasskeyCancelled)) setError(err instanceof Error && err.message ? err.message : 'Couldn’t add the passkey. You can add one later in Settings.');
      setBusy(false);
      setSecondTouch(false);
    }
  };

  return (
    <Wrap>
      <Text>
        Add a passkey and you can sign in with your fingerprint, face or device PIN. There is no password to type, and it opens your journal in one touch.
      </Text>
      <Quiet>Your device will ask to confirm it’s you, sometimes twice. Your password and recovery key keep working.</Quiet>
      <Quiet>Save it to this device (Touch ID, Windows Hello) or your phone.</Quiet>
      <Quiet><strong>{PASSKEY_LASTPASS_NOTE}</strong></Quiet>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {secondTouch && <Quiet role="status">One more touch to finish. Choose the same passkey again, in the same place you just saved it.</Quiet>}
      <Button type="button" fullWidth variant="secondary" disabled={busy} onClick={() => void add()}>
        {busy ? <Spinner size={18} /> : 'Add a passkey'}
      </Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={onDone}>Not now</Button>
      <Quiet>You can add one any time in Settings, under Security.</Quiet>
    </Wrap>
  );
}
