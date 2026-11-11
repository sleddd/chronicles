import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { PillButton } from '../atoms/PillButton.js';
import { PickPill } from '../molecules/FilterPick.js';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';
import { usePublicShelfStore } from '../../stores/publicShelfStore.js';
import { enablePublicShelf, disablePublicShelf, resetPublicShelfLink, renamePublicShelf } from '../../hooks/usePublicShelfSync.js';
import { publicShelfUrl } from '../../services/publicShelf.js';
import { showFlash } from '../../services/flashNotice.js';
import { copyText } from '../../utils/clipboard.js';
import type { MediaItem } from '../../utils/media.js';
import { PUBLIC_SHELF_TITLE_MAX } from '@shared/validation/schemas';

/* The Media Journal's public shelf: a pill in the tool row ("Public shelf ·
   4") opening a small floating panel — the first time, "Put X on your public
   shelf?" with what that means and Turn on / Not now; once on, the title, the
   link (Copy, Open), Reset link and Turn off (second click confirms) and a
   line on how the last publish went. Nothing is published until Turn on. */

const PRIVACY_LINE = 'Anyone with the link can see the covers, titles, makers, years, ratings and shelves of bookmarked items. Notes and progress stay private. The public shelf is stored readable on the server, like a shared entry.';

const Pill = styled(PickPill).attrs({ as: 'button' })`
  gap: 8px;
  cursor: pointer;
  & > span:first-of-type { display: inline-flex; color: var(--text-muted); }
`;

const Panel = styled.div`
  position: fixed;
  z-index: 1200;
  width: min(380px, calc(100vw - 24px));
  max-height: min(600px, calc(100vh - 96px));
  overflow-y: auto;
  padding: 18px 20px 18px;
  background: var(--bg-tile);
  border: 1px solid var(--border-pop);
  border-radius: 14px;
  box-shadow: var(--shadow-xl);
  font-family: var(--font-sans);
  color: var(--text-secondary);
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  h2 { margin: 0; font-size: 15px; font-weight: 400; color: var(--text-muted); }
`;

const CloseBtn = styled.button`
  display: inline-flex;
  padding: 4px;
  margin-right: -4px;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 4px; }
`;

const Ask = styled.p`
  margin: 0 0 10px;
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 300;
  line-height: 1.3;
  color: var(--text-primary);
  em { font-style: italic; }
`;

const Note = styled.p`
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
`;

const Label = styled.label`
  display: block;
  margin: 12px 0 6px;
  font-size: 12px;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: var(--text-muted);
`;

const Field = styled.input`
  && {
    width: 100%;
    height: 44px;
    padding: 0 14px;
    border-radius: var(--r-lg);
    background: var(--bg-sunken) !important;
    border: 1px solid var(--border-field) !important;
    font-family: var(--font-sans);
    font-size: 15px;
    color: var(--text-primary);
    outline: none;
  }
  &&:focus { border-color: var(--color-accent) !important; }
`;

const LinkRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 4px 0 14px;
  border-radius: var(--r-lg);
  background: var(--bg-sunken);
  border: 1px solid var(--border-field);
  code {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-sans);
    font-size: 13px;
    color: var(--text-secondary);
  }
`;

const Quiet = styled.button<{ $danger?: boolean }>`
  padding: 6px 8px;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  color: ${({ $danger }) => ($danger ? 'var(--color-danger)' : 'var(--color-accent-link)')};
  cursor: pointer;
  white-space: nowrap;
  &:hover { text-decoration: underline; }
  &:disabled { opacity: 0.5; cursor: wait; text-decoration: none; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 4px; }
`;

const QuietLink = styled.a`
  padding: 6px 8px;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-accent-link);
  text-decoration: none;
  white-space: nowrap;
  &:hover { text-decoration: underline; }
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin-top: 12px;
`;

const Status = styled.p`
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--text-muted);
`;

interface PublicShelfControlProps {
  /** How many items carry the bookmark */
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The item whose bookmark opened the panel before the shelf existed */
  pendingItem: MediaItem | null;
  /** Called after Turn on with the pending item, so the caller flags it */
  onTurnedOn: (item: MediaItem | null) => void;
}

export function PublicShelfControl({ count, open, onOpenChange, pendingItem, onTurnedOn }: PublicShelfControlProps) {
  const shelf = usePublicShelfStore(s => s.publicShelf);
  const loaded = usePublicShelfStore(s => s.loaded);
  const title = usePublicShelfStore(s => s.title);
  const status = usePublicShelfStore(s => s.status);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [draft, setDraft] = useState(title);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [armed, setArmed] = useState<'reset' | 'off' | null>(null);
  useEffect(() => { setDraft(title); }, [title]);
  // A stable close for the focus trap: a fresh function each render would re-arm the trap and move focus
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useFocusTrap(panelRef, open && !!pos, close);

  // Place the panel under the pill (kept on screen)
  useEffect(() => {
    if (!open) { setPos(null); setArmed(null); return; }
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(380, window.innerWidth - 24);
      setPos({ left: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)), top: r.bottom + 8 });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !btnRef.current?.contains(t)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { onOpenChange(false); btnRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, onOpenChange]);

  const url = shelf ? publicShelfUrl(shelf.token) : '';

  const turnOn = async () => {
    setBusy(true);
    try {
      await enablePublicShelf(draft);
      onTurnedOn(pendingItem);
    } catch (err) {
      showFlash(err instanceof Error && /too big/i.test(err.message) ? err.message : 'Couldn’t turn on your public shelf. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
    else showFlash('Couldn’t copy the link — select it and copy by hand.');
  };

  const reset = async () => {
    if (armed !== 'reset') { setArmed('reset'); return; }
    setArmed(null); setBusy(true);
    try { await resetPublicShelfLink(); } catch { showFlash('Couldn’t reset the link. Try again.'); } finally { setBusy(false); }
  };

  const turnOff = async () => {
    if (armed !== 'off') { setArmed('off'); return; }
    setArmed(null); setBusy(true);
    try { await disablePublicShelf(); onOpenChange(false); } catch { showFlash('Couldn’t turn off your public shelf. Try again.'); } finally { setBusy(false); }
  };

  const statusLine = status === 'saving' ? 'Updating…'
    : status === 'offline' ? 'Offline — it updates when you’re back online.'
    : status === 'error' ? 'Couldn’t update — trying again.'
    : shelf ? 'Up to date.' : '';

  return (
    <>
      <Pill ref={btnRef} type="button" $set={!!shelf} aria-expanded={open} aria-haspopup="dialog"
        onClick={() => onOpenChange(!open)}>
        <span aria-hidden="true"><MaterialIcon $size={18}>link</MaterialIcon></span>
        <b>{shelf ? `Public shelf · ${count}` : 'Public shelf'}</b>
      </Pill>
      {open && pos && createPortal(
        <Panel ref={panelRef} role="dialog" aria-label="Public shelf" style={{ left: pos.left, top: pos.top }}>
          <Head>
            <h2>Public shelf</h2>
            <CloseBtn type="button" aria-label="Close" onClick={() => { onOpenChange(false); btnRef.current?.focus(); }}>
              <Icon name="x" size={18} strokeWidth={2} />
            </CloseBtn>
          </Head>

          {!loaded ? (
            <Note>Checking…</Note>
          ) : !shelf ? (
            <>
              <Ask>{pendingItem ? <>Put <em>{pendingItem.title}</em> on your public shelf?</> : 'Start a public shelf?'}</Ask>
              <Note>{PRIVACY_LINE}{pendingItem ? '' : ' Bookmark an item to put it here.'}</Note>
              <Label htmlFor="public-shelf-title">Title</Label>
              <Field id="public-shelf-title" value={draft} maxLength={PUBLIC_SHELF_TITLE_MAX}
                onChange={e => setDraft(e.target.value)} />
              <Actions>
                <PillButton type="button" $variant="neutral" onClick={() => onOpenChange(false)} disabled={busy}>Not now</PillButton>
                <PillButton type="button" onClick={turnOn} disabled={busy}>{busy ? 'Turning on…' : 'Turn on'}</PillButton>
              </Actions>
            </>
          ) : (
            <>
              <Label htmlFor="public-shelf-title">Title</Label>
              <Field id="public-shelf-title" value={draft} maxLength={PUBLIC_SHELF_TITLE_MAX}
                onChange={e => setDraft(e.target.value)}
                onBlur={() => renamePublicShelf(draft)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); renamePublicShelf(draft); } }} />
              <Label as="span">Link</Label>
              <LinkRow>
                <code title={url}>{url}</code>
                <Quiet type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</Quiet>
                <QuietLink href={url} target="_blank" rel="noopener noreferrer">Open</QuietLink>
              </LinkRow>
              <Row>
                <Quiet type="button" onClick={reset} disabled={busy} onBlur={() => setArmed(a => (a === 'reset' ? null : a))}>
                  {armed === 'reset' ? 'Reset? The old link stops working' : 'Reset link'}
                </Quiet>
                <Quiet type="button" $danger onClick={turnOff} disabled={busy} onBlur={() => setArmed(a => (a === 'off' ? null : a))}>
                  {armed === 'off' ? 'Turn off? The link stops working' : 'Turn off'}
                </Quiet>
              </Row>
              <Note style={{ marginTop: 14, marginBottom: 0 }}>{PRIVACY_LINE}</Note>
              {statusLine && <Status role="status">{statusLine}</Status>}
            </>
          )}
        </Panel>,
        document.body,
      )}
    </>
  );
}
