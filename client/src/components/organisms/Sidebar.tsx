import { memo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { NAV_COMPACT } from '../../styles/breakpoints.js';
import { useUIStore } from '../../stores/uiStore.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { BrandMark } from '../atoms/BrandMark.js';

/* Reveal width: how far the main view slides right to expose the mobile bar. */
const MOBILE_REVEAL_WIDTH = 240;

const SidebarRoot = styled.aside<{ $mobileOpen?: boolean }>`
  width: 92px;
  min-width: 92px;
  height: 100%;
  /* A toned rail (no outline) — separates from the canvas by fill alone */
  background: var(--bg-rail);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;

  /* Mobile = reveal pattern: the bar is pinned under the content at the far
     left; the main view slides right to expose it. Wider + scrollable. */
  ${NAV_COMPACT} {
    position: fixed;
    left: 0;
    top: 56px;
    bottom: 0;
    width: ${MOBILE_REVEAL_WIDTH}px;
    min-width: ${MOBILE_REVEAL_WIDTH}px;
    z-index: 1;
  }
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
    width: 4px;
    background: var(--color-accent);
  }
`;

/* Brand logo block — the Chronicles mark (accent gradient) in a darker cell pinned
   to the top. Doubles as the Dashboard (home) nav item: accent tab when active. */
const LogoBtn = styled.button<{ $active?: boolean }>`
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 76px;
  padding: 0;
  border: none;
  cursor: pointer;
  background: var(--bg-rail-logo);
  color: ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--text-secondary)')};
  transition: color 120ms ease;

  &:hover { color: ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--text-primary)')}; }
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

  /* Mobile reveal bar: pack items at the top and let the bar scroll. The
     bottom padding (plus safe-area inset) keeps the last item reachable above
     the browser chrome / home indicator. */
  ${NAV_COMPACT} {
    padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
  }
`;

/* Icon-only rail row — no dividers; the active row is lifted onto
   --bg-rail-active with the accent tab. Settings sits at the bottom. */
const NavIconBtn = styled.button<{ $active?: boolean }>`
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 64px;
  padding: 0;
  border: none;
  cursor: pointer;
  background: ${({ $active }) => $active ? 'var(--bg-rail-active)' : 'transparent'};
  color: ${({ $active }) => $active ? 'var(--color-accent)' : 'var(--text-secondary)'};
  transition: background 120ms ease, color 120ms ease;

  &:last-of-type { margin-top: auto; }

  &:hover {
    background: var(--bg-rail-active);
    color: ${({ $active }) => $active ? 'var(--color-accent)' : 'var(--text-primary)'};
  }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }

  ${({ $active }) => ($active ? activeTab : '')}

  /* Mobile reveal bar: the list scrolls, so Settings follows the others. */
  ${NAV_COMPACT} {
    &:last-of-type { margin-top: 0; }
  }
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
  const location = useLocation();
  const rawNavigate = useNavigate();
  const ff = useEntriesStore(s => s.featureFlags);
  const setMobileNavOpen = useUIStore(s => s.setMobileNavOpen);
  const mobileNavOpen = useUIStore(s => s.mobileNavOpen);

  // Wrap navigation so tapping any nav row also closes the mobile drawer.
  const navigate = (path: string) => {
    setMobileNavOpen(false);
    rawNavigate(path);
  };

  const at = (path: string) => location.pathname === path;
  const startsWith = (prefix: string) => location.pathname.startsWith(prefix);

  const hasHealth = ff.medicationEnabled || ff.foodEnabled || ff.exerciseEnabled || ff.allergiesEnabled;

  return (
    <SidebarRoot $mobileOpen={mobileNavOpen}>
      <LogoBtn $active={at('/')} onClick={() => navigate('/')} title="Dashboard" aria-label="Dashboard">
        <BrandMark size={52} gradientId="logo-rail" />
        <SrOnly>Dashboard</SrOnly>
      </LogoBtn>

      <NavScroll>
        <NavIconBtn $active={at('/journal')} onClick={() => navigate('/journal')} title="Journal">
          <MaterialIcon aria-hidden="true">book</MaterialIcon>
          <SrOnly>Journal</SrOnly>
        </NavIconBtn>

        <NavIconBtn $active={at('/topics')} onClick={() => navigate('/topics')} title="Topics">
          <MaterialIcon aria-hidden="true">sell</MaterialIcon>
          <SrOnly>Topics</SrOnly>
        </NavIconBtn>

        {hasHealth && (
          <NavIconBtn $active={startsWith('/health')} onClick={() => navigate('/health')} title="Health">
            <MaterialIcon aria-hidden="true">cardiology</MaterialIcon>
            <SrOnly>Health</SrOnly>
          </NavIconBtn>
        )}

        <NavIconBtn $active={startsWith('/goals')} onClick={() => navigate('/goals')} title="Roadmap">
          <MaterialIcon aria-hidden="true">checklist</MaterialIcon>
          <SrOnly>Roadmap</SrOnly>
        </NavIconBtn>

        <NavIconBtn $active={at('/calendar')} onClick={() => navigate('/calendar')} title="Calendar">
          <MaterialIcon aria-hidden="true">event</MaterialIcon>
          <SrOnly>Calendar</SrOnly>
        </NavIconBtn>

        {ff.financeEnabled === true && (
          <NavIconBtn $active={startsWith('/finance')} onClick={() => navigate('/finance')} title="Finance">
            <MaterialIcon aria-hidden="true">attach_money</MaterialIcon>
            <SrOnly>Finance</SrOnly>
          </NavIconBtn>
        )}

        <NavIconBtn $active={at('/kitchen') || startsWith('/menu') || at('/shopping')} onClick={() => navigate('/kitchen')} title="From the Kitchen">
          <MaterialIcon aria-hidden="true">fork_spoon</MaterialIcon>
          <SrOnly>From the Kitchen</SrOnly>
        </NavIconBtn>

        <NavIconBtn $active={at('/settings')} onClick={() => navigate('/settings')} title="Settings">
          <MaterialIcon aria-hidden="true">settings</MaterialIcon>
          <SrOnly>Settings</SrOnly>
        </NavIconBtn>
      </NavScroll>

    </SidebarRoot>
  );
});
