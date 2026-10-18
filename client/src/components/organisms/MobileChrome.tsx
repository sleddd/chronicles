import styled from 'styled-components';
import { NAV_COMPACT } from '../../styles/breakpoints.js';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../atoms/core/Icon.jsx';
import { useUIStore } from '../../stores/uiStore.js';
import { BrandMark } from '../atoms/BrandMark.js';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { useNavItems } from '../../hooks/useNavItems.js';
import { useEffect } from 'react';

/* Top bar shown only on mobile: logo + menu button. Fixed to the top, in the
   nav rail's toned fill; the menu drops down beneath it. */
const MobileNavBar = styled.div`
  display: none;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-rail);
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
  gap: 8px;
  cursor: pointer;
`;

const Logo = styled.span`
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 300;
  letter-spacing: 0.04em;
  color: var(--text-primary);
`;

const MenuButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-primary);
  padding: 8px;
  margin-right: -8px;
`;

/* The menu: drops down under the bar and fills the screen, full width and
   full height. The destinations sit in its centre as a compact square grid,
   three across — each an icon over its name in small letters. Escape or a
   destination closes it. */
const Panel = styled.nav`
  display: none;

  ${NAV_COMPACT} {
    display: flex;
    align-items: center;
    justify-content: center;
    position: fixed;
    top: 56px;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 51;
    overflow-y: auto;
    padding: 24px 16px calc(24px + env(safe-area-inset-bottom, 0px));
    background: var(--bg-rail);
    animation: navDrop 180ms ease-out;
    @keyframes navDrop { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { animation: none; }
  }
`;

/* The compact square grid in the middle of the menu */
const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 96px);
  gap: 12px;
  margin: auto;
  @media (max-width: 360px) { grid-template-columns: repeat(3, 84px); gap: 8px; }
`;

const NavTile = styled.button<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  aspect-ratio: 1;
  padding: 8px 4px;
  /* The current page = an accent border (icon + name stay neutral, a step
     brighter); hover / press = a grey border. Never a fill. */
  border: 1px solid ${({ $active }) => ($active ? 'var(--color-accent)' : 'transparent')};
  border-radius: var(--r-lg, 6px);
  background: transparent;
  color: ${({ $active }) => ($active ? 'var(--text-primary)' : 'var(--text-secondary)')};
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 120ms, color 120ms;
  /* Touch screens keep :hover after a tap, so hover only applies on real pointers */
  @media (hover: hover) {
    &:hover { border-color: ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--text-secondary)')}; }
  }
  &:active { border-color: ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--text-secondary)')}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
`;

const TileLabel = styled.span`
  font-family: var(--font-sans);
  font-size: 12px;
  line-height: 1.2;
  text-align: center;
`;

const Overlay = styled.div<{ $open: boolean }>`
  display: none;

  ${NAV_COMPACT} {
    display: ${({ $open }) => ($open ? 'block' : 'none')};
    position: fixed;
    inset: 56px 0 0 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 50;
  }
`;

/**
 * Phones/tablets (NAV_COMPACT): the top bar (logo + menu button) and the
 * full-width drop-down menu it opens — a 3-across grid of the same
 * destinations as the desktop rail (`useNavItems`). Open state lives in
 * uiStore (`mobileNavOpen`). Hidden on desktop.
 */
export function MobileChrome() {
  const open = useUIStore(s => s.mobileNavOpen);
  const setOpen = useUIStore(s => s.setMobileNavOpen);
  const navigate = useNavigate();
  const items = useNavItems();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);
  return (
    <>
      <MobileNavBar>
        <LogoContainer onClick={() => { setOpen(false); navigate('/journal', { state: { newEntry: Date.now() } }); }}>
          <BrandMark size={32} gradientId="logo-mobile" />
          <Logo>Chronicles</Logo>
        </LogoContainer>
        <MenuButton onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open} aria-controls="mobile-nav">
          <Icon name={open ? 'x' : 'menu'} size={20} strokeWidth={2} />
        </MenuButton>
      </MobileNavBar>
      <Overlay $open={open} onClick={() => setOpen(false)} />
      {open && (
        <Panel id="mobile-nav" aria-label="Main">
          <Grid>
          {items.map(item => (
            <NavTile key={item.key} type="button" $active={item.active} aria-current={item.active ? 'page' : undefined}
              onClick={() => { setOpen(false); navigate(item.path); }}>
              <MaterialIcon $size={28} aria-hidden="true">{item.icon}</MaterialIcon>
              <TileLabel>{item.label}</TileLabel>
            </NavTile>
          ))}
          </Grid>
        </Panel>
      )}
    </>
  );
}
