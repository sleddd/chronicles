import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { NAV_COMPACT } from '../../styles/breakpoints.js';
import { useNavItems } from '../../hooks/useNavItems.js';
import { useSignOut } from '../../hooks/useSignOut.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { BrandMark } from '../atoms/BrandMark.js';

/* Collapsed: icons only (92px). Expanded: each item's name beside its icon.
   The icons keep a 92px column either way, so they never move. */
const RAIL = 92;
const RAIL_OPEN = 220;

const SidebarRoot = styled.aside<{ $open: boolean }>`
  width: ${({ $open }) => ($open ? RAIL_OPEN : RAIL)}px;
  min-width: ${({ $open }) => ($open ? RAIL_OPEN : RAIL)}px;
  transition: width 160ms ease, min-width 160ms ease;
  @media (prefers-reduced-motion: reduce) { transition: none; }
  height: 100%;
  /* A toned rail with a hairline down its right edge, the full height */
  background: var(--bg-rail);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;

  /* Phones/tablets use the drop-down menu in MobileChrome instead */
  ${NAV_COMPACT} { display: none; }
`;

/* Active rail item: lifted onto a lighter block with a 4px accent tab on the
   rail's outer edge. Shared by the logo (Dashboard) and the icon rows. */
const activeTab = `
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 5px;
    background: var(--color-accent-nav);
  }
`;

/* Brand logo block — the Chronicles mark (accent gradient) in a darker cell pinned
   to the top. Doubles as the Dashboard (home) nav item: accent tab when active. */
const LogoBtn = styled.button<{ $active?: boolean }>`
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 76px;
  padding: 0;
  border: none;
  cursor: pointer;
  background: var(--bg-rail-logo);
  color: ${({ $active }) => ($active ? 'var(--color-accent-nav)' : 'var(--text-secondary)')};
  transition: color 120ms ease;

  &:hover { color: ${({ $active }) => ($active ? 'var(--color-accent-nav)' : 'var(--text-primary)')}; }
  ${({ $active }) => ($active ? activeTab : '')}
`;

const NavScroll = styled.nav`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  /* No top padding — the first item butts against the logo cell, so an active
     Journal row has no gap above it */
  padding: 0 0 12px;

  /* Firefox: hide the scrollbar until the sidebar is hovered. */
  scrollbar-width: none;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  /* Hidden by default; reveal the thumb only on hover. */
  &::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 3px;
    transition: background 200ms ease;
  }
  &:hover {
    scrollbar-width: thin;
  }
  &:hover::-webkit-scrollbar-thumb {
    background: var(--border-subtle);
  }
  &:hover::-webkit-scrollbar-thumb:hover {
    background: var(--border-default);
  }
`;

/* Rail row — no dividers; the active row is lifted onto --bg-rail-active
   with the accent tab. Under the last item: expand / collapse, then ⋯, whose
   menu holds Settings, Lock (asks for the password again) and Sign out. */
const NavIconBtn = styled.button<{ $active?: boolean }>`
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 64px;
  padding: 0;
  border: none;
  cursor: pointer;
  background: ${({ $active }) => $active ? 'var(--bg-rail-active)' : 'transparent'};
  color: ${({ $active }) => $active ? 'var(--color-accent-nav)' : 'var(--text-secondary)'};
  transition: background 120ms ease, color 120ms ease;


  &:hover {
    background: var(--bg-rail-active);
    color: ${({ $active }) => $active ? 'var(--color-accent-nav)' : 'var(--text-primary)'};
  }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }

  ${({ $active }) => ($active ? activeTab : '')}
`;

/* The icon's fixed column, so it sits in the same place collapsed or expanded */
const IconCell = styled.span`
  flex: 0 0 ${RAIL}px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

/* The item's name, shown when the rail is expanded */
const Label = styled.span`
  min-width: 0;
  padding-right: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 400;
  color: inherit;
`;

/* "CHRONICLES" beside the logo when expanded — pulled in close to the mark
   (so it sits off the rail's edge), not on the names' line */
const Wordmark = styled.span`
  margin-left: -20px;
  padding-right: 16px;
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 300;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-primary);
  white-space: nowrap;
`;

/* Expand / collapse, then ⋯ (Settings, Lock, Sign out), under the last item */
const ToggleBtn = styled(NavIconBtn)`
  height: 52px;
  color: var(--text-muted);
`;

const Dots = styled.span`
  font-size: 24px;
  line-height: 1;
  letter-spacing: 0;
`;

/* The ⋯ menu: floats beside the rail (an overlay, so it takes the shadow) */
const Flyout = styled.div`
  position: fixed;
  z-index: 1200;
  min-width: 200px;
  padding: 6px;
  background: var(--bg-tile);
  border: 1px solid var(--border-pop);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
`;

const FlyoutItem = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 44px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: ${({ $active }) => ($active ? 'var(--bg-active)' : 'transparent')};
  font-family: var(--font-sans);
  font-size: 15px;
  text-align: left;
  color: ${({ $active }) => ($active ? 'var(--color-accent-nav)' : 'var(--text-primary)')};
  cursor: pointer;
  &:hover { background: var(--bg-hover); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
`;

const STORAGE_KEY = 'nav-expanded-v1';
const readOpen = () => { try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; } };
const saveOpen = (v: boolean) => { try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch { /* remembered for this visit only */ } };

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

/* Google Material Symbols (outlined). Loaded via the font in index.html. */
const MaterialIcon = styled.span<{ $size?: number }>`
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  font-size: ${({ $size }) => $size ?? 24}px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  white-space: nowrap;
  direction: ltr;
  -webkit-font-feature-settings: 'liga';
  -webkit-font-smoothing: antialiased;
  font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
`;


/* Memoized: it reads its state from the stores, so parents re-rendering
   (e.g. the journal on every keystroke) shouldn't re-render the nav. */
export const Sidebar = memo(function Sidebar() {
  const navigate = useNavigate();
  const items = useNavItems();
  const signOut = useSignOut();
  const { lock } = useEncryption();

  // Remembered per browser (a convenience, not a setting)
  const [open, setOpen] = useState(readOpen);
  const [menuAt, setMenuAt] = useState<{ left: number; top: number } | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const mainItems = items.filter(i => i.key !== 'settings');
  const settingsItem = items.find(i => i.key === 'settings');

  const openMenu = () => {
    const r = moreRef.current?.getBoundingClientRect();
    if (!r) return;
    const MENU_H = 3 * 44 + 14;
    setMenuAt({ left: r.right + 8, top: Math.max(8, Math.min(r.top, window.innerHeight - MENU_H - 8)) });
  };
  const closeMenu = () => setMenuAt(null);
  const choose = (fn: () => void) => () => { closeMenu(); fn(); };

  // Close on a click outside or Escape
  useEffect(() => {
    if (!menuAt) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !moreRef.current?.contains(t)) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { closeMenu(); moreRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuAt]);
  // …and when the rail changes width, so it never floats over the wrong spot
  useEffect(() => { closeMenu(); }, [open]);
  const toggle = () => setOpen(v => { saveOpen(!v); return !v; });
  /* Collapsed, the name is a tooltip and screen-reader text; expanded, it's shown */
  const name = (label: string) => (open ? <Label>{label}</Label> : <SrOnly>{label}</SrOnly>);

  return (
    <SidebarRoot $open={open}>
      {/* The logo opens the dashboard, the app's home */}
      <LogoBtn $active={false} onClick={() => navigate('/dashboard')} title={open ? undefined : 'Chronicles'} aria-label="Chronicles — open the dashboard">
        <IconCell><BrandMark size={28} gradientId="logo-rail" /></IconCell>
        {open && <Wordmark aria-hidden="true">Chronicles</Wordmark>}
      </LogoBtn>

      <NavScroll>
        {mainItems.map(item => (
          <NavIconBtn key={item.key} $active={item.active} onClick={() => navigate(item.path)} title={open ? undefined : item.label}>
            <IconCell><MaterialIcon aria-hidden="true">{item.icon}</MaterialIcon></IconCell>
            {name(item.label)}
          </NavIconBtn>
        ))}
        <ToggleBtn onClick={toggle} aria-expanded={open} title={open ? undefined : 'Show names'}>
          <IconCell><MaterialIcon aria-hidden="true">{open ? 'chevron_left' : 'chevron_right'}</MaterialIcon></IconCell>
          {open ? <Label>Collapse</Label> : <SrOnly>Show names</SrOnly>}
        </ToggleBtn>
        <ToggleBtn ref={moreRef} $active={!!settingsItem?.active} onClick={() => (menuAt ? closeMenu() : openMenu())}
          aria-haspopup="menu" aria-expanded={!!menuAt} title={open ? undefined : 'Settings, lock and sign out'}>
          <IconCell><Dots aria-hidden="true">⋯</Dots></IconCell>
          {open ? <Label>More</Label> : <SrOnly>More</SrOnly>}
        </ToggleBtn>
      </NavScroll>
      {menuAt && createPortal(
        <Flyout ref={menuRef} role="menu" aria-label="More" style={{ left: menuAt.left, top: menuAt.top }}>
          {settingsItem && (
            <FlyoutItem role="menuitem" $active={settingsItem.active} onClick={choose(() => navigate(settingsItem.path))}>
              <MaterialIcon aria-hidden="true">settings</MaterialIcon>Settings
            </FlyoutItem>
          )}
          <FlyoutItem role="menuitem" title="Your password opens it again" onClick={choose(lock)}>
            <MaterialIcon aria-hidden="true">lock</MaterialIcon>Lock
          </FlyoutItem>
          <FlyoutItem role="menuitem" onClick={choose(() => { void signOut(); })}>
            <MaterialIcon aria-hidden="true">logout</MaterialIcon>Sign out
          </FlyoutItem>
        </Flyout>,
        document.body,
      )}
    </SidebarRoot>
  );
});
