import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { SettingsRow } from '../molecules/SettingsCard.js';
import { ActionButton, RowLink } from '../atoms/SettingsAtoms.js';
import { Spinner } from '../atoms/Spinner.js';
import { usePublicShelfStore } from '../../stores/publicShelfStore.js';
import { disablePublicShelf, enablePublicShelf, renamePublicShelf, resetPublicShelfLink } from '../../hooks/usePublicShelfSync.js';
import { publicShelfUrl } from '../../services/publicShelf.js';
import { showFlash } from '../../services/flashNotice.js';
import { copyText } from '../../utils/clipboard.js';
import { PUBLIC_SHELF_PRIVACY_LINE } from './PublicShelfControl.js';
import { PUBLIC_SHELF_TITLE_MAX } from '@shared/validation/schemas';

/* Settings → Data: the public shelf's state and count, its title (saved on
   blur / Enter), Copy link, Reset link and Turn off (both ask twice). Always
   shown, so a shelf can be switched off even with the Media feature off. */

const Inside = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-muted);
`;

const TitleRow = styled.label`
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 14px;
  input { max-width: 320px; }
`;

const Links = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 18px;
`;

const Danger = styled(RowLink)`
  color: var(--color-danger);
`;

export function PublicShelfSettingsRow() {
  const shelf = usePublicShelfStore(s => s.publicShelf);
  const loaded = usePublicShelfStore(s => s.loaded);
  const enabledHere = usePublicShelfStore(s => s.enabledHere);
  const title = usePublicShelfStore(s => s.title);
  const [draft, setDraft] = useState(title);
  const [armed, setArmed] = useState<'reset' | 'off' | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setDraft(title); }, [title]);

  const turnOff = async () => {
    if (armed !== 'off') { setArmed('off'); return; }
    setArmed(null); setBusy(true);
    try { await disablePublicShelf(); } catch { showFlash('Couldn’t turn off your public shelf. Try again.'); } finally { setBusy(false); }
  };
  const reset = async () => {
    if (armed !== 'reset') { setArmed('reset'); return; }
    setArmed(null); setBusy(true);
    try { await resetPublicShelfLink(); showFlash('New link made — the old one no longer works.'); } catch { showFlash('Couldn’t reset the link. Try again.'); } finally { setBusy(false); }
  };
  // A shelf turned on elsewhere: this browser publishes only once it's turned on here too
  const turnOnHere = async () => {
    setBusy(true);
    try { await enablePublicShelf(draft); } catch { showFlash('Couldn’t turn on your public shelf. Try again.'); } finally { setBusy(false); }
  };
  const copy = async () => {
    if (!shelf) return;
    if (await copyText(publicShelfUrl(shelf.token))) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
    else showFlash('Couldn’t copy the link.');
  };

  const description = !loaded ? 'Checking…'
    : shelf && !enabledHere ? `On, but not updated from this browser. Turn it on here to publish the changes you make here. ${PUBLIC_SHELF_PRIVACY_LINE}`
    : shelf ? `On — ${shelf.itemCount} ${shelf.itemCount === 1 ? 'item' : 'items'}. ${PUBLIC_SHELF_PRIVACY_LINE}`
    : 'Off. Bookmark an item on the Media Journal to start one.';

  return (
    <SettingsRow
      title="Public shelf"
      description={description}
      action={shelf ? (
        <ActionButton onClick={turnOff} disabled={busy} onBlur={() => setArmed(a => (a === 'off' ? null : a))}>
          {busy ? <Spinner size={14} /> : armed === 'off' ? 'Turn off?' : 'Turn off'}
        </ActionButton>
      ) : undefined}
    >
      {shelf && (
        <Inside>
          <TitleRow>
            Title
            <input value={draft} maxLength={PUBLIC_SHELF_TITLE_MAX} aria-label="Public shelf title"
              onChange={e => setDraft(e.target.value)}
              onBlur={() => renamePublicShelf(draft)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); renamePublicShelf(draft); } }} />
          </TitleRow>
          <Links>
            {!enabledHere && <RowLink type="button" onClick={turnOnHere} disabled={busy}>Turn on here</RowLink>}
            <RowLink type="button" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</RowLink>
            <RowLink type="button" onClick={reset} disabled={busy} onBlur={() => setArmed(a => (a === 'reset' ? null : a))}>
              {armed === 'reset' ? 'Reset? The old link stops working' : 'Reset link'}
            </RowLink>
            <Danger as="a" href={publicShelfUrl(shelf.token)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent-link)' }}>Open</Danger>
          </Links>
        </Inside>
      )}
    </SettingsRow>
  );
}
