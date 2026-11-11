import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { PillButton } from '../atoms/PillButton.js';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';
import { usePublicShelfStore } from '../../stores/publicShelfStore.js';
import { enablePublicShelf } from '../../hooks/usePublicShelfSync.js';
import { showFlash } from '../../services/flashNotice.js';
import type { MediaItem } from '../../utils/media.js';
import { PUBLIC_SHELF_TITLE_MAX } from '@shared/validation/schemas';

/* The first bookmark's question, as a small floating panel under the
   bookmark that was tapped: "Put X on your public shelf?", what that means,
   a title, Turn on / Not now. Nothing is published until Turn on. Once the
   shelf exists, bookmarks just toggle; the link sits by the page title and
   the title, Reset link and Turn off live in Settings → Data. */

export const PUBLIC_SHELF_PRIVACY_LINE = 'Anyone with the link can see the covers, titles, makers, years, ratings and shelves of bookmarked items. Notes and progress stay private. The public shelf is stored readable on the server, like a shared entry.';

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

interface PublicShelfControlProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The bookmark that was tapped — the panel opens under it (centred when none) */
  anchor: HTMLElement | null;
  /** The item whose bookmark opened the panel */
  pendingItem: MediaItem | null;
  /** Called after Turn on with the pending item, so the caller flags it */
  onTurnedOn: (item: MediaItem | null) => void;
}

const PANEL_GUESS_HEIGHT = 320;

export function PublicShelfControl({ open, onOpenChange, anchor, pendingItem, onTurnedOn }: PublicShelfControlProps) {
  const title = usePublicShelfStore(s => s.title);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [draft, setDraft] = useState(title);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(title); }, [title]);
  // A stable close for the focus trap: a fresh function each render would re-arm the trap and move focus
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useFocusTrap(panelRef, open && !!pos, close);

  // Place the panel under the bookmark (above it when there's no room), kept on screen; centred without one
  useEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const width = Math.min(380, window.innerWidth - 24);
      const r = anchor?.getBoundingClientRect();
      if (!r) { setPos({ left: Math.max(12, (window.innerWidth - width) / 2), top: Math.max(12, window.innerHeight * 0.2) }); return; }
      const below = r.bottom + 8;
      const top = below + PANEL_GUESS_HEIGHT > window.innerHeight ? Math.max(12, r.top - 8 - PANEL_GUESS_HEIGHT) : below;
      // Right-aligned to the bookmark; a card near the left edge gets the panel from its left instead (never over the rail)
      const rightAligned = r.right - width;
      const left = rightAligned >= 100 ? rightAligned : r.left;
      setPos({ left: Math.max(12, Math.min(left, window.innerWidth - width - 12)), top });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !anchor?.contains(t)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { onOpenChange(false); anchor?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, onOpenChange, anchor]);

  const turnOn = async () => {
    setBusy(true);
    try {
      await enablePublicShelf(draft);
      onTurnedOn(pendingItem);
      onOpenChange(false);
    } catch (err) {
      showFlash(err instanceof Error && /too big/i.test(err.message) ? err.message : 'Couldn’t turn on your public shelf. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!open || !pos) return null;
  return createPortal(
    <Panel ref={panelRef} role="dialog" aria-label="Public shelf" style={{ left: pos.left, top: pos.top }}>
      <Head>
        <h2>Public shelf</h2>
        <CloseBtn type="button" aria-label="Close" onClick={() => { onOpenChange(false); anchor?.focus(); }}>
          <Icon name="x" size={18} strokeWidth={2} />
        </CloseBtn>
      </Head>
      <Ask>{pendingItem ? <>Put <em>{pendingItem.title}</em> on your public shelf?</> : 'Start a public shelf?'}</Ask>
      <Note>{PUBLIC_SHELF_PRIVACY_LINE}</Note>
      <Label htmlFor="public-shelf-title">Title</Label>
      <Field id="public-shelf-title" value={draft} maxLength={PUBLIC_SHELF_TITLE_MAX} onChange={e => setDraft(e.target.value)} />
      <Actions>
        <PillButton type="button" $variant="neutral" onClick={() => onOpenChange(false)} disabled={busy}>Not now</PillButton>
        <PillButton type="button" onClick={turnOn} disabled={busy}>{busy ? 'Turning on…' : 'Turn on'}</PillButton>
      </Actions>
    </Panel>,
    document.body,
  );
}
