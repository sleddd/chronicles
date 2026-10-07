import { memo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { NAV_COMPACT } from '../../styles/breakpoints.js';
import { useUIStore } from '../../stores/uiStore.js';
import { useEntriesStore } from '../../stores/entriesStore.js';

/* Reveal width: how far the main view slides right to expose the mobile bar. */
const MOBILE_REVEAL_WIDTH = 240;

const SidebarRoot = styled.aside<{ $mobileOpen?: boolean }>`
  width: 92px;
  min-width: 92px;
  height: 100%;
  background: var(--bg-app);
  border-right: 1px solid var(--border-subtle);
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

/* Brand logo block — the Chronicles poppy, pinned to the top. Doubles as the
   Dashboard (home) nav item and matches the other nav icons: accent block only
   when active (on the dashboard), otherwise transparent with theme text color. */
const LogoBtn = styled.button<{ $active?: boolean }>`
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 60px;
  padding: 0;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  background: transparent;
  color: ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--text-secondary)')};
  transition: background 120ms ease, color 120ms ease;

  &:hover {
    background: ${({ $active }) => ($active ? 'transparent' : 'var(--bg-hover)')};
    color: ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--text-primary)')};
  }
`;

/* Inline poppy mark — strokes use currentColor so it follows the button color. */
const LogoMark = styled.svg`
  width: 30px;
  height: 30px;
  display: block;
  stroke: currentColor;
  fill: none;
`;

const NavScroll = styled.nav`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

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
    justify-content: flex-start;
    padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
  }
`;

/* Icon-only nav button — active item gets a solid accent block (per design).
   Rows grow to fill the sidebar height with a hairline divider between each. */
const NavIconBtn = styled.button<{ $active?: boolean }>`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 56px;
  padding: 0;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  background: transparent;
  color: ${({ $active }) => $active ? 'var(--color-accent)' : 'var(--text-secondary)'};
  transition: background 120ms ease, color 120ms ease;

  &:last-of-type {
    border-bottom: none;
  }

  &:hover {
    background: ${({ $active }) => $active ? 'transparent' : 'var(--bg-hover)'};
    color: ${({ $active }) => $active ? 'var(--color-accent)' : 'var(--text-primary)'};
  }

  /* On the mobile reveal bar, keep natural height so the list can scroll
     instead of stretching items to fill the viewport. */
  ${NAV_COMPACT} {
    flex: 0 0 auto;
    min-height: 64px;
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
        <LogoMark viewBox="0 0 100 100" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {[0, 72, 144, 216, 288].map(deg => (
            <g key={deg} transform={`rotate(${deg},50,50)`}>
              <path strokeWidth="1.1" d="M44,47 C34,42 24,28 28,13 C32,4 48,4 50,8 C52,4 68,4 72,13 C76,28 66,42 56,47 Z" />
              <path strokeWidth="0.7" d="M50,46 C50,36 50,22 50,10" />
              <path strokeWidth="0.7" d="M50,36 C48,30 44,24 40,18" />
              <path strokeWidth="0.7" d="M50,36 C52,30 56,24 60,18" />
              <path strokeWidth="0.7" d="M50,28 C49,24 47,20 45,16" />
              <path strokeWidth="0.7" d="M50,28 C51,24 53,20 55,16" />
            </g>
          ))}
          <circle cx="50" cy="50" r="9" strokeWidth="1.1" />
          <g strokeWidth="1">
            {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map(deg => (
              <line key={deg} transform={`rotate(${deg},50,50)`} x1="50" y1="39" x2="50" y2="36" />
            ))}
          </g>
          <circle cx="50" cy="50" r="2.5" fill="currentColor" stroke="none" />
        </LogoMark>
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
