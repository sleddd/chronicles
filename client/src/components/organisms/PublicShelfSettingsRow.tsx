import { useState } from 'react';
import { SettingsRow } from '../molecules/SettingsCard.js';
import { ActionButton, RowLink } from '../atoms/SettingsAtoms.js';
import { Spinner } from '../atoms/Spinner.js';
import { usePublicShelfStore } from '../../stores/publicShelfStore.js';
import { disablePublicShelf } from '../../hooks/usePublicShelfSync.js';
import { publicShelfUrl } from '../../services/publicShelf.js';
import { showFlash } from '../../services/flashNotice.js';

/* Settings → Data: whether the public shelf is on, how many items it holds,
   Copy link, and Turn off (second click confirms). Always shown, so a shelf
   can be switched off even with the Media feature off. */

export function PublicShelfSettingsRow() {
  const shelf = usePublicShelfStore(s => s.publicShelf);
  const loaded = usePublicShelfStore(s => s.loaded);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const turnOff = async () => {
    if (!armed) { setArmed(true); return; }
    setArmed(false); setBusy(true);
    try { await disablePublicShelf(); } catch { showFlash('Couldn’t turn off your public shelf. Try again.'); } finally { setBusy(false); }
  };
  const copy = async () => {
    if (!shelf) return;
    try { await navigator.clipboard.writeText(publicShelfUrl(shelf.token)); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { showFlash('Couldn’t copy the link.'); }
  };

  const description = !loaded ? 'Checking…'
    : shelf ? `On — ${shelf.itemCount} ${shelf.itemCount === 1 ? 'item' : 'items'}. Anyone with the link can see the covers, titles, makers, years, ratings and shelves of the media items you bookmarked for it. Notes and progress stay private.`
    : 'Off. Bookmark an item on the Media Journal to start one.';

  return (
    <SettingsRow
      title="Public shelf"
      description={description}
      action={shelf ? (
        <ActionButton onClick={turnOff} disabled={busy} onBlur={() => setArmed(false)}>
          {busy ? <Spinner size={14} /> : armed ? 'Turn off?' : 'Turn off'}
        </ActionButton>
      ) : undefined}
    >
      {shelf && <div><RowLink type="button" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</RowLink></div>}
    </SettingsRow>
  );
}
