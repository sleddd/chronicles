import styled from 'styled-components';
import { NAV_COMPACT } from '../../styles/breakpoints.js';
import type { ReactNode } from 'react';
import { Header } from '../organisms/Header.js';
import { Sidebar } from '../organisms/Sidebar.js';
import { Background } from '../organisms/Background.js';
import { MobileChrome } from '../organisms/MobileChrome.js';
import { useUIStore } from '../../stores/uiStore.js';
import { Wallpaper } from '../organisms/Wallpaper.js';

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

const Main = styled.main`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  min-height: 0;
  /* The wallpaper (when one's chosen) sits under the content, over this background */
  position: relative;
  isolation: isolate;
  /* The page colour token (was the old theme's near-white overlay, which hid
     the light page grey) */
  background: var(--bg-app, ${({ theme }) => theme.colors.background});
  /* Phones: a little more room at the sides on top of each page's own 16px
     gutter, so content never runs close to the screen edge */
  @media (max-width: 768px) { padding-inline: 8px; }
`;

interface ContentTemplateProps {
  children: ReactNode;
  hideSidebar?: boolean;
  /** How far down the wallpaper reaches (default: the dashboard's, down behind the top of the content) */
  wallpaperHeight?: string;
}

/** Full-height template: left sidebar (full height) + main column (header bar + scrollable content). */
export function ContentTemplate({ children, hideSidebar, wallpaperHeight }: ContentTemplateProps) {
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
          <Main><Wallpaper height={wallpaperHeight} />{children}</Main>
        </MainColumn>
      </Layout>
    </>
  );
}
