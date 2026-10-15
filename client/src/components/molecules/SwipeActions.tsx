import { useRef, useCallback, useEffect, type ReactNode } from 'react';
import styled from 'styled-components';
import { Icon } from '../../../../design-system/components/core/Icon.jsx';

/* ── Constants ── */

const ACTION_W  = 140; // width of the revealed action bar (2 × 70px)
const THRESHOLD = 52;  // finger travel to trigger snap

/* Mix a hex color toward a neutral mid-grey to produce a solid muted tone */
function muteColor(hex: string, amount = 0.45): string {
  const raw = hex.replace('#', '');
  const full = raw.length === 3
    ? raw.split('').map(c => c + c).join('')
    : raw;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const mr = Math.round(r * (1 - amount) + 110 * amount);
  const mg = Math.round(g * (1 - amount) + 110 * amount);
  const mb = Math.round(b * (1 - amount) + 110 * amount);
  return `rgb(${mr}, ${mg}, ${mb})`;
}

/* ── Styled ── */

/* Clip only sideways (the swipe) — `clip` keeps the vertical axis visible, so a
   row can overlap the rule above it (EntryListCard's accent top border on hover). */
const Outer = styled.div`
  position: relative;
  overflow-x: clip;
  overflow-y: visible;
`;

/*
 * Content slides LEFT to reveal the ActionBar behind it.
 * Default: translateX(0) = covering the action bar.
 * Open:    translateX(-actionW) = slid left, action bar fully visible.
 */
const Content = styled.div`
  position: relative;
  z-index: 2;
`;

/*
 * ActionBar starts pushed off-screen right (translateX(actionW), clipped by Outer overflow:hidden).
 * As content slides left, ActionBar slides in from right in sync — both move together.
 */
const ActionBar = styled.div`
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: ${ACTION_W}px;
  display: flex;
  pointer-events: none;
  z-index: 1;
  transform: translateX(100%);
`;

const ActionBtn = styled.button<{ $bg: string }>`
  flex: 1;
  background: ${({ $bg }) => $bg};
  border: none;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.75);
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  user-select: none;
  -webkit-user-select: none;
  transition: color 0.1s, filter 0.1s;
  &:active { filter: brightness(0.85); color: rgba(255, 255, 255, 0.95); }
`;

const SrOnly = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

/* ── Component ── */

interface SwipeActionsProps {
  children: ReactNode;
  onEdit?: () => void;
  onDelete: () => void;
  accentColor?: string;
  disabled?: boolean;
  buttonWidth?: number;
}

export function SwipeActions({
  children, onEdit, onDelete, accentColor = '#4A5568', disabled, buttonWidth = 70,
}: SwipeActionsProps) {
  const actionW       = buttonWidth * (onEdit ? 2 : 1);
  const contentRef    = useRef<HTMLDivElement>(null);
  const barRef        = useRef<HTMLDivElement>(null);
  const isOpen        = useRef(false);
  const startX        = useRef(0);
  const startY        = useRef(0);
  const locked        = useRef<'h' | 'v' | null>(null);
  const lastTouchMs   = useRef(0);
  const suppressClick = useRef(false);

  /* ── Helpers ── */

  // x = newX from drag logic: actionW when closed, 0 when fully open.
  // Content:   translateX(x - actionW)  →  0 when closed, -actionW when open.
  // ActionBar: translateX(x)            →  actionW when closed (hidden), 0 when open.
  // Both move in sync so the bar is never visible through the transparent content.
  const applyBar = (x: number, animate: boolean) => {
    const contentEl = contentRef.current;
    const barEl     = barRef.current;
    if (!contentEl || !barEl) return;
    const t = animate ? 'transform 0.2s ease' : 'none';
    contentEl.style.transition  = t;
    contentEl.style.transform   = `translateX(${x - actionW}px)`;
    barEl.style.transition      = t;
    barEl.style.transform       = `translateX(${x}px)`;
    barEl.style.pointerEvents   = x < actionW ? 'auto' : 'none';
  };

  const snap = useCallback((open: boolean) => {
    isOpen.current = open;
    applyBar(open ? 0 : actionW, true);
    if (!open) {
      setTimeout(() => {
        if (!isOpen.current && contentRef.current && barRef.current) {
          contentRef.current.style.transition  = '';
          contentRef.current.style.transform   = '';
          barRef.current.style.transition      = '';
          barRef.current.style.transform       = '';
          barRef.current.style.pointerEvents   = '';
        }
      }, 230);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionW]);

  /* ── Touch: non-passive touchmove so we can call preventDefault ── */

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const handleMove = (e: TouchEvent) => {
      if (disabled) return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;

      if (!locked.current) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        locked.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
      }
      if (locked.current === 'v') return;

      e.preventDefault();

      // currentOffset: actionW when closed, 0 when open
      const currentOffset = isOpen.current ? 0 : actionW;
      const newX = Math.max(0, Math.min(actionW, currentOffset + dx));
      applyBar(newX, false);
    };

    content.addEventListener('touchmove', handleMove, { passive: false });
    return () => content.removeEventListener('touchmove', handleMove);
  }, [disabled, actionW]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    locked.current = null;
  }, [disabled]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    lastTouchMs.current = Date.now();
    if (disabled || locked.current !== 'h') return;
    const dx = e.changedTouches[0].clientX - startX.current;
    let shouldOpen = isOpen.current;
    if ( isOpen.current && dx >  THRESHOLD) shouldOpen = false;
    if (!isOpen.current && dx < -THRESHOLD) shouldOpen = true;
    snap(shouldOpen);
  }, [disabled, snap]);

  /* Tap content while open → dismiss (touch only); also block click after mouse drag */
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.stopPropagation();
      return;
    }
    if (isOpen.current && Date.now() - lastTouchMs.current < 600) {
      e.stopPropagation();
      snap(false);
    }
  }, [snap]);

  /* ── Desktop: mouse-drag (hold + drag left) ── */

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || disabled) return;
    if (Date.now() - lastTouchMs.current < 600) return;

    const startMouseX = e.clientX;
    let moved = false;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startMouseX;
      if (!moved && Math.abs(dx) < 4) return;
      moved = true;
      const currentOffset = isOpen.current ? 0 : actionW;
      const newX = Math.max(0, Math.min(actionW, currentOffset + dx));
      applyBar(newX, false);
    };

    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!moved) return;
      suppressClick.current = true;
      const dx = ev.clientX - startMouseX;
      let shouldOpen = isOpen.current;
      if ( isOpen.current && dx >  THRESHOLD) shouldOpen = false;
      if (!isOpen.current && dx < -THRESHOLD) shouldOpen = true;
      snap(shouldOpen);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [disabled, snap]);

  return (
    <Outer>
      <Content
        ref={contentRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClickCapture={onClickCapture}
        onMouseDown={onMouseDown}
      >
        {children}
      </Content>

      <ActionBar ref={barRef} style={{ width: actionW }}>
        {onEdit && (
          <ActionBtn
            $bg={muteColor(accentColor)}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); snap(false); onEdit(); }}
            aria-label="Edit"
          >
            <Icon name="pencil" size={18} strokeWidth={2} />
            <SrOnly>Edit</SrOnly>
          </ActionBtn>
        )}
        <ActionBtn
          $bg={muteColor('#EF4444')}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); snap(false); onDelete(); }}
          aria-label="Delete"
        >
          <Icon name="trash" size={18} strokeWidth={2} />
          <SrOnly>Delete</SrOnly>
        </ActionBtn>
      </ActionBar>
    </Outer>
  );
}
