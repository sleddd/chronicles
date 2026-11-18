import styled from 'styled-components';
import { NAV_COMPACT } from '../../styles/breakpoints.js';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUIStore } from '../../stores/uiStore.js';
import { NotificationBell } from './NotificationBell.js';
import { BrandMark } from '../atoms/BrandMark.js';
import { TOP_BAR_SLOT_ID } from './TopBarAction.js';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { useNavItems, type NavItem } from '../../hooks/useNavItems.js';
import { useSignOut } from '../../hooks/useSignOut.js';
import { useNavSections } from '../../hooks/useNavSections.js';
import { Icon } from '../atoms/core/Icon.jsx';
import { useEffect } from 'react';

/* Top bar shown only on phones/tablets: the logo and the current page's name
   on the left, the menu button on the right; on the page colour with a
   hairline under it (dropped while the menu is open, so bar and menu read as
   one sheet). */
const MobileNavBar = styled.div<{ $open: boolean }>`
  display: none;
  align-items: center;
  justify-content: space-between;
  /* On an iPad / iPhone the clock and battery sit over the top of the page: the bar starts under them */
  /* Room above the row (12px) and under it (8px) */
  padding: calc(12px + env(safe-area-inset-top, 0px)) calc(10px + env(safe-area-inset-right, 0px)) 8px calc(16px + env(safe-area-inset-left, 0px));
  background: var(--bg-app);
  border-bottom: 1px solid ${({ $open }) => ($open ? 'transparent' : 'var(--border-subtle)')};
  height: calc(76px + env(safe-area-inset-top, 0px));
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 52;

  ${NAV_COMPACT} {
    display: flex;
  }
`;

/* The page's main action (New entry, New topic…), across from the logo */
const BarActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  &:empty { display: none; }
`;

/* The logo and page name — the button that opens and closes the menu (there's no ☰) */
const LogoContainer = styled.button`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 4px; border-radius: 6px; }
`;

const PageName = styled.span`
  font-family: var(--font-sans);
  font-size: 20px;
  font-weight: 200;
  letter-spacing: 0.02rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

/* The menu: a sheet dropping from under the bar, full width, rounded at the
   bottom — one row per destination (accent icon + name); the current page
   on the grey --bg-active, its name bold in the standard colour; a hairline, then Settings and Sign out, quieter. Escape, a
   destination or a tap outside closes it. */
const Panel = styled.nav`
  display: none;

  ${NAV_COMPACT} {
    display: block;
    position: fixed;
    top: calc(76px + env(safe-area-inset-top, 0px));
    left: 0;
    right: 0;
    z-index: 51;
    max-height: calc(100dvh - 76px - env(safe-area-inset-top, 0px));
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
  /* Light names (Open Sans's lightest bundled weight is 300), the current page a step heavier */
  font-weight: ${({ $active }) => ($active ? 400 : 300)};
  color: ${({ $active, $quiet }) => ($active ? 'var(--text-primary)' : $quiet ? 'var(--text-muted)' : 'var(--text-primary)')};
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  & > span:first-child { color: var(--color-accent); }
  @media (hover: hover) { &:hover { background: ${({ $active }) => ($active ? 'var(--bg-active)' : 'var(--bg-row-hover)')}; } }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
`;

/* A section with views: its row, and a chevron at the right that shows them (a sibling) */
const SectionWrap = styled.div`
  position: relative;
  & > button:first-child { padding-right: 60px; }
`;

const SectionChevron = styled.button<{ $open: boolean }>`
  position: absolute;
  top: 4px;
  right: 6px;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  & > svg { transition: transform 160ms ease; transform: rotate(${({ $open }) => ($open ? 180 : 0)}deg); }
  @media (prefers-reduced-motion: reduce) { & > svg { transition: none; } }
  @media (hover: hover) { &:hover { background: var(--bg-row-hover); color: var(--text-primary); } }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
`;

/* The section's views, lined up with the section names; the one showing on the grey fill */
const ViewList = styled.ul`
  list-style: none;
  margin: 2px 0 6px;
  padding: 0;
  /* A band a shade darker than the menu, barely-there hairlines above, below and between */
  background: color-mix(in srgb, var(--bg-app) 93%, #000);
  border-radius: 10px;
  border-top: 1px solid color-mix(in srgb, var(--border-subtle) 55%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 55%, transparent);
  & > li + li { border-top: 1px solid color-mix(in srgb, var(--border-subtle) 55%, transparent); }
`;

const ViewRow = styled.button<{ $active: boolean }>`
  display: block;
  width: 100%;
  min-height: 44px;
  padding: 0 14px 0 54px;
  border: none;
  border-radius: 10px;
  background: ${({ $active }) => ($active ? 'var(--bg-active)' : 'transparent')};
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: ${({ $active }) => ($active ? 400 : 300)};
  color: ${({ $active }) => ($active ? 'var(--text-primary)' : 'var(--text-secondary)')};
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
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
    inset: calc(76px + env(safe-area-inset-top, 0px)) 0 0 0;
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
const BarEnd = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
`;

export function MobileChrome() {
  const open = useUIStore(s => s.mobileNavOpen);
  const setOpen = useUIStore(s => s.setMobileNavOpen);
  const navigate = useNavigate();
  const items = useNavItems();
  const { pathname } = useLocation();
  const current = items.find(i => i.active);
  // The menu starts with Home (the dashboard) — on phones the logo opens this menu
  const home: NavItem = { key: 'home', label: 'Home', icon: 'home', path: '/dashboard', active: pathname === '/dashboard' };
  const main = [home, ...items.filter(i => i.key !== 'settings')];
  const settings = items.find(i => i.key === 'settings');
  const signOut = useSignOut();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const sections = useNavSections();
  const go = (path: string) => { setOpen(false); navigate(path); };
  const row = (item: NavItem, quiet = false) => {
    // A section's own row reads as current only when none of its views is the one showing
    const viewShowing = !!item.views?.some(v => v.active);
    const btn = (
      <NavRow key={item.key} type="button" $active={item.active && !viewShowing} $quiet={quiet} aria-current={item.active && !viewShowing ? 'page' : undefined}
        onClick={() => go(item.path)}>
        <MaterialIcon $size={22} aria-hidden="true">{item.icon}</MaterialIcon>
        <span>{item.label}</span>
      </NavRow>
    );
    if (!item.views?.length) return btn;
    const shown = sections.isOpen(item.key, item.active);
    const listId = `mobile-views-${item.key}`;
    return (
      <div key={item.key}>
        <SectionWrap>
          {btn}
          <SectionChevron type="button" $open={shown} aria-expanded={shown} aria-controls={listId}
            aria-label={`${shown ? 'Hide' : 'Show'} ${item.label} views`} onClick={() => sections.toggle(item.key, item.active)}>
            <Icon name="chevron-down" size={20} strokeWidth={1.8} aria-hidden="true" />
          </SectionChevron>
        </SectionWrap>
        {shown && (
          <ViewList id={listId} aria-label={`${item.label} views`}>
            {item.views.map(v => (
              <li key={v.path}>
                <ViewRow type="button" $active={v.active} aria-current={v.active ? 'page' : undefined} onClick={() => go(v.path)}>{v.label}</ViewRow>
              </li>
            ))}
          </ViewList>
        )}
      </div>
    );
  };

  return (
    <>
      <MobileNavBar $open={open}>
        <LogoContainer type="button" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="mobile-nav">
          <BrandMark size={26} gradientId="logo-mobile" />
          <PageName>{current?.label ?? (pathname === '/dashboard' ? 'Today' : 'Chronicles')}</PageName>
        </LogoContainer>
        {/* The page's main action lands here (TopBarAction), then the reminders bell */}
        <BarEnd>
          <BarActions id={TOP_BAR_SLOT_ID} />
          <NotificationBell variant="bar" />
        </BarEnd>
      </MobileNavBar>
      <Overlay $open={open} onClick={() => setOpen(false)} />
      {open && (
        <Panel id="mobile-nav" aria-label="Main">
          {main.map(i => row(i))}
          <MenuRule />
          {settings && row(settings, true)}
          <NavRow type="button" $active={false} $quiet onClick={() => { setOpen(false); void signOut(); }}>
            <MaterialIcon $size={22} aria-hidden="true">logout</MaterialIcon>
            <span>Sign out</span>
          </NavRow>
        </Panel>
      )}
    </>
  );
}
