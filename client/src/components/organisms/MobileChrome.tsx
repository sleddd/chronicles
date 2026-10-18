import styled from 'styled-components';
import { NAV_COMPACT } from '../../styles/breakpoints.js';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../atoms/core/Icon.jsx';
import { useUIStore } from '../../stores/uiStore.js';
import { BrandMark } from '../atoms/BrandMark.js';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { useNavItems, type NavItem } from '../../hooks/useNavItems.js';
import { useSignOut } from '../../hooks/useSignOut.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useEffect } from 'react';

/* Top bar shown only on phones/tablets: the logo and the current page's name
   on the left, the menu button on the right; on the page colour with a
   hairline under it (dropped while the menu is open, so bar and menu read as
   one sheet). */
const MobileNavBar = styled.div<{ $open: boolean }>`
  display: none;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px 0 16px;
  background: var(--bg-app);
  border-bottom: 1px solid ${({ $open }) => ($open ? 'transparent' : 'var(--border-subtle)')};
  height: 56px;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 52;

  ${NAV_COMPACT} {
    display: flex;
  }
`;

const LogoContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  cursor: pointer;
`;

const PageName = styled.span`
  font-family: var(--font-sans);
  font-size: 18px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

/* ☰ — or, while open, × in a softly tinted square */
const MenuButton = styled.button<{ $open: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: ${({ $open }) => ($open ? 'color-mix(in srgb, var(--color-accent) 8%, var(--bg-app))' : 'transparent')};
  color: var(--text-primary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
`;

/* The menu: a sheet dropping from under the bar, full width, rounded at the
   bottom — one row per destination (accent icon + name); the current page
   on the grey --bg-active, its name bold in the standard colour; a hairline, then Settings, Lock and Sign out, quieter. Escape, a
   destination or a tap outside closes it. */
const Panel = styled.nav`
  display: none;

  ${NAV_COMPACT} {
    display: block;
    position: fixed;
    top: 56px;
    left: 0;
    right: 0;
    z-index: 51;
    max-height: calc(100dvh - 56px);
    overflow-y: auto;
    padding: 8px 10px calc(14px + env(safe-area-inset-bottom, 0px));
    background: var(--bg-app);
    border-radius: 0 0 20px 20px;
    box-shadow: var(--shadow-xl);
    animation: navDrop 180ms ease-out;
    @keyframes navDrop { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { animation: none; }
  }
`;

const NavRow = styled.button<{ $active: boolean; $quiet?: boolean }>`
  display: flex;
  align-items: center;
  gap: 18px;
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  background: ${({ $active }) => ($active ? 'var(--bg-active)' : 'transparent')};
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  color: ${({ $active, $quiet }) => ($active ? 'var(--text-primary)' : $quiet ? 'var(--text-muted)' : 'var(--text-primary)')};
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  & > span:first-child { color: var(--color-accent); }
  @media (hover: hover) { &:hover { background: ${({ $active }) => ($active ? 'var(--bg-active)' : 'var(--bg-row-hover)')}; } }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
`;

const MenuRule = styled.hr`
  margin: 8px 14px;
  border: none;
  border-top: 1px solid var(--border-subtle);
`;

const Overlay = styled.div<{ $open: boolean }>`
  display: none;

  ${NAV_COMPACT} {
    display: ${({ $open }) => ($open ? 'block' : 'none')};
    position: fixed;
    inset: 56px 0 0 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 50;
  }
`;

/**
 * Phones/tablets (NAV_COMPACT): the top bar (logo + the current page's name +
 * menu button) and the drop-down menu sheet it opens — the same destinations
 * as the desktop rail (`useNavItems`), Settings and Sign out last under a hairline. Open
 * state lives in uiStore (`mobileNavOpen`). Hidden on desktop.
 */
export function MobileChrome() {
  const open = useUIStore(s => s.mobileNavOpen);
  const setOpen = useUIStore(s => s.setMobileNavOpen);
  const navigate = useNavigate();
  const items = useNavItems();
  const { pathname } = useLocation();
  const current = items.find(i => i.active);
  const main = items.filter(i => i.key !== 'settings');
  const settings = items.find(i => i.key === 'settings');
  const signOut = useSignOut();
  const { lock } = useEncryption();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const row = (item: NavItem, quiet = false) => (
    <NavRow key={item.key} type="button" $active={item.active} $quiet={quiet} aria-current={item.active ? 'page' : undefined}
      onClick={() => { setOpen(false); navigate(item.path); }}>
      <MaterialIcon $size={22} aria-hidden="true">{item.icon}</MaterialIcon>
      <span>{item.label}</span>
    </NavRow>
  );

  return (
    <>
      <MobileNavBar $open={open}>
        <LogoContainer onClick={() => { setOpen(false); navigate('/dashboard'); }}>
          <BrandMark size={26} gradientId="logo-mobile" />
          <PageName>{current?.label ?? (pathname === '/dashboard' ? 'Today' : 'Chronicles')}</PageName>
        </LogoContainer>
        <MenuButton $open={open} onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open} aria-controls="mobile-nav">
          <Icon name={open ? 'x' : 'menu'} size={22} strokeWidth={2} />
        </MenuButton>
      </MobileNavBar>
      <Overlay $open={open} onClick={() => setOpen(false)} />
      {open && (
        <Panel id="mobile-nav" aria-label="Main">
          {main.map(i => row(i))}
          <MenuRule />
          {settings && row(settings, true)}
          <NavRow type="button" $active={false} $quiet onClick={() => { setOpen(false); lock(); }}>
            <MaterialIcon $size={22} aria-hidden="true">lock</MaterialIcon>
            <span>Lock</span>
          </NavRow>
          <NavRow type="button" $active={false} $quiet onClick={() => { setOpen(false); void signOut(); }}>
            <MaterialIcon $size={22} aria-hidden="true">logout</MaterialIcon>
            <span>Sign out</span>
          </NavRow>
        </Panel>
      )}
    </>
  );
}
