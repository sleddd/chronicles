import { useCallback, useState } from 'react';
import styled from 'styled-components';
import { SettingsActionRow, RowPill, RowNote, QuietLink } from '../molecules/SettingsGroup.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { loadChanges, restoreChange, dismissChange, clearChanges, HideNotKept, type ShownChange } from '../../services/assistantChanges.js';
import { showFlash } from '../../services/flashNotice.js';

/**
 * Settings → In-App AI → Chronicles AI app → "Changes the app made".
 *
 * Chronicles can't see inside an encrypted save, so it can't stop the AI app
 * overwriting something it may change. It keeps the earlier version instead
 * (14 days), and this is where one is put back. Putting one back swaps: what
 * is there now takes its place in the list, so it can be undone the same way.
 */

const List = styled.div`
  border-top: 1px solid var(--border-subtle);
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-subtle);
  @media (max-width: 560px) { flex-wrap: wrap; }
`;

const RowText = styled.div`
  flex: 1;
  min-width: 0;
  font-family: var(--font-sans);
`;

const RowTitle = styled.div`
  font-size: 15px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RowWhat = styled.span`
  color: var(--text-muted);
`;

const RowWhen = styled.div`
  margin-top: 2px;
  font-size: 13px;
  color: var(--text-muted);
`;

const Foot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
`;

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function AssistantChanges() {
  const { decryptPosts, encryptPost } = useEncryption();
  const [open, setOpen] = useState(false);
  const [changes, setChanges] = useState<ShownChange[] | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Asked once more before anything is written: the id of the row, or 'all'
  const [confirming, setConfirming] = useState<number | 'all' | null>(null);
  // The same for Remove on one row: it throws away the only copy from before the app's change
  const [removing, setRemoving] = useState<number | null>(null);

  const load = useCallback(async (before?: number) => {
    setBusy(true); setError('');
    try {
      const page = await loadChanges(decryptPosts, before);
      setChanges(prev => (before && prev ? [...prev, ...page.changes] : page.changes));
      setMore(page.more);
    } catch {
      setError('The list didn’t load. Try again.');
    } finally {
      setBusy(false);
    }
  }, [decryptPosts]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    setConfirming(null);
    if (next) void load();
  };

  const restore = async (change: ShownChange) => {
    if (confirming !== change.id) { setConfirming(change.id); return; }
    setConfirming(null); setBusy(true); setError('');
    try {
      await restoreChange(change, decryptPosts, encryptPost);
      showFlash(`Put back${change.name ? ` “${change.name}”` : ''}. The version it replaced is in this list now.`);
      await load();
    } catch (err) {
      // The version did go back, so the list has changed (loading it clears the note: it is set after)
      if (err instanceof HideNotKept) await load();
      setError(err instanceof Error && err.message ? err.message : 'That didn’t work. Try again.');
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (removing !== id) { setRemoving(id); return; }
    setRemoving(null); setBusy(true); setError('');
    try {
      await dismissChange(id);
      setChanges(prev => prev?.filter(c => c.id !== id) ?? null);
    } catch {
      setError('That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const removeAll = async () => {
    if (confirming !== 'all') { setConfirming('all'); return; }
    setConfirming(null); setBusy(true); setError('');
    try {
      await clearChanges();
      setChanges([]); setMore(false);
    } catch {
      setError('That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsActionRow
      title="Changes the app made"
      description="Previous versions of entries, doses, bills, and habit check-ins changed by the app are saved for 14 days and can be restored here."
      action={<RowPill type="button" onClick={toggle} aria-expanded={open}>{open ? 'Hide' : 'View'}</RowPill>}
    >
      {open && (
        <>
          {error && <RowNote $error role="alert">{error}</RowNote>}
          {changes === null && !error && <RowNote>Loading…</RowNote>}
          {changes && changes.length === 0 && <RowNote>Nothing has been changed by the app in the last 14 days.</RowNote>}
          {changes && changes.length > 0 && (
            <List>
              {changes.map(c => (
                <Row key={c.id}>
                  <RowText>
                    <RowTitle title={c.name || c.what}>
                      <RowWhat>{c.what}{c.name ? ' · ' : ''}</RowWhat>{c.name}
                    </RowTitle>
                    <RowWhen>
                      {c.canRestore ? `As it was before ${when(c.savedAt)}` : `From ${when(c.savedAt)}. It can’t be opened in this browser, so it can’t be put back.`}
                    </RowWhen>
                  </RowText>
                  {c.canRestore && (
                    <RowPill type="button" $tone="accent" disabled={busy} onClick={() => { void restore(c); }}
                      onBlur={() => setConfirming(v => (v === c.id ? null : v))}>
                      {confirming === c.id ? 'Put it back?' : 'Restore'}
                    </RowPill>
                  )}
                  <QuietLink type="button" disabled={busy} onClick={() => { void remove(c.id); }}
                    onBlur={() => setRemoving(v => (v === c.id ? null : v))}
                    aria-label={removing === c.id ? `Remove this version of ${c.name || c.what} for good?` : `Remove this version of ${c.name || c.what} from the list`}>
                    {removing === c.id ? 'Remove for good?' : 'Remove'}
                  </QuietLink>
                </Row>
              ))}
            </List>
          )}
          {changes && changes.length > 0 && (
            <Foot>
              {more
                ? <RowPill type="button" disabled={busy} onClick={() => { void load(changes[changes.length - 1].id); }}>Show more</RowPill>
                : <span />}
              <QuietLink type="button" $danger disabled={busy} onClick={() => { void removeAll(); }}
                onBlur={() => setConfirming(v => (v === 'all' ? null : v))}>
                {confirming === 'all' ? 'Remove every kept version?' : 'Remove all'}
              </QuietLink>
            </Foot>
          )}
        </>
      )}
    </SettingsActionRow>
  );
}
