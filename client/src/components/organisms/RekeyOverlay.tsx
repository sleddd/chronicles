import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { RekeyBucketForm } from './RekeyBucketForm.js';
import { useRekeyStore } from '../../stores/rekeyStore.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useSignOut } from '../../hooks/useSignOut.js';
import { PillButton } from '../atoms/PillButton.js';
import { Spinner } from '../atoms/Spinner.js';
import type { RekeyPhase } from '../../services/rekey.js';

/*
 * While the journal is re-encrypted under a new master key, the app is shut
 * behind this screen: records are moving from one key to the other, and
 * nothing may read or write them half way (EncryptionContext, services/rekey.ts).
 */

const PHASES: Record<RekeyPhase, string> = {
  starting: 'Getting ready',
  photos: 'Photos',
  entries: 'Entries',
  topics: 'Topics',
  doses: 'Medication doses',
  finance: 'Finance records',
  settings: 'Settings',
  cleanup: 'Removing the old copies of your photos',
  done: 'Done',
};

export function RekeyOverlay() {
  const { status, progress, error, errorKind } = useRekeyStore();
  const { retryRekey } = useEncryption();
  const signOut = useSignOut();
  // Photo trouble can be the bucket's settings (a key rotated or revoked part
  // way). Settings can't be reached from here, so they can be corrected in place
  const [fixingBucket, setFixingBucket] = useState(false);
  useEffect(() => { if (status !== 'error') setFixingBucket(false); }, [status]);
  if (status === 'idle') return null;
  const photoTrouble = errorKind === 'photos' || errorKind === 'missing';

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;
  return (
    <Screen role="dialog" aria-modal="true" aria-labelledby="rekey-title">
      <Card>
        <Title id="rekey-title">{status === 'error' ? 'Re-encryption paused' : 'Re-encrypting your journal'}</Title>
        {status === 'error' ? (
          <>
            <Text role="alert">{error}</Text>
            <Text>Your journal is safe. Everything not moved yet still opens with the old key, which Chronicles keeps until the end.</Text>
            {fixingBucket ? (
              <RekeyBucketForm onCancel={() => setFixingBucket(false)} onSaved={() => { setFixingBucket(false); retryRekey(); }} />
            ) : (
              <Actions>
                <PillButton type="button" onClick={() => void signOut()}>Sign out</PillButton>
                {photoTrouble && (
                  <PillButton type="button" onClick={() => setFixingBucket(true)}>Update bucket settings</PillButton>
                )}
                {errorKind === 'missing' && (
                  <PillButton type="button" onClick={() => retryRekey({ allowMissingPhotos: true })}>Finish without them</PillButton>
                )}
                <PillButton type="button" $variant="solid" onClick={() => retryRekey()}>Try again</PillButton>
              </Actions>
            )}
          </>
        ) : status === 'waiting' ? (
          <>
            <Spinner size={28} />
            <Text>Another tab or device may be re-encrypting already. This opens as soon as it’s done, and takes over if that one has stopped.</Text>
          </>
        ) : (
          <>
            <Text>Everything is being locked again with your new key. Keep this tab open. A big journal with photos can take a few minutes, and if it stops, it carries on the next time you sign in.</Text>
            <Phase aria-live="polite">
              <span>{progress ? PHASES[progress.phase] : PHASES.starting}</span>
              {progress && progress.total > 0 && <Muted>{progress.done} of {progress.total}</Muted>}
            </Phase>
            <Track aria-hidden="true"><Fill style={{ width: `${pct ?? 0}%` }} /></Track>
          </>
        )}
      </Card>
    </Screen>
  );
}

const Screen = styled.div`
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background: var(--bg-app);
`;

const Card = styled.div`
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 32px;
  border-radius: 16px;
  background: var(--bg-panel);
  box-shadow: var(--shadow-card);
`;

const Title = styled.h1`
  margin: 0;
  font-family: var(--font-display);
  font-weight: 200;
  font-size: 28px;
  color: var(--text-primary);
`;

const Text = styled.p`
  margin: 0;
  font-size: 15px;
  line-height: 1.55;
  color: var(--text-secondary);
`;

const Phase = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
`;

const Muted = styled.span`
  font-weight: 400;
  color: var(--text-muted);
`;

const Track = styled.div`
  height: 4px;
  border-radius: 2px;
  background: var(--progress-track, var(--border-subtle));
  overflow: hidden;
`;

const Fill = styled.div`
  height: 100%;
  background: var(--color-accent-fill, var(--color-accent));
  transition: width 200ms ease;
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
`;
