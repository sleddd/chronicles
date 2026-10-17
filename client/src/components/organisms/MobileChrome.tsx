import styled from 'styled-components';
import { NAV_COMPACT } from '../../styles/breakpoints.js';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../atoms/core/Icon.jsx';
import { useUIStore } from '../../stores/uiStore.js';
import { BrandMark } from '../atoms/BrandMark.js';

/* Top bar shown only on mobile: logo + hamburger. Fixed to the top. Same toned
   fill as the nav rail (it opens beneath it), separated by fill, not a rule. */
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

/* Tap-catcher over the slid-right main content (sits above it, beside the
   revealed bar) so tapping the content closes the menu. */
const Overlay = styled.div<{ $open: boolean }>`
  display: none;

  ${NAV_COMPACT} {
    display: ${({ $open }) => ($open ? 'block' : 'none')};
    position: fixed;
    top: 56px;
    right: 0;
    bottom: 0;
    left: 240px;
    background: rgba(0, 0, 0, 0.25);
    z-index: 3;
  }
`;

/**
 * Mobile-only top bar (logo + hamburger) plus the dimming overlay for the
 * slide-out sidebar drawer. Drawer open-state lives in uiStore so the single
 * Sidebar rendered by the template can react to it — no second Sidebar, no
 * prop threading through each template. All pieces are hidden on desktop via
 * a max-width: 768px media query.
 */
export function MobileChrome() {
  const open = useUIStore(s => s.mobileNavOpen);
  const setOpen = useUIStore(s => s.setMobileNavOpen);
  const navigate = useNavigate();
  return (
    <>
      <MobileNavBar>
        <LogoContainer onClick={() => { setOpen(false); navigate('/'); }}>
          <BrandMark size={32} gradientId="logo-mobile" />
          <Logo>Chronicles</Logo>
        </LogoContainer>
        <MenuButton onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'}>
          <Icon name={open ? 'x' : 'menu'} size={20} strokeWidth={2} />
        </MenuButton>
      </MobileNavBar>
      <Overlay $open={open} onClick={() => setOpen(false)} />
    </>
  );
}
