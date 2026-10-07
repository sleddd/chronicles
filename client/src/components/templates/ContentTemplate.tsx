import styled from 'styled-components';
import { NAV_COMPACT } from '../../styles/breakpoints.js';
import type { ReactNode } from 'react';
import { Header } from '../organisms/Header.js';
import { Sidebar } from '../organisms/Sidebar.js';
import { Background } from '../organisms/Background.js';
import { MobileChrome } from '../organisms/MobileChrome.js';
import { useUIStore } from '../../stores/uiStore.js';
import { BACKGROUND_IMAGES } from '@chronicles/shared';

const Layout = styled.div<{ $focusMode?: boolean }>`
  display: flex;
  flex-direction: row;
  height: 100vh;
  height: 100dvh; /* iOS Safari: 100vh extends behind the bottom toolbar */
  overflow: hidden;

  ${NAV_COMPACT} {
    padding-top: ${({ $focusMode }) => $focusMode ? '0' : '56px'};
  }
`;

/* Main column sits to the right of the sidebar: its own header bar + content.
   On mobile it slides right to reveal the sidebar bar underneath. */
const MainColumn = styled.div<{ $navOpen?: boolean }>`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;

  ${NAV_COMPACT} {
    position: relative;
    z-index: 2;
    background: var(--bg-app);
    transform: translateX(${({ $navOpen }) => ($navOpen ? '240px' : '0')});
    transition: transform 220ms ease-out;
    box-shadow: ${({ $navOpen }) => ($navOpen ? '-2px 0 20px rgba(0,0,0,0.25)' : 'none')};
  }
`;

const Main = styled.main<{ $lightBg?: boolean }>`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  min-height: 0;
  background: ${({ $lightBg, theme }) => $lightBg ? theme.colors.surfaceOverlayLight : theme.colors.surfaceOverlay};
`;

interface ContentTemplateProps {
  children: ReactNode;
  hideSidebar?: boolean;
}

/** Full-height template: left sidebar (full height) + main column (header bar + scrollable content). */
export function ContentTemplate({ children, hideSidebar }: ContentTemplateProps) {
  const backgroundImage = useUIStore(s => s.backgroundImage);
  const isLightBg = BACKGROUND_IMAGES.find(bg => bg.value === backgroundImage)?.light ?? false;
  const navOpen = useUIStore(s => s.mobileNavOpen);
  /* Same as AppTemplate: MainColumn's mobile transform is the containing
     block for fixed full-view overlays (e.g. dashboard Quick Entry), and its
     stacking context sits below the fixed nav bar — hide the mobile chrome
     while an overlay is open so it can fill the whole viewport. */
  const focusMode = useUIStore(s => s.editorFocusMode);
  return (
    <>
      <div data-print-hide><Background /></div>
      {!hideSidebar && !focusMode && <div data-print-hide><MobileChrome /></div>}
      <Layout $focusMode={focusMode}>
        {!hideSidebar && <div data-print-hide><Sidebar /></div>}
        <MainColumn $navOpen={!hideSidebar && navOpen}>
          <div data-print-hide><Header /></div>
          <Main $lightBg={isLightBg}>{children}</Main>
        </MainColumn>
      </Layout>
    </>
  );
}
