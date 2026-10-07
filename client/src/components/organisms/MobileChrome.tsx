import styled from 'styled-components';
import { NAV_COMPACT } from '../../styles/breakpoints.js';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../../design-system/components/core/Icon.jsx';
import { useUIStore } from '../../stores/uiStore.js';

/* Top bar shown only on mobile: logo + hamburger. Fixed to the top. */
const MobileNavBar = styled.div`
  display: none;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-app);
  border-bottom: 1px solid var(--border-subtle);
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

const LogoIcon = styled.svg`
  width: 24px;
  height: 24px;
  stroke: var(--text-primary);
  flex-shrink: 0;
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
          <LogoIcon xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" strokeLinecap="round" strokeLinejoin="round">
            {/* Petal 1 (top) */}
            <g>
              <path strokeWidth="1.1" d="M44,47 C34,42 24,28 28,13 C32,4 48,4 50,8 C52,4 68,4 72,13 C76,28 66,42 56,47 Z"/>
              <path strokeWidth="0.7" d="M50,46 C50,36 50,22 50,10"/>
              <path strokeWidth="0.7" d="M50,36 C48,30 44,24 40,18"/>
              <path strokeWidth="0.7" d="M50,36 C52,30 56,24 60,18"/>
              <path strokeWidth="0.7" d="M50,28 C49,24 47,20 45,16"/>
              <path strokeWidth="0.7" d="M50,28 C51,24 53,20 55,16"/>
            </g>
            {/* Petal 2 */}
            <g transform="rotate(72,50,50)">
              <path strokeWidth="1.1" d="M44,47 C34,42 24,28 28,13 C32,4 48,4 50,8 C52,4 68,4 72,13 C76,28 66,42 56,47 Z"/>
              <path strokeWidth="0.7" d="M50,46 C50,36 50,22 50,10"/>
              <path strokeWidth="0.7" d="M50,36 C48,30 44,24 40,18"/>
              <path strokeWidth="0.7" d="M50,36 C52,30 56,24 60,18"/>
              <path strokeWidth="0.7" d="M50,28 C49,24 47,20 45,16"/>
              <path strokeWidth="0.7" d="M50,28 C51,24 53,20 55,16"/>
            </g>
            {/* Petal 3 */}
            <g transform="rotate(144,50,50)">
              <path strokeWidth="1.1" d="M44,47 C34,42 24,28 28,13 C32,4 48,4 50,8 C52,4 68,4 72,13 C76,28 66,42 56,47 Z"/>
              <path strokeWidth="0.7" d="M50,46 C50,36 50,22 50,10"/>
              <path strokeWidth="0.7" d="M50,36 C48,30 44,24 40,18"/>
              <path strokeWidth="0.7" d="M50,36 C52,30 56,24 60,18"/>
              <path strokeWidth="0.7" d="M50,28 C49,24 47,20 45,16"/>
              <path strokeWidth="0.7" d="M50,28 C51,24 53,20 55,16"/>
            </g>
            {/* Petal 4 */}
            <g transform="rotate(216,50,50)">
              <path strokeWidth="1.1" d="M44,47 C34,42 24,28 28,13 C32,4 48,4 50,8 C52,4 68,4 72,13 C76,28 66,42 56,47 Z"/>
              <path strokeWidth="0.7" d="M50,46 C50,36 50,22 50,10"/>
              <path strokeWidth="0.7" d="M50,36 C48,30 44,24 40,18"/>
              <path strokeWidth="0.7" d="M50,36 C52,30 56,24 60,18"/>
              <path strokeWidth="0.7" d="M50,28 C49,24 47,20 45,16"/>
              <path strokeWidth="0.7" d="M50,28 C51,24 53,20 55,16"/>
            </g>
            {/* Petal 5 */}
            <g transform="rotate(288,50,50)">
              <path strokeWidth="1.1" d="M44,47 C34,42 24,28 28,13 C32,4 48,4 50,8 C52,4 68,4 72,13 C76,28 66,42 56,47 Z"/>
              <path strokeWidth="0.7" d="M50,46 C50,36 50,22 50,10"/>
              <path strokeWidth="0.7" d="M50,36 C48,30 44,24 40,18"/>
              <path strokeWidth="0.7" d="M50,36 C52,30 56,24 60,18"/>
              <path strokeWidth="0.7" d="M50,28 C49,24 47,20 45,16"/>
              <path strokeWidth="0.7" d="M50,28 C51,24 53,20 55,16"/>
            </g>
            {/* Seed pod center */}
            <circle cx="50" cy="50" r="9" strokeWidth="1.1"/>
            {/* Stamen ring */}
            <g strokeWidth="1">
              <line x1="50" y1="39" x2="50" y2="36"/>
              <line transform="rotate(36,50,50)"  x1="50" y1="39" x2="50" y2="36"/>
              <line transform="rotate(72,50,50)"  x1="50" y1="39" x2="50" y2="36"/>
              <line transform="rotate(108,50,50)" x1="50" y1="39" x2="50" y2="36"/>
              <line transform="rotate(144,50,50)" x1="50" y1="39" x2="50" y2="36"/>
              <line transform="rotate(180,50,50)" x1="50" y1="39" x2="50" y2="36"/>
              <line transform="rotate(216,50,50)" x1="50" y1="39" x2="50" y2="36"/>
              <line transform="rotate(252,50,50)" x1="50" y1="39" x2="50" y2="36"/>
              <line transform="rotate(288,50,50)" x1="50" y1="39" x2="50" y2="36"/>
              <line transform="rotate(324,50,50)" x1="50" y1="39" x2="50" y2="36"/>
            </g>
            {/* Center dot */}
            <circle cx="50" cy="50" r="2.5" fill="var(--text-primary)" stroke="none"/>
          </LogoIcon>
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
