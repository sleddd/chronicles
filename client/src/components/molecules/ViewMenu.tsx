import { Fragment, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { glassControl } from '../../styles/wallpaper.js';
import { Icon, type IconName } from '../atoms/core/Icon.jsx';

/* Planning's ⋯ button at the end of the filter card: a square outlined button
   (accent outline and icon while open — never a darker fill) opening a small
   floating menu — an optional heading ("Saved view"), items with an icon,
   a hairline before the danger item, and a second click to confirm it
   ("Delete “Mine”?"). Escape or a click outside closes it. Props only. */

export interface ViewMenuItem {
  label: string;
  icon: IconName;
  onSelect: () => void;
  danger?: boolean;
  /** Needs a second click, showing this label, before it runs */
  confirmLabel?: string;
}

const Wrap = styled.div`
  position: relative;
  flex: none;
`;

const Trigger = styled.button<{ $open: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid ${({ $open }) => ($open ? 'var(--color-accent-line)' : 'var(--border-card)')};
  border-radius: 8px;
  background: ${({ $open }) => ($open ? 'var(--color-accent-subtle)' : 'transparent')};
  color: ${({ $open }) => ($open ? 'var(--color-accent-line)' : 'var(--text-secondary)')};
  cursor: pointer;
  &:hover { border-color: ${({ $open }) => ($open ? 'var(--color-accent-line)' : 'var(--border-strong)')}; color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  ${glassControl}
`;

const List = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  min-width: 230px;
  padding: 6px;
  background: var(--bg-tile);
  html[data-theme='light'] & { background: var(--bg-control, #fff); }
  border: 1px solid var(--border-pop);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  font-family: var(--font-sans);
`;

const Heading = styled.div`
  padding: 8px 10px 6px;
  font-size: 13px;
  color: var(--text-muted);
`;

const Rule = styled.hr`
  margin: 6px 4px;
  border: none;
  border-top: 1px solid var(--border-subtle);
`;

const Item = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 42px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  font-family: var(--font-sans);
  font-size: 15px;
  color: ${({ $danger }) => ($danger ? 'var(--color-danger)' : 'var(--text-primary)')};
  cursor: pointer;
  &:hover, &:focus-visible { background: var(--bg-row-hover); outline: none; }
  html[data-theme='light'] &:hover, html[data-theme='light'] &:focus-visible { background: var(--bg-hover); }
`;

export function ViewMenu({ label, heading, items }: { label: string; heading?: string; items: ViewMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setConfirming(null); };
    const onDown = (e: MouseEvent | TouchEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (items.length === 0) return null;
  return (
    <Wrap ref={wrap}>
      <Trigger type="button" $open={open} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open}
        onClick={() => { setOpen(o => !o); setConfirming(null); }}>
        <Icon name="more-horizontal" size={18} strokeWidth={2} />
      </Trigger>
      {open && (
        <List role="menu" aria-label={label}>
          {heading && <Heading>{heading}</Heading>}
          {items.map((item, i) => (
            <Fragment key={item.label}>
              {item.danger && i > 0 && <Rule />}
              <Item type="button" role="menuitem" $danger={item.danger}
                onClick={() => {
                  if (item.confirmLabel && confirming !== item.label) { setConfirming(item.label); return; }
                  setOpen(false); setConfirming(null);
                  item.onSelect();
                }}>
                <Icon name={item.icon} size={16} strokeWidth={1.8} />
                {confirming === item.label && item.confirmLabel ? item.confirmLabel : item.label}
              </Item>
            </Fragment>
          ))}
        </List>
      )}
    </Wrap>
  );
}
