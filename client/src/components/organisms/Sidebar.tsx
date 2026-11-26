import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { NAV_COMPACT } from '../../styles/breakpoints.js';
import { useNavItems, type NavItem } from '../../hooks/useNavItems.js';
import { useNavSections } from '../../hooks/useNavSections.js';
import { useSignOut } from '../../hooks/useSignOut.js';
import { usePopover } from '../../hooks/usePopover.js';
import { BrandMark } from '../atoms/BrandMark.js';
import { Icon } from '../atoms/core/Icon.jsx';

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
  /* Dark: one quiet blue-black strip — no edge line */
  html[data-theme='dark'] & { border-right-color: transparent; }
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;

  /* Phones/tablets use the drop-down menu in MobileChrome instead */
  ${NAV_COMPACT} { display: none; }
`;

/* Active rail item: an accent tab on the rail's right edge (beside the page), about
   as tall as the icon. Shared by the logo (Dashboard) and the icon rows. */
const activeTab = `
  &::before {
    content: '';
    position: absolute;
    right: 0;
    /* About the icon's height, centred on it */
    top: 50%;
    height: 30px;
    transform: translateY(-50%);
    border-radius: 2px;
    width: 5px;
    background: var(--color-accent-nav);
  }
  /* Dark: a thin bar on the rail's right edge, about the icon's height */
  html[data-theme='dark'] &::before { width: 2px; }
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
  height: 64px;
  padding: 0;
  border: none;
  cursor: pointer;
  background: transparent; /* no cell of its own: the rail's colour, a hairline under it */
  border-bottom: 1px solid var(--border-subtle);
  color: ${({ $active }) => ($active ? 'var(--text-primary)' : 'var(--text-secondary)')};
  transition: color 120ms ease;

  &:hover { color: ${({ $active }) => ($active ? 'var(--text-primary)' : 'var(--text-primary)')}; }
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

/* Rail row — the active row is its accent icon and the accent tab, with no background
   change (a light hairline between rows in both themes). Under the last item: expand / collapse, then ⋯, whose
   menu holds Sign out; Settings is its own row above Collapse. */
const NavIconBtn = styled.button<{ $active?: boolean; $tab?: boolean; $fullTab?: boolean }>`
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 60px; /* compact enough that ⋯ More shows without scrolling */
  padding: 0;
  border: none;
  cursor: pointer;
  background: ${({ $active }) => $active ? 'var(--bg-rail-active)' : 'transparent'};
  /* Idle rows recede (about 55%) so only the active one reads bright */
  color: ${({ $active }) => $active ? 'var(--text-primary)' : 'color-mix(in srgb, var(--text-secondary) 55%, transparent)'};
  transition: background 120ms ease, color 120ms ease;


  &:hover {
    /* Only the current page's row is shaded (light): hovering never adds a fill */
    background: ${({ $active }) => $active ? 'var(--bg-rail-active)' : 'transparent'};
    color: ${({ $active }) => $active ? 'var(--text-primary)' : 'var(--text-primary)'};
  }
  /* Dark: hovering brightens the icon only (no block behind it) */
  html[data-theme='dark'] &:hover { background: transparent; }
  /* No lines between items, in either theme */
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }

  /* The accent tab: on a section with views, while it's open (clicked or its arrow); else the page you're on */
  ${({ $active, $tab }) => (($tab ?? $active) ? activeTab : '')}
  /* Expanded rail: the tab runs the row's full height */
  ${({ $fullTab }) => ($fullTab ? '&::before { top: 0; height: 100%; transform: none; border-radius: 0; }' : '')}
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

/* A section's row with views: the row, and its chevron at the right edge (a sibling, never
   inside the row's button) */
const RowWrap = styled.div`
  position: relative;
  flex: 0 0 auto;
  /* Open: the section's row a shade darker than the rail — in light its views a step darker again,
     in dark the other way round (the row darker, the views lifted lighter) */
  transition: background 240ms ease;
  /* Open: the section's row in the logo cell's colour (the CHRONICLES cell at the top) */
  [data-open] > & { background: var(--bg-rail-logo); }
  /* Room for the chevron at the end of the name */
  & > button:first-child > span:last-child { padding-right: 44px; }
`;

const SectionChevron = styled.button<{ $open: boolean; $active?: boolean }>`
  position: absolute;
  top: 50%;
  right: 8px;
  display: grid;
  place-items: center;
  /* Just the chevron, no fill behind it */
  width: 26px;
  height: 26px;
  margin-top: -13px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  /* The same colour as its row's name: bright on the current section, receding with the others */
  color: ${({ $active }) => ($active ? 'var(--text-primary)' : 'color-mix(in srgb, var(--text-secondary) 55%, transparent)')};
  cursor: pointer;
  & > svg { transition: transform 160ms ease; transform: rotate(${({ $open }) => ($open ? 180 : 0)}deg); }
  @media (prefers-reduced-motion: reduce) { & > svg { transition: none; } }
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
`;

/* A section's views, under its row: on a band a shade darker than the rail, with barely-there
   hairlines above, below and between them; the names lined up with the section names, the
   one showing in the accent. The list takes its full height — what's under it moves down */
const ViewList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  /* A step darker than the open section's row; between rows a dark line over a faint light one */
  background: color-mix(in srgb, var(--bg-rail) 82%, #fff);
  html[data-theme='dark'] & { background: color-mix(in srgb, var(--bg-rail) 96%, #fff); }
  /* Light: the views sit a little lighter than the current page's row, both shades of the
     tile colour (#ede6e2) worked out from the menu's own colour */
  html[data-theme='light'] & { background: color-mix(in srgb, var(--bg-rail) 75%, var(--bg-tile)); }
  /* Lines only between rows: none above the first or below the last, so it sits right against
     the section's row and the next item */
  & > li + li { border-top: 1px solid rgba(0, 0, 0, 0.3); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035); }
  html[data-theme='light'] & > li + li { border-top-color: color-mix(in srgb, var(--text-primary) 6%, transparent); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45); }
`;

const ViewBtn = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  height: 44px;
  padding: 0 11px 0 ${RAIL}px;
  border: none;
  background: transparent;
  text-align: left;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: ${({ $active }) => ($active ? 500 : 400)};
  color: ${({ $active }) => ($active ? 'var(--text-primary)' : 'color-mix(in srgb, var(--text-secondary) 72%, transparent)')};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
  & > span:first-child { overflow: hidden; text-overflow: ellipsis; }
`;

/* The views slide open and shut (rows 0fr → 1fr); hidden from the keyboard and screen
   readers while shut, instant for reduced motion */
const ViewSlide = styled.div<{ $open: boolean }>`
  display: grid;
  grid-template-rows: ${({ $open }) => ($open ? '1fr' : '0fr')};
  visibility: ${({ $open }) => ($open ? 'visible' : 'hidden')};
  transition: grid-template-rows 240ms ease, visibility 0s linear ${({ $open }) => ($open ? '0s' : '240ms')};
  & > * { min-height: 0; overflow: hidden; }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

/* A section and its views: never squeezed by the scrolling column — it takes its full height */
const Section = styled.div`
  flex: none;
`;

/* Settings, Collapse and ⋯: right under the last item, in the flow — an open section's views
   push them down (the rail scrolls when it runs long), never slide under them */
const Foot = styled.div`
  flex: none;
  display: flex;
  flex-direction: column;
`;

/* Settings, then expand / collapse, then ⋯ (Sign out), under the last item */
const ToggleBtn = styled(NavIconBtn)`
  height: 44px;
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
  color: ${({ $active }) => ($active ? 'var(--text-primary)' : 'var(--text-primary)')};
  cursor: pointer;
  &:hover { background: var(--bg-hover); }
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
`;

const STORAGE_KEY = 'nav-expanded-v1';
// Expanded (names and the sections' views) unless collapsed by hand in this browser
const readOpen = () => { try { return localStorage.getItem(STORAGE_KEY) !== '0'; } catch { return true; } };
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
  font-weight: 300; /* = the wght below (Safari draws the variable font at the CSS weight) */
  font-style: normal;
  font-size: ${({ $size }) => $size ?? 26}px;
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
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('mousedown', onDown); };
  }, [menuAt]);
  // Keyboard: into the menu on open, Escape back to ⋯, focus leaving closes it
  usePopover({ open: !!menuAt, onClose: closeMenu, triggerRef: moreRef, panelRef: menuRef });
  // …and when the rail changes width, so it never floats over the wrong spot
  useEffect(() => { closeMenu(); }, [open]);
  const toggle = () => setOpen(v => { saveOpen(!v); return !v; });
  /* Collapsed, the name is a tooltip and screen-reader text; expanded, it's shown */
  const name = (label: string) => (open ? <Label>{label}</Label> : <SrOnly>{label}</SrOnly>);
  const sections = useNavSections();
  // One accent at a time: on the section opened last (its row or its arrow) while it stays open,
  // else on the page you're on — opening another section moves it, never leaves it behind
  const [lastOpened, setLastOpened] = useState<string | null>(null);
  const accentKey = (() => {
    const last = lastOpened ? items.find(i => i.key === lastOpened) : undefined;
    if (last && sections.isOpen(last.key)) return last.key;
    return items.find(i => i.active)?.key ?? null;
  })();
  const toggleSection = (item: NavItem, shown: boolean) => {
    sections.toggle(item.key);
    setLastOpened(shown ? (lastOpened === item.key ? null : lastOpened) : item.key);
  };
  const row = (item: NavItem) => {
    const hasViews = open && !!item.views?.length;
    const shown = hasViews && sections.isOpen(item.key);
    const btn = (
      <NavIconBtn key={item.key} $active={item.active} $tab={open ? item.key === accentKey : undefined} $fullTab={open}
        // A section's row (its name, icon or anywhere on it) opens its page and drops its views open;
        // clicked again on that page while they're open, it closes them. From another page (the
        // arrow opened them) it still goes to the section
        onClick={() => {
          if (shown && (item.active || item.views?.some(v => v.active))) { toggleSection(item, shown); return; }
          if (hasViews) sections.openWith(item.key, item.path);
          setLastOpened(hasViews ? item.key : null);
          navigate(item.path);
        }}
        title={open ? undefined : item.label}
        aria-current={item.active && !item.views?.some(v => v.active) ? 'page' : undefined}>
        <IconCell><MaterialIcon $size={22} aria-hidden="true">{item.icon}</MaterialIcon></IconCell>
        {name(item.label)}
      </NavIconBtn>
    );
    // Collapsed (icons only), or a page with no views: just the row
    if (!hasViews) return btn;
    const listId = `nav-views-${item.key}`;
    return (
      <Section key={item.key} data-open={shown ? '' : undefined}>
        <RowWrap>
          {btn}
          <SectionChevron type="button" $open={shown} $active={item.active} aria-expanded={shown} aria-controls={listId}
            aria-label={`${shown ? 'Hide' : 'Show'} ${item.label} views`} title={shown ? 'Hide views' : 'Show views'}
            onClick={() => toggleSection(item, shown)}>
            <Icon name="chevron-down" size={15} strokeWidth={2} aria-hidden="true" />
          </SectionChevron>
        </RowWrap>
        <ViewSlide $open={shown}>
          <ViewList id={listId} aria-label={`${item.label} views`}>
            {(item.views ?? []).map(v => (
              <li key={v.path}>
                <ViewBtn type="button" $active={v.active} aria-current={v.active ? 'page' : undefined} onClick={() => { setLastOpened(null); navigate(v.path); }}>
                  <span>{v.label}</span>
                </ViewBtn>
              </li>
            ))}
          </ViewList>
        </ViewSlide>
      </Section>
    );
  };

  return (
    <SidebarRoot $open={open}>
      {/* The logo opens the dashboard, the app's home */}
      <LogoBtn $active={false} onClick={() => navigate('/dashboard')} title={open ? undefined : 'Chronicles'} aria-label="Chronicles — open the dashboard">
        <IconCell><BrandMark size={28} gradientId="logo-rail" /></IconCell>
        {open && <Wordmark aria-hidden="true">Chronicles</Wordmark>}
      </LogoBtn>

      <NavScroll>
        {mainItems.map(row)}
        <Foot>
        {/* Settings: its own row, last before Collapse */}
        {settingsItem && (
          <NavIconBtn $active={settingsItem.active} onClick={() => navigate(settingsItem.path)} title={open ? undefined : settingsItem.label}>
            <IconCell><MaterialIcon $size={22} aria-hidden="true">{settingsItem.icon}</MaterialIcon></IconCell>
            {name(settingsItem.label)}
          </NavIconBtn>
        )}
        <ToggleBtn onClick={toggle} aria-expanded={open} title={open ? undefined : 'Show names'}>
          <IconCell><MaterialIcon $size={22} aria-hidden="true">{open ? 'chevron_left' : 'chevron_right'}</MaterialIcon></IconCell>
          {open ? <Label>Collapse</Label> : <SrOnly>Show names</SrOnly>}
        </ToggleBtn>
        <ToggleBtn ref={moreRef} onClick={() => (menuAt ? closeMenu() : openMenu())}
          aria-haspopup="menu" aria-expanded={!!menuAt} title={open ? undefined : 'Sign out'}>
          <IconCell><Dots aria-hidden="true">⋯</Dots></IconCell>
          {open ? <Label>More</Label> : <SrOnly>More</SrOnly>}
        </ToggleBtn>
        </Foot>
      </NavScroll>
      {menuAt && createPortal(
        <Flyout ref={menuRef} role="menu" aria-label="More" style={{ left: menuAt.left, top: menuAt.top }}>
          <FlyoutItem role="menuitem" onClick={choose(() => { void signOut(); })}>
            <MaterialIcon aria-hidden="true">logout</MaterialIcon>Sign out
          </FlyoutItem>
        </Flyout>,
        document.body,
      )}
    </SidebarRoot>
  );
});
