import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { NAV_COMPACT } from '../../styles/breakpoints.js';
import { useNavItems } from '../../hooks/useNavItems.js';
import { BrandMark } from '../atoms/BrandMark.js';

const SidebarRoot = styled.aside`
  width: 92px;
  min-width: 92px;
  height: 100%;
  /* A toned rail (no outline) — separates from the canvas by fill alone */
  background: var(--bg-rail);
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
    width: 4px;
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
  justify-content: center;
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
  color: ${({ $active }) => $active ? 'var(--color-accent-nav)' : 'var(--text-secondary)'};
  transition: background 120ms ease, color 120ms ease;

  &:last-of-type { margin-top: auto; }

  &:hover {
    background: var(--bg-rail-active);
    color: ${({ $active }) => $active ? 'var(--color-accent-nav)' : 'var(--text-primary)'};
  }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }

  ${({ $active }) => ($active ? activeTab : '')}
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
  const navigate = useNavigate();
  const items = useNavItems();
  const home = items[0]; // Dashboard — the logo cell
  const rows = items.slice(1);

  return (
    <SidebarRoot>
      <LogoBtn $active={home.active} onClick={() => navigate(home.path)} title={home.label} aria-label={home.label}>
        <BrandMark size={52} gradientId="logo-rail" />
        <SrOnly>{home.label}</SrOnly>
      </LogoBtn>

      <NavScroll>
        {rows.map(item => (
          <NavIconBtn key={item.key} $active={item.active} onClick={() => navigate(item.path)} title={item.label}>
            <MaterialIcon aria-hidden="true">{item.icon}</MaterialIcon>
            <SrOnly>{item.label}</SrOnly>
          </NavIconBtn>
        ))}
      </NavScroll>
    </SidebarRoot>
  );
});
