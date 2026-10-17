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

/* Main column sits to the right of the sidebar (desktop): its own header bar
   + content. On phones/tablets it fills the width; the menu drops down over it. */
const MainColumn = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;

  ${NAV_COMPACT} {
    position: relative;
    z-index: 2;
    background: var(--bg-app);
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
  /* Same as AppTemplate: hide the mobile chrome while a full-view overlay
     (e.g. dashboard Quick Entry) is open so it can fill the whole viewport. */
  const focusMode = useUIStore(s => s.editorFocusMode);
  return (
    <>
      <div data-print-hide><Background /></div>
      {!hideSidebar && !focusMode && <div data-print-hide><MobileChrome /></div>}
      <Layout $focusMode={focusMode}>
        {!hideSidebar && <div data-print-hide><Sidebar /></div>}
        <MainColumn>
          <div data-print-hide><Header /></div>
          <Main $lightBg={isLightBg}>{children}</Main>
        </MainColumn>
      </Layout>
    </>
  );
}
